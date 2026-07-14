// Orbit Axis :: Update Two — compact chat-context builder, budget, privacy, caches.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_BUDGET, normalizeChartFacts, normalizeSkyFacts,
  compactChartSummary, compactSkySummary, buildChatPrompt, selectRecentMessages,
  chartSummaryCache, skySummaryCache, chartCacheKey, skyCacheKey,
  invalidateOwnerChart,
} from "../lib/local-llm/chat-context.js";

// A saved active chart including PRIVATE fields that must never reach the model.
const ACTIVE = {
  profile: {
    id: "chart-1", nickname: "My Chart",
    first_name: "Ada", last_name: "Lovelace",
    email: "ada@example.com", user_id: "user-123",
    latitude: 51.5074, longitude: -0.1278,
    geo_place_id: "geoapify:abc123", timezone_name: "Europe/London",
    time_accuracy: "exact",
  },
  chart: {
    time_known: true,
    big_three: {
      sun: { sign: "Taurus", degrees: 15, minutes: 3 },
      moon: { sign: "Cancer", degrees: 2, minutes: 41 },
      rising: { sign: "Libra", degrees: 20, minutes: 9 },
    },
    planets: { Venus: { sign: "Gemini", degrees: 4, minutes: 0, retrograde: false } },
    aspects: [{ a: "Sun", b: "Moon", aspect: "Trine", orb: 1.2 }],
    element_balance: { dominant: "Water" },
  },
  summary: { sun: "Taurus", moon: "Cancer", rising: "Libra", time_known: true },
};

const SKY = {
  sky_version: "sky-v1", snapshot_hash: "hash-abc", zodiac_season: "Cancer",
  sun: { sign: "Cancer", degrees: 21, minutes: 5 },
  moon: { sign: "Aquarius", degrees: 9, minutes: 12, phase_name: "Waxing Gibbous", illumination_percent: 78.4, waxing: true },
  retrogrades: ["Mercury"],
};

test("chart facts include only allow-listed fields (privacy boundary)", () => {
  const facts = normalizeChartFacts(ACTIVE);
  const serialized = JSON.stringify(facts);
  assert.ok(!/Lovelace/.test(serialized), "last name excluded");
  assert.ok(!/ada@example\.com/.test(serialized), "email excluded");
  assert.ok(!/user-123/.test(serialized), "user id excluded");
  assert.ok(!/51\.5074|-0\.1278/.test(serialized), "coordinates excluded");
  assert.ok(!/geoapify|abc123/.test(serialized), "provider place id excluded");
  assert.ok(!/Europe\/London/.test(serialized), "timezone db field excluded");
  assert.equal(facts.firstName, "Ada"); // first name only, allowed
  assert.equal(facts.sun, "Taurus");
});

test("only the active chart is represented (never a list of saved charts)", () => {
  const facts = normalizeChartFacts(ACTIVE);
  assert.equal(typeof facts, "object");
  assert.ok(!Array.isArray(facts));
  assert.equal(facts.nickname, "My Chart");
});

test("Simple summary hides degrees/aspects; Advanced reveals them", () => {
  const facts = normalizeChartFacts(ACTIVE);
  const simple = compactChartSummary(facts, "Simple");
  const advanced = compactChartSummary(facts, "Advanced");
  assert.doesNotMatch(simple, /°/);
  assert.doesNotMatch(simple, /Trine/);
  assert.match(advanced, /15°03′/);
  assert.match(advanced, /Sun Trine Moon/);
  // Neither leaks private data.
  for (const s of [simple, advanced]) {
    assert.doesNotMatch(s, /Lovelace|ada@example|51\.5074|geoapify|Europe\/London/);
  }
});

test("sky summary carries Moon phase + retrogrades; Advanced adds degrees", () => {
  const sky = normalizeSkyFacts(SKY);
  const simple = compactSkySummary(sky, "Simple");
  assert.match(simple, /Waxing Gibbous/);
  assert.match(simple, /Mercury/);
  assert.doesNotMatch(simple, /°/);
  assert.match(compactSkySummary(sky, "Advanced"), /°/);
});

test("recent-message window is bounded and keeps the current message", () => {
  const many = [];
  for (let i = 0; i < 20; i++) many.push({ role: i % 2 ? "assistant" : "user", content: `msg ${i}` });
  const kept = selectRecentMessages(many);
  assert.ok(kept.length <= CONTEXT_BUDGET.maxRecentMessages);
  assert.equal(kept[kept.length - 1].content, "msg 19"); // current message retained
});

test("oldest greetings/disclaimers are dropped before recent turns", () => {
  const msgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "This is symbolic reflection, not prediction." },
    { role: "user", content: "What is my Moon sign?" },
    { role: "assistant", content: "Your Moon is in Cancer." },
    { role: "user", content: "And my Venus?" },
  ];
  const kept = selectRecentMessages(msgs);
  const joined = kept.map((m) => m.content).join(" | ");
  assert.doesNotMatch(joined, /^hi\b/);
  assert.match(joined, /And my Venus\?$/);
});

test("per-message and total prompt budgets are enforced", () => {
  const huge = "x".repeat(5000);
  const prompt = buildChatPrompt({
    chartFacts: normalizeChartFacts(ACTIVE),
    skyFacts: normalizeSkyFacts(SKY),
    detailLevel: "Simple",
    messages: [{ role: "user", content: huge }],
  });
  const userMsg = prompt.messages[prompt.messages.length - 1];
  assert.ok(userMsg.content.length <= CONTEXT_BUDGET.maxMessageChars);
  assert.ok(prompt.stats.context_chars <= CONTEXT_BUDGET.maxTotalPromptChars);
  // System prompt must not contain the raw private fields.
  assert.doesNotMatch(prompt.messages[0].content, /Lovelace|ada@example|geoapify/);
});

// ── Caches + invalidation ────────────────────────────────────────────────────
test("summary cache hits on repeat and misses on detail-mode change", () => {
  chartSummaryCache.clear();
  const facts = normalizeChartFacts(ACTIVE);
  const keySimple = chartCacheKey({ ownerId: "o", chartId: "chart-1", inputHash: "h1", detailLevel: "Simple" });
  const v1 = chartSummaryCache.set(keySimple, compactChartSummary(facts, "Simple"));
  assert.equal(chartSummaryCache.get(keySimple), v1); // hit
  const keyAdvanced = chartCacheKey({ ownerId: "o", chartId: "chart-1", inputHash: "h1", detailLevel: "Advanced" });
  assert.equal(chartSummaryCache.get(keyAdvanced), undefined); // detail change → miss
});

test("cache key changes on active-chart change and on chart edit (input hash)", () => {
  const a = chartCacheKey({ ownerId: "o", chartId: "chart-1", inputHash: "h1", detailLevel: "Simple" });
  const differentChart = chartCacheKey({ ownerId: "o", chartId: "chart-2", inputHash: "h1", detailLevel: "Simple" });
  const editedChart = chartCacheKey({ ownerId: "o", chartId: "chart-1", inputHash: "h2", detailLevel: "Simple" });
  assert.notEqual(a, differentChart);
  assert.notEqual(a, editedChart);
});

test("sky cache invalidates when the snapshot hash changes (expiry)", () => {
  skySummaryCache.clear();
  const k1 = skyCacheKey({ skyVersion: "sky-v1", snapshotHash: "hash-abc", detailLevel: "Simple" });
  skySummaryCache.set(k1, "old sky");
  const k2 = skyCacheKey({ skyVersion: "sky-v1", snapshotHash: "hash-xyz", detailLevel: "Simple" });
  assert.equal(skySummaryCache.get(k2), undefined);
});

test("invalidateOwnerChart clears cached summaries for that owner/chart", () => {
  chartSummaryCache.clear();
  const key = chartCacheKey({ ownerId: "owner-9", chartId: "chart-1", inputHash: "h1", detailLevel: "Simple" });
  chartSummaryCache.set(key, "cached");
  invalidateOwnerChart("owner-9", "chart-1");
  assert.equal(chartSummaryCache.get(key), undefined);
});
