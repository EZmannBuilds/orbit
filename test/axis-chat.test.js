// Orbit Axis :: Update Two — fast deterministic path, fallback, validation, health cache.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateChatInput, fastAnswer, fallbackAnswer, FALLBACK_NOTICE,
  cachedHealth, resetHealthCache, MAX_MESSAGE_CHARS,
} from "../lib/local-llm/axis-chat.js";

const FACTS = {
  detailLevel: "Simple",
  health: { reachable: true, model_available: true },
  chart: { nickname: "My Chart", sun: "Taurus", moon: "Cancer", rising: "Libra", timeKnown: true },
  sky: { season: "Cancer", sunSign: "Cancer", moonSign: "Aquarius", moonPhase: "Waxing Gibbous", moonIllum: 78, retrogrades: ["Mercury"] },
};

// ── Validation ───────────────────────────────────────────────────────────────
test("validateChatInput rejects empty and oversized messages", () => {
  assert.equal(validateChatInput({ message: "" }).ok, false);
  assert.equal(validateChatInput({ message: "   " }).ok, false);
  assert.equal(validateChatInput({ message: "x".repeat(MAX_MESSAGE_CHARS + 1) }).ok, false);
  assert.equal(validateChatInput({ message: "hi" }).ok, true);
});

test("validateChatInput rejects an over-long conversation", () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({ role: "user", content: `m${i}` }));
  assert.equal(validateChatInput({ message: "hi", messages }).ok, false);
});

// ── Fast deterministic path ──────────────────────────────────────────────────
test("fast path: detail mode question uses verified state", () => {
  const a = fastAnswer("Which detail mode am I using?", FACTS);
  assert.equal(a.path, "fast");
  assert.match(a.text, /Simple detail mode/);
});

test("fast path: Moon phase question uses verified sky", () => {
  const a = fastAnswer("What moon phase is it?", FACTS);
  assert.equal(a.intent, "moon_phase");
  assert.match(a.text, /Waxing Gibbous/);
});

test("fast path: Sun sign question uses verified chart", () => {
  const a = fastAnswer("what is my sun sign?", FACTS);
  assert.equal(a.intent, "big_three");
  assert.match(a.text, /Taurus/);
});

test("fast path: active-chart question", () => {
  const a = fastAnswer("what chart am I viewing?", FACTS);
  assert.match(a.text, /My Chart/);
});

test("fast path: birth-time-known question", () => {
  assert.match(fastAnswer("is my birth time known?", FACTS).text, /known/);
});

test("fast path: Ollama status question reflects health", () => {
  assert.match(fastAnswer("is ollama online?", FACTS).text, /online/i);
  const down = fastAnswer("is ollama online?", { ...FACTS, health: { reachable: false } });
  assert.match(down.text, /offline|verified chart data/i);
});

test("fast path returns null for interpretive questions (routes to Ollama)", () => {
  assert.equal(fastAnswer("What does my Venus in Gemini mean for my creativity?", FACTS), null);
  assert.equal(fastAnswer("Give me a reflection on today's sky", FACTS), null);
});

// ── Deterministic fallback ───────────────────────────────────────────────────
test("fallback returns quickly, uses verified data, shows the notice, invents nothing", () => {
  const fb = fallbackAnswer("What does my chart say about love?", FACTS);
  assert.equal(fb.path, "fallback");
  assert.equal(fb.notice, FALLBACK_NOTICE);
  assert.match(fb.text, /Taurus/);          // verified placement
  assert.match(fb.text, /Waxing Gibbous/);  // verified sky
  assert.match(fb.text, /can't reach the local model/i);
  // No fabricated prediction language.
  assert.doesNotMatch(fb.text, /you will|destined|guaranteed/i);
});

test("fallback still answers a factual question via the fast path", () => {
  const fb = fallbackAnswer("what is my moon sign?", FACTS);
  assert.match(fb.text, /Cancer/);
  assert.equal(fb.notice, FALLBACK_NOTICE);
});

test("fallback does not fabricate placements when no chart is active", () => {
  const fb = fallbackAnswer("what's my rising sign?", { ...FACTS, chart: null });
  assert.match(fb.text, /no (active )?chart/i);
});

// ── Bounded health cache ─────────────────────────────────────────────────────
test("cachedHealth calls the provider once within the TTL, then refreshes", async () => {
  resetHealthCache();
  let calls = 0;
  const provider = { async health() { calls += 1; return { reachable: true }; } };
  const t = 1_000_000;
  await cachedHealth(provider, 5000, t);
  await cachedHealth(provider, 5000, t + 1000); // within TTL → cached
  assert.equal(calls, 1);
  await cachedHealth(provider, 5000, t + 6000); // past TTL → refresh
  assert.equal(calls, 2);
});
