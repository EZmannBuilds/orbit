// Orbit Axis :: Ask Orbit context engine + presenter + service tests (Update 4.0).
// Deterministic, no network, no Ollama. Fixtures are plain chart/sky objects in
// the shape produced by natal.js / current-sky.js.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyQuestion, mentionedBody, mentionedHouse, birthTimeReliability,
  selectEvidence, buildAskContext, ASK_ENGINE_VERSION,
} from "../lib/ask-orbit/context-engine.js";
import { presentAnswer, evidenceLabel } from "../lib/ask-orbit/presenter.js";
import { suggestedQuestions } from "../lib/ask-orbit/suggestions.js";
import { createAskService, validateQuestion, AskError } from "../lib/ask-orbit/service.js";
import { createMemoryAskStore } from "../lib/ask-orbit/store.js";

// ── fixtures ─────────────────────────────────────────────────────────────────
function planetSet() {
  return {
    Sun: { sign: "Leo", degrees: 15, minutes: 0, longitude: 135, speed: 1, retrograde: false },
    Moon: { sign: "Scorpio", degrees: 3, minutes: 0, longitude: 213, speed: 13, retrograde: false },
    Mercury: { sign: "Virgo", degrees: 2, minutes: 0, longitude: 152, speed: 1.2, retrograde: false },
    Venus: { sign: "Gemini", degrees: 20, minutes: 0, longitude: 80, speed: 1.1, retrograde: false },
    Mars: { sign: "Aries", degrees: 10, minutes: 0, longitude: 10, speed: 0.6, retrograde: false },
    Jupiter: { sign: "Taurus", degrees: 5, minutes: 0, longitude: 35, speed: 0.1, retrograde: false },
    Saturn: { sign: "Pisces", degrees: 12, minutes: 0, longitude: 342, speed: -0.02, retrograde: true },
    Uranus: { sign: "Taurus", degrees: 22, minutes: 0, longitude: 52, speed: 0.03, retrograde: false },
    Neptune: { sign: "Pisces", degrees: 27, minutes: 0, longitude: 357, speed: -0.01, retrograde: true },
    Pluto: { sign: "Aquarius", degrees: 1, minutes: 0, longitude: 301, speed: 0.01, retrograde: false },
  };
}
function chartExact() {
  return {
    time_known: true, time_accuracy: "exact",
    planets: planetSet(),
    planet_houses: { Sun: 10, Moon: 1, Mercury: 11, Venus: 8, Mars: 6, Jupiter: 8, Saturn: 5, Uranus: 8, Neptune: 5, Pluto: 4 },
    big_three: { sun: { sign: "Leo" }, moon: { sign: "Scorpio" }, rising: { sign: "Scorpio", degrees: 0, minutes: 0 } },
    angles: { ascendant: { sign: "Scorpio" }, midheaven: { sign: "Leo" } },
    aspects: [
      { a: "Venus", b: "Saturn", aspect: "Trine", orb: 0.5, exactAngle: 120 },
      { a: "Mercury", b: "Mars", aspect: "Sextile", orb: 2.0, exactAngle: 60 },
      { a: "Sun", b: "Moon", aspect: "Square", orb: 5.2, exactAngle: 90 },
    ],
    element_balance: { dominant: "Water", percentages: {} },
    modality_balance: { dominant: "Fixed", percentages: {} },
    chart_ruler: "Mars", retrogrades: ["Saturn"], warnings: [], calculation_status: "complete",
  };
}
function chartUnknown() {
  const c = chartExact();
  c.time_known = false; c.time_accuracy = "unknown";
  c.planet_houses = {};
  c.big_three.rising = { unavailable: true, reason: "Birth time required" };
  c.angles = { ascendant: null, midheaven: null };
  c.aspects = [
    { a: "Venus", b: "Saturn", aspect: "Trine", orb: 0.5, exactAngle: 120 },
    { a: "Sun", b: "Moon", aspect: "Square", orb: 5.2, exactAngle: 90 },
  ];
  c.warnings = ["birth_time_unknown", "houses_unavailable", "rising_unavailable", "moon_approximate"];
  c.calculation_status = "partial";
  return c;
}
function skyFixture() {
  return {
    sky_version: "sky-v1", zodiac_season: "Cancer",
    sun: { sign: "Cancer", degrees: 25, minutes: 0, longitude: 115 },
    moon: { sign: "Pisces", degrees: 10, minutes: 0, longitude: 340, phase_name: "Waxing Gibbous", illumination_percent: 78, waxing: true },
    retrogrades: ["Saturn", "Neptune"],
    planets: {
      Sun: { sign: "Cancer", longitude: 115, speed: 1 },
      Moon: { sign: "Pisces", longitude: 340, speed: 13 },
      Mercury: { sign: "Cancer", longitude: 120, speed: 1.2 },
      Venus: { sign: "Gemini", longitude: 82, speed: 1.1 },
      Mars: { sign: "Aries", longitude: 12, speed: 0.5 },
      Jupiter: { sign: "Taurus", longitude: 36, speed: 0.1 },
      Saturn: { sign: "Pisces", longitude: 343, speed: -0.02 },
    },
    snapshot_hash: "test-hash",
  };
}

// ── classification ───────────────────────────────────────────────────────────
test("classifyQuestion: relationships + natal placement", () => {
  const t = classifyQuestion("What does my Venus placement say about relationships?");
  assert.ok(t.includes("relationships"));
  assert.ok(t.includes("natal-placement"));
});
test("classifyQuestion: career/purpose", () => {
  assert.ok(classifyQuestion("What area is Saturn asking me to develop in my career?").includes("career-purpose"));
});
test("classifyQuestion: current transit + timing", () => {
  const t = classifyQuestion("How is the current sky affecting me and when will it pass?");
  assert.ok(t.includes("current-transit"));
  assert.ok(t.includes("timing"));
});
test("classifyQuestion: defaults to general-daily", () => {
  assert.deepEqual(classifyQuestion("hello orbit"), ["general-daily"]);
});
test("classifyQuestion: stable canonical ordering", () => {
  const a = classifyQuestion("relationships and career and feelings");
  const b = classifyQuestion("feelings and career and relationships");
  assert.deepEqual(a, b, "order is canonical regardless of phrasing");
});
test("mentionedBody / mentionedHouse", () => {
  assert.equal(mentionedBody("tell me about my Saturn"), "Saturn");
  assert.equal(mentionedBody("what about my rising?"), "Ascendant");
  assert.equal(mentionedBody("nothing here"), null);
  assert.equal(mentionedHouse("what rules my 7th house?"), 7);
  assert.equal(mentionedHouse("the tenth house"), 10);
  assert.equal(mentionedHouse("no house mentioned by number"), null);
});

// ── evidence selection + ranking ─────────────────────────────────────────────
test("selectEvidence: exact aspects rank above wide aspects", () => {
  const chart = chartExact();
  const ev = selectEvidence({ chart, sky: null, transits: [], questionTypes: ["aspect-pattern"], question: "explain my strongest chart pattern", reliability: "exact", limit: 10 });
  const aspects = ev.filter((e) => e.type === "natal-aspect");
  const tight = aspects.find((a) => a.a === "Venus" && a.b === "Saturn");
  const wide = aspects.find((a) => a.a === "Sun" && a.b === "Moon");
  assert.ok(tight && wide, "both aspects present");
  assert.ok(tight.relevance > wide.relevance, "tighter orb ranks higher");
});

test("selectEvidence: major natal points outrank outer planets for a natal question", () => {
  const chart = chartExact();
  const ev = selectEvidence({ chart, sky: null, transits: [], questionTypes: ["natal-placement"], question: "what does my chart say about me", reliability: "exact", limit: 12 });
  const sun = ev.find((e) => e.type === "natal-placement" && e.body === "Sun");
  const pluto = ev.find((e) => e.type === "natal-placement" && e.body === "Pluto");
  assert.ok(sun.relevance > pluto.relevance, "Sun outranks Pluto");
});

test("selectEvidence: unknown birth time removes houses and Rising", () => {
  const chart = chartUnknown();
  const ev = selectEvidence({ chart, sky: null, transits: [], questionTypes: ["natal-placement", "house-topic"], question: "what house rules my career?", reliability: "unknown", limit: 20 });
  assert.equal(ev.filter((e) => e.type === "natal-angle").length, 0, "no Rising/angle evidence");
  assert.ok(ev.every((e) => e.house === undefined), "no house numbers on any evidence");
  // Planetary signs still present.
  assert.ok(ev.some((e) => e.type === "natal-placement" && e.body === "Venus" && e.sign === "Gemini"));
});

test("selectEvidence: approximate time keeps houses (used with caution elsewhere)", () => {
  const chart = chartExact(); chart.time_accuracy = "approximate";
  const ev = selectEvidence({ chart, sky: null, transits: [], questionTypes: ["natal-placement"], question: "my chart", reliability: "approximate", limit: 12 });
  assert.ok(ev.some((e) => e.type === "natal-placement" && e.house != null), "houses still available on approximate time");
});

test("selectEvidence: no fabricated values — every field traces to the input", () => {
  const chart = chartExact();
  const sky = skyFixture();
  const ctx = buildAskContext({ active: { profile: { id: "p1", nickname: "Me" }, chart }, sky, detailMode: "Advanced", question: "how is the sky affecting my Venus today?" });
  for (const e of ctx.evidence) {
    if (e.type === "natal-placement") {
      assert.equal(e.sign, chart.planets[e.body].sign, `${e.body} sign matches chart`);
      if (e.house !== undefined) assert.equal(e.house, chart.planet_houses[e.body]);
    }
    if (e.type === "current-transit") {
      assert.ok(sky.planets[e.transitingBody], "transiting body exists in sky");
      assert.ok(chart.planets[e.natalBody], "natal body exists in chart");
      assert.ok(e.orb <= 3, "transit within orb limit");
    }
    if (e.type === "current-sky" && e.subtype === "moon") {
      assert.equal(e.sign, sky.moon.sign);
    }
  }
});

test("buildAskContext: current-sky failure falls back to natal only + limitation", () => {
  const chart = chartExact();
  const ctx = buildAskContext({ active: { profile: { id: "p1", nickname: "Me" }, chart }, sky: null, detailMode: "Simple", question: "how is the current sky affecting me?" });
  assert.equal(ctx.evidence.filter((e) => e.type === "current-transit").length, 0, "no transits without sky");
  assert.equal(ctx.evidence.filter((e) => e.type === "current-sky").length, 0, "no current-sky evidence");
  assert.ok(ctx.limitations.some((l) => l.type === "current-sky"), "records a current-sky limitation");
  assert.ok(ctx.evidence.length > 0, "still answers from the natal chart");
});

test("buildAskContext: deterministic for identical inputs", () => {
  const args = { active: { profile: { id: "p1", nickname: "Me" }, chart: chartExact() }, sky: skyFixture(), detailMode: "Simple", question: "what should I pay attention to today?" };
  const a = buildAskContext(args);
  const b = buildAskContext({ ...args, active: { profile: { id: "p1", nickname: "Me" }, chart: chartExact() }, sky: skyFixture() });
  assert.deepEqual(a, b);
  assert.equal(a.engineVersion, ASK_ENGINE_VERSION);
});

// ── presenter ────────────────────────────────────────────────────────────────
test("presenter: Simple omits degrees; Advanced includes them when present", () => {
  const chart = chartExact();
  const simple = buildAskContext({ active: { profile: { id: "p1" }, chart }, sky: null, detailMode: "Simple", question: "tell me about my Venus" });
  const advanced = buildAskContext({ active: { profile: { id: "p1" }, chart }, sky: null, detailMode: "Advanced", question: "tell me about my Venus" });
  const sOut = presentAnswer(simple, chart);
  const aOut = presentAnswer(advanced, chart);
  const sVenus = sOut.evidence.find((e) => e.label.includes("Venus"));
  const aVenus = aOut.evidence.find((e) => e.label.includes("Venus"));
  assert.ok(sVenus && !/\d+°/.test(sVenus.label), "Simple Venus label has no degrees");
  assert.ok(aVenus && /\d+°/.test(aVenus.label), "Advanced Venus label includes degrees");
});

test("presenter: always returns a complete answer with three parts + disclaimer", () => {
  const ctx = buildAskContext({ active: { profile: { id: "p1" }, chart: chartExact() }, sky: skyFixture(), detailMode: "Simple", question: "how are my relationships?" });
  const out = presentAnswer(ctx, chartExact());
  assert.ok(out.answer.direct.length > 0);
  assert.ok(out.answer.interpretation.length > 0);
  assert.ok(out.answer.reflection.length > 0);
  assert.ok(out.evidence.length > 0);
  assert.match(out.disclaimer, /symbolic reflection/);
});

test("presenter: unknown-time answer surfaces the limitation as an evidence line", () => {
  const ctx = buildAskContext({ active: { profile: { id: "p1" }, chart: chartUnknown() }, sky: null, detailMode: "Simple", question: "what house is my Sun in?" });
  const out = presentAnswer(ctx, chartUnknown());
  assert.ok(out.evidence.some((e) => e.type === "limitation:birth-time"), "limitation shown");
});

// ── suggestions ──────────────────────────────────────────────────────────────
test("suggestions adapt: unknown time drops house/Rising prompts", () => {
  const sugg = suggestedQuestions({ active: { profile: { id: "p1" }, chart: chartUnknown() }, sky: skyFixture() });
  assert.ok(!sugg.some((s) => /house|Rising/i.test(s.text)), "no house/Rising prompt on unknown time");
});
test("suggestions adapt: no sky drops the current-sky prompt", () => {
  const sugg = suggestedQuestions({ active: { profile: { id: "p1" }, chart: chartExact() }, sky: null });
  assert.ok(!sugg.some((s) => s.topic === "current-transit"), "no current-sky prompt without sky");
});
test("suggestions adapt: missing Venus drops the Venus prompt", () => {
  const chart = chartExact(); delete chart.planets.Venus;
  const sugg = suggestedQuestions({ active: { profile: { id: "p1" }, chart }, sky: skyFixture() });
  assert.ok(!sugg.some((s) => /Venus/i.test(s.text)), "no Venus prompt when Venus absent");
});

// ── service (in-memory store) ────────────────────────────────────────────────
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function makeService({ store, chart = chartExact(), active = true, sky = skyFixture(), detail = "Simple", failGen = false } = {}) {
  let counter = 0;
  const chartSvc = {
    async getActive() { return active ? { profile: { id: "chart-1", nickname: "My Chart", time_accuracy: chart.time_accuracy }, chart } : null; },
  };
  return createAskService({
    store, chartSvc,
    getDetail: async () => detail,
    getSky: async () => sky,
    provider: null,
    useModel: false,
    // Inject a throwing generator to exercise the deterministic-failure safety net.
    ...(failGen ? { generate: async () => { throw new Error("boom"); } } : {}),
    uuid: () => `id-${++counter}`,
    now: () => `2026-07-17T00:00:0${counter}.000Z`,
  });
}

test("validateQuestion: empty + too-long rejected", () => {
  assert.equal(validateQuestion("").ok, false);
  assert.equal(validateQuestion("   ").code, "empty_question");
  assert.equal(validateQuestion("x".repeat(2001)).code, "question_too_long");
  assert.equal(validateQuestion("real question").ok, true);
});

test("service.ask: creates conversation, persists message + evidence", async () => {
  const store = createMemoryAskStore();
  const svc = makeService({ store });
  const res = await svc.ask(OWNER, { question: "How are my relationships?" });
  assert.ok(res.conversation.id);
  assert.ok(res.message.id);
  assert.ok(Array.isArray(res.message.evidence) && res.message.evidence.length > 0, "evidence stored");
  assert.equal(res.message.engine_version, ASK_ENGINE_VERSION);
  assert.equal(res.message.status, "ok");
  assert.equal(res.message.active_chart_id, "chart-1");
  const list = await store.listMessages(OWNER, res.conversation.id);
  assert.equal(list.length, 1, "message persisted");
});

test("service.ask: no active chart → AskError(no_active_chart)", async () => {
  const svc = makeService({ store: createMemoryAskStore(), active: false });
  await assert.rejects(() => svc.ask(OWNER, { question: "hi" }), (e) => e instanceof AskError && e.code === "no_active_chart");
});

test("service.ask: reopen conversation returns prior messages", async () => {
  const store = createMemoryAskStore();
  const svc = makeService({ store });
  const first = await svc.ask(OWNER, { question: "What about my Venus?" });
  await svc.ask(OWNER, { question: "And my Saturn?", conversationId: first.conversation.id });
  const { conversation, messages } = await svc.getConversation(OWNER, first.conversation.id);
  assert.equal(conversation.id, first.conversation.id);
  assert.equal(messages.length, 2, "both turns stored in one conversation");
});

test("service.ask: conversations are owner-scoped (no cross-user read)", async () => {
  const store = createMemoryAskStore();
  const svc = makeService({ store });
  const mine = await svc.ask(OWNER, { question: "my question" });
  await assert.rejects(() => svc.getConversation(OTHER, mine.conversation.id), (e) => e instanceof AskError && e.code === "not_found");
  const otherList = await svc.listConversations(OTHER);
  assert.equal(otherList.length, 0, "other user sees none of my conversations");
});

test("service.ask: failed generation persists the question as failed, never lost", async () => {
  const store = createMemoryAskStore();
  const svc = makeService({ store, failGen: true });
  await assert.rejects(() => svc.ask(OWNER, { question: "explain my chart" }), (e) => e instanceof AskError && e.code === "generation_failed");
  // The question survives as a failed message.
  const convos = await svc.listConversations(OWNER);
  assert.equal(convos.length, 1);
  const msgs = await store.listMessages(OWNER, convos[0].id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].status, "failed");
  assert.equal(msgs[0].question, "explain my chart");
});

test("service.ask: empty question rejected before any store write", async () => {
  const store = createMemoryAskStore();
  const svc = makeService({ store });
  await assert.rejects(() => svc.ask(OWNER, { question: "  " }), (e) => e instanceof AskError && e.code === "empty_question");
  assert.equal((await svc.listConversations(OWNER)).length, 0, "nothing persisted");
});
