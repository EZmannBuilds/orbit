// Orbit Axis :: Ask Orbit language-provider boundary tests (Update 4.0.1).
//
// Unit tests use stub providers. The final test is a LIVE Ollama test that
// skips automatically when Ollama isn't reachable or the configured model isn't
// installed, so `npm test` stays green without a local model.
//
// Regression cover for two bugs found by live testing in Update 4.0.1:
//   1. provider.generate() defaulted to format:"json", so Ask Orbit never
//      received prose and silently fell back to the deterministic answer.
//   2. Model output containing HTML was sanitized-then-accepted instead of
//      being rejected outright.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAskContext } from "../lib/ask-orbit/context-engine.js";
import { generateAskAnswer } from "../lib/ask-orbit/ask-provider.js";
import { presentAnswer, renderPlanForModel } from "../lib/ask-orbit/presenter.js";
import { OllamaProvider } from "../lib/local-llm/ollama.js";
import { createLocalLLMProvider } from "../lib/local-llm/provider.js";

function chartFixture() {
  return {
    time_known: true, time_accuracy: "exact",
    planets: {
      Sun: { sign: "Leo", degrees: 15, minutes: 0, longitude: 135, speed: 1, retrograde: false },
      Moon: { sign: "Scorpio", degrees: 3, minutes: 0, longitude: 213, speed: 13, retrograde: false },
      Venus: { sign: "Gemini", degrees: 20, minutes: 0, longitude: 80, speed: 1.1, retrograde: false },
      Saturn: { sign: "Pisces", degrees: 12, minutes: 0, longitude: 342, speed: -0.02, retrograde: true },
    },
    planet_houses: { Sun: 10, Moon: 1, Venus: 8, Saturn: 5 },
    big_three: { sun: { sign: "Leo" }, moon: { sign: "Scorpio" }, rising: { sign: "Scorpio", degrees: 0, minutes: 0 } },
    angles: { ascendant: { sign: "Scorpio" }, midheaven: { sign: "Leo" } },
    aspects: [{ a: "Venus", b: "Saturn", aspect: "Trine", orb: 0.5, exactAngle: 120 }],
    element_balance: { dominant: "Water", percentages: {} },
    modality_balance: { dominant: "Fixed", percentages: {} },
    chart_ruler: "Mars", retrogrades: ["Saturn"], warnings: [], calculation_status: "complete",
  };
}
function ctxFixture(question = "What does my Venus placement say about relationships?") {
  const chart = chartFixture();
  const active = { profile: { id: "synthetic", nickname: "Synthetic" }, chart };
  return { ctx: buildAskContext({ active, sky: null, detailMode: "Simple", question }), chart };
}
const stub = (text, { ok = true, status = "ok" } = {}) => ({
  calls: [],
  async health() { return { reachable: true, model_available: true }; },
  async generate(req) { this.calls.push(req); return { ok, status, text }; },
});

// ── Provider request shape ───────────────────────────────────────────────────
test("Ask Orbit asks the provider for prose, not the default JSON envelope", async () => {
  const { ctx, chart } = ctxFixture();
  const p = stub("A perfectly reasonable prose answer that is long enough to pass validation.");
  await generateAskAnswer(ctx, chart, { provider: p, useModel: true });
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].format, "text", "must opt out of the JSON default (Update 4.0.1 regression)");
});

test("OllamaProvider omits `format` for prose callers and keeps JSON for structured ones", async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "test-model", size: 1, digest: "d", modified_at: "now" }] }), { status: 200 });
    }
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 });
  };
  try {
    const p = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", model: "test-model" });
    await p.generate({ prompt: "x", format: "text" });
    assert.equal("format" in bodies[0], false, "prose callers send no format field");
    await p.generate({ prompt: "x" });
    assert.equal(bodies[1].format, "json", "structured callers still default to JSON");
    assert.equal(bodies[0].think, false, "thinking stays disabled");
  } finally { globalThis.fetch = realFetch; }
});

// ── Output validation (reject, don't sanitize) ───────────────────────────────
const REJECTED = [
  ["HTML/script", '<script>alert(1)</script><b>hi</b> this is long enough to pass the length check easily'],
  ["stray markup", '<div>this is a long enough answer to pass the minimum length requirement here</div>'],
  ["JSON blob", '{ "answer": "this is a long enough json answer to pass the length check for sure" }'],
  ["JSON array", '[ "this is a long enough json array answer to pass the length check for sure" ]'],
  ["code fence", '```js\nconsole.log("long enough to pass the minimum length requirement here")\n```'],
  ["too short", "ok"],
  ["empty", "   "],
];
for (const [name, text] of REJECTED) {
  test(`model output rejected: ${name} → deterministic answer`, async () => {
    const { ctx, chart } = ctxFixture();
    const out = await generateAskAnswer(ctx, chart, { provider: stub(text), useModel: true });
    assert.equal(out.provider, "deterministic", `${name} must be rejected, not sanitized`);
    assert.ok(out.answer.direct.length > 0, "a complete answer is still returned");
  });
}

test("a <think> block is stripped and the remaining prose is accepted", async () => {
  const { ctx, chart } = ctxFixture();
  const text = "<think>internal reasoning that must never be shown</think>\nVenus in Gemini colors how you connect, and it is worth noticing this week.";
  const out = await generateAskAnswer(ctx, chart, { provider: stub(text), useModel: true });
  assert.equal(out.provider, "ollama");
  assert.ok(!/think|internal reasoning/i.test(out.wordedText), "hidden reasoning is never surfaced");
  assert.match(out.wordedText, /Venus in Gemini/);
});

test("an over-long model answer is rejected", async () => {
  const { ctx, chart } = ctxFixture();
  const out = await generateAskAnswer(ctx, chart, { provider: stub("word ".repeat(3000)), useModel: true });
  assert.equal(out.provider, "deterministic");
});

// ── Fallback paths ───────────────────────────────────────────────────────────
test("provider offline → deterministic answer with a note", async () => {
  const { ctx, chart } = ctxFixture();
  const offline = { async health() { return { reachable: false, model_available: false }; }, async generate() { throw new Error("must not be called"); } };
  const out = await generateAskAnswer(ctx, chart, { provider: offline, useModel: true });
  assert.equal(out.provider, "deterministic");
  assert.equal(out.providerNote, "language_model_unavailable");
});

test("provider throws → deterministic answer, error never surfaced to the user", async () => {
  const { ctx, chart } = ctxFixture();
  const boom = { async health() { return { reachable: true, model_available: true }; }, async generate() { throw new Error("connection reset by peer"); } };
  const out = await generateAskAnswer(ctx, chart, { provider: boom, useModel: true });
  assert.equal(out.provider, "deterministic");
  assert.equal(out.providerNote, "model_error");
  assert.ok(!/connection reset/i.test(JSON.stringify(out)), "raw provider errors are not leaked");
});

test("provider timeout status → deterministic answer", async () => {
  const { ctx, chart } = ctxFixture();
  const slow = { async health() { return { reachable: true, model_available: true }; }, async generate() { return { ok: false, status: "timeout", text: "" }; } };
  const out = await generateAskAnswer(ctx, chart, { provider: slow, useModel: true });
  assert.equal(out.provider, "deterministic");
  assert.equal(out.providerNote, "timeout");
});

// ── The model may never touch the evidence ───────────────────────────────────
test("a successful reword cannot replace or mutate the evidence", async () => {
  const { ctx, chart } = ctxFixture();
  const deterministic = presentAnswer(ctx, chart);
  const sneaky = stub("Your Mars in Capricorn squares your natal Uranus at 3 degrees, which is a completely invented claim.");
  const out = await generateAskAnswer(ctx, chart, { provider: sneaky, useModel: true });
  assert.equal(out.provider, "ollama");
  assert.deepEqual(out.evidence, deterministic.evidence, "evidence comes from the engine, never the model");
  assert.deepEqual(out.themes, deterministic.themes);
});

// ── What is (and isn't) sent to the provider ─────────────────────────────────
test("only the answer plan and selected evidence reach the provider", () => {
  const { ctx, chart } = ctxFixture();
  const grounding = renderPlanForModel(ctx, chart);
  assert.ok(!/longitude|"speed"|calculation_status|planet_houses|element_balance/.test(grounding), "no raw chart dump");
  assert.ok(!/eyJ[A-Za-z0-9_-]{10}|service_role|SUPABASE|apikey|Bearer |supabase\.co/i.test(grounding), "no tokens or Supabase config");
  assert.ok(!/owner_id|access_token|@example\.|password/i.test(grounding), "no account data");
  assert.match(grounding, /Evidence \(use only these facts/, "evidence is the grounding");
});

// ── LIVE Ollama (skipped when unavailable) ───────────────────────────────────
test("LIVE: a real local model reword returns prose and leaves evidence intact", async (t) => {
  if (process.env.ORBIT_TEST_LIVE_OLLAMA === "false") return t.skip("live Ollama test disabled");
  const provider = createLocalLLMProvider();
  let health = null;
  try { health = await provider.health(); } catch { health = null; }
  if (!health?.reachable || !(health.model_available ?? health.installed_model)) {
    return t.skip(`Ollama not reachable or configured model not installed (configured=${health?.configured_model ?? "none"})`);
  }
  const { ctx, chart } = ctxFixture();
  const deterministic = presentAnswer(ctx, chart);
  const out = await generateAskAnswer(ctx, chart, { provider, useModel: true, timeoutMs: 120000 });
  // Either the model produced valid prose, or it fell back safely — both are OK,
  // but the evidence must be identical either way.
  assert.deepEqual(out.evidence, deterministic.evidence, "live model never mutates evidence");
  if (out.provider === "ollama") {
    assert.ok(out.wordedText.length > 40, "live prose returned");
    assert.ok(!/<[a-z!/][^>]*>/i.test(out.wordedText), "no markup in live output");
    assert.ok(!/```|\{\s*"/.test(out.wordedText), "no code/JSON in live output");
  }
});
