// Orbit Axis :: Dev Update 1.6 — Home sky highlights.
//
// The interesting test here is the generational one. Every other assertion
// guards a rule; that one guards against a whole class of "technically correct,
// practically useless" Home page.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  rankSkyAspects, highlightRank, isGenerational, moonState,
  composeHighlights, daysUntil, HIGHLIGHT_COUNT, ASPECT_WEIGHT, HIGHLIGHT_DESTINATIONS,
} from "../lib/home/highlights.js";

// Shaped exactly like GET /api/sky/current, values taken from a real response.
const SKY = Object.freeze({
  local_date: "2026-07-31",
  zodiac_season: "Leo",
  moon: { sign: "Pisces", phase_name: "Waning Gibbous", illumination_percent: 96,
          waxing: false, degrees: 12, minutes: 4 },
  moon_phase_name: "Waning Gibbous", illumination_percent: 96, is_waxing: false,
  next_full_moon: { kind: "full_moon", local_date: "2026-08-27" },
  next_new_moon: { kind: "new_moon", local_date: "2026-08-12" },
  retrogrades: ["Saturn", "Neptune", "Pluto"],
  aspects: [
    { a: "Neptune", b: "Pluto", aspect: "Sextile", orb: 0.08 },
    { a: "Uranus", b: "Neptune", aspect: "Sextile", orb: 0.73 },
    { a: "Uranus", b: "Pluto", aspect: "Trine", orb: 0.81 },
    { a: "Venus", b: "Mars", aspect: "Square", orb: 0.85 },
    { a: "Sun", b: "Saturn", aspect: "Trine", orb: 3.4 },
    { a: "Moon", b: "Venus", aspect: "Conjunction", orb: 5.1 },
  ],
});

test("generational pairs never become daily highlights, however tight", () => {
  // Neptune sextile Pluto at 0.08° is the tightest aspect in this sky and stays
  // within a degree for years. Leading with it means Home says the same thing
  // every morning for a decade.
  assert.equal(isGenerational({ a: "Neptune", b: "Pluto", aspect: "Sextile" }), true);
  assert.equal(isGenerational({ a: "Uranus", b: "Neptune", aspect: "Sextile" }), true);
  assert.equal(isGenerational({ a: "Sun", b: "Pluto", aspect: "Square" }), false);

  const ranked = rankSkyAspects(SKY.aspects);
  for (const a of ranked) {
    assert.ok(!isGenerational(a), `${a.a} ${a.aspect} ${a.b} is generational and must be dropped`);
  }
  assert.equal(ranked.length, 3, "three of the six aspects are outer-planet pairs");
});

test("relevance beats tightness, then aspect weight breaks the tie", () => {
  const ranked = rankSkyAspects(SKY.aspects);
  assert.deepEqual(ranked.map((a) => `${a.a} ${a.aspect} ${a.b}`), [
    // Luminary + personal planet scores 5. The WIDEST aspect in this sky
    // (5.1°) leads it, which is the whole point of ranking on relevance.
    "Moon Conjunction Venus",
    // Venus+Mars and Sun+Saturn both score 4, so weight decides: a square
    // (4) is a stronger statement than a trine (2).
    "Venus Square Mars",
    "Sun Trine Saturn",
  ]);
  // Stated as a property rather than a fixture, so the rule survives new data.
  const rank = ranked.map(highlightRank);
  assert.ok(rank[0].relevance <= rank[1].relevance && rank[1].relevance <= rank[2].relevance,
    "relevance never decreases down the list");
  assert.ok(rank[1].relevance === rank[2].relevance && rank[1].weight <= rank[2].weight,
    "equal relevance is broken by aspect weight, not by orb");
  assert.ok(rank[0].orb > rank[1].orb, "and a wider aspect can still lead");
});

test("ranking is deterministic across repeated runs", () => {
  const first = JSON.stringify(rankSkyAspects(SKY.aspects));
  for (let i = 0; i < 20; i += 1) {
    assert.equal(JSON.stringify(rankSkyAspects(SKY.aspects)), first);
  }
});

test("every rank field is defined, ordered, and finally tie-broken", () => {
  const k = highlightRank({ a: "Sun", b: "Moon", aspect: "Trine", orb: 1.2 });
  assert.deepEqual(Object.keys(k), ["relevance", "weight", "orb", "pair"]);
  // A pair tie-break exists so two identical scores cannot reorder between renders.
  const a = highlightRank({ a: "Sun", b: "Mars", aspect: "Trine", orb: 2 });
  const b = highlightRank({ a: "Sun", b: "Venus", aspect: "Trine", orb: 2 });
  assert.notEqual(a.pair, b.pair);
  assert.equal(ASPECT_WEIGHT.Conjunction > ASPECT_WEIGHT.Trine, true);
});

test("malformed aspects are dropped rather than rendered half-formed", () => {
  const ranked = rankSkyAspects([null, {}, { a: "Sun" }, { a: "Sun", b: "Moon", aspect: "Trine", orb: 1 }]);
  assert.equal(ranked.length, 1);
  // A missing orb sorts last instead of throwing.
  assert.equal(highlightRank({ a: "Sun", b: "Moon", aspect: "Trine" }).orb, 99);
});

test("the Moon is read from one accessor, not the mirrored top-level fields", () => {
  const src = readFileSync(new URL("../lib/home/highlights.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function moonState"), src.indexOf("/** Plain sentences"));
  assert.ok(fn.includes("sky?.moon"), "moonState reads sky.moon");
  for (const mirror of ["moon_phase_name", "is_waxing", "illumination_percent:"]) {
    assert.ok(!fn.includes(mirror), `moonState must not read the mirrored ${mirror}`);
  }
});

test("moon state reports phase, direction, and the soonest lunar event", () => {
  const m = moonState(SKY);
  assert.equal(m.phase, "Waning Gibbous");
  assert.equal(m.sign, "Pisces");
  assert.equal(m.illumination, 96);
  assert.equal(m.waxing, false);
  assert.equal(m.direction, "waning");
  // New Moon (Aug 12) comes before Full Moon (Aug 27), so it is the one named.
  assert.equal(m.nextEvent.kind, "New Moon");
  assert.equal(m.nextEvent.days, 12);
  assert.equal(m.nextEvent.when, "in 12 days");
});

test("waxing and waning copy follows the canonical flag, never the phase name", () => {
  assert.match(moonState(SKY).meaning, /drawing back/);
  const waxing = { ...SKY, moon: { ...SKY.moon, waxing: true, phase_name: "Waxing Crescent" } };
  assert.match(moonState(waxing).meaning, /filling out/);
  assert.equal(moonState(waxing).direction, "waxing");
});

test("a missing Moon or lunar event degrades safely instead of guessing", () => {
  assert.equal(moonState({}), null);
  assert.equal(moonState({ moon: {} }), null);
  const noEvents = { ...SKY, next_full_moon: null, next_new_moon: null };
  assert.equal(moonState(noEvents).nextEvent, null);
  assert.equal(moonState(noEvents).phase, "Waning Gibbous", "the rest still renders");
  assert.equal(daysUntil(null, "2026-07-31"), null);
  assert.equal(daysUntil("bad", "2026-07-31"), null);
});

test("today and tomorrow are named, not counted", () => {
  const soon = { ...SKY, next_new_moon: { local_date: "2026-07-31" } };
  assert.equal(moonState(soon).nextEvent.when, "today");
  const tomorrow = { ...SKY, next_new_moon: { local_date: "2026-08-01" } };
  assert.equal(moonState(tomorrow).nextEvent.when, "tomorrow");
});

test("highlights are capped, linked, and never grade the sky", () => {
  const h = composeHighlights(SKY);
  assert.ok(h.length <= 2 + HIGHLIGHT_COUNT + 1, "season + moon + aspects + retrogrades");
  assert.equal(h.filter((x) => x.kind === "aspect").length, HIGHLIGHT_COUNT);
  for (const x of h) {
    assert.ok(x.id && x.label && x.detail, `${x.kind} highlight is incomplete`);
    assert.ok(HIGHLIGHT_DESTINATIONS.includes(x.href), `${x.href} is not an allowed destination`);
    assert.doesNotMatch(x.detail, /\b(will|guarantee|must|destined|lucky day|bad day)\b/i,
      `highlight predicts or grades: "${x.detail}"`);
  }
});

test("every highlight destination is a workspace that actually exists", () => {
  // There is no Positions workspace yet — that is Dev Update 1.7. A highlight
  // linking to #positions would be a dead control shipped on the busiest page.
  const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const registry = appJs.slice(appJs.indexOf("const WORKSPACES"), appJs.indexOf("const RETIRED_ROUTES"));
  const registered = [...registry.matchAll(/id: "([a-z-]+)"/g)].map((m) => `#${m[1]}`);
  for (const href of HIGHLIGHT_DESTINATIONS) {
    assert.ok(registered.includes(href), `${href} is not a registered workspace`);
  }
  assert.ok(!HIGHLIGHT_DESTINATIONS.includes("#positions"), "Positions does not exist until 1.7");
  for (const h of composeHighlights(SKY)) {
    assert.ok(registered.includes(h.href), `highlight "${h.label}" links to a dead route`);
  }
});

test("highlights compose from an empty sky without throwing", () => {
  assert.deepEqual(composeHighlights(null), []);
  assert.deepEqual(composeHighlights({}), []);
  const noAspects = composeHighlights({ zodiac_season: "Leo", aspects: [], retrogrades: [] });
  assert.equal(noAspects.length, 1, "the season still stands on its own");
});

test("nothing here is random, clock-dependent, or networked", () => {
  const src = readFileSync(new URL("../lib/home/highlights.js", import.meta.url), "utf8");
  for (const banned of ["Math.random", "Date.now(", "new Date(", "fetch(", "import("]) {
    assert.ok(!src.includes(banned), `${banned} would break Home determinism`);
  }
  for (const ai of ["openai", "anthropic", "ollama", "gpt-", "claude-"]) {
    assert.ok(!src.toLowerCase().includes(ai), `${ai} must never appear in Home composition`);
  }
});

test("internal sky plumbing is never surfaced as a highlight", () => {
  const withNoise = { ...SKY, snapshot_hash: "d8f096c8", source: { engine_version: "x" },
                      context_version: "current-sky-context-v1" };
  const text = JSON.stringify(composeHighlights(withNoise));
  for (const leak of ["d8f096c8", "engine_version", "context_version", "snapshot"]) {
    assert.ok(!text.includes(leak), `${leak} must not reach the reader`);
  }
});
