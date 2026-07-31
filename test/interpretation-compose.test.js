// Orbit Axis :: Dev Update 1.5 — deterministic composition.
//
// The contract: the same chart produces the same words, for ever, with no
// randomness, no clock, and no network. Everything else in this file is a
// consequence of that plus "never claim a fact the engine did not calculate".
//
// Fixtures are hand-built chart payloads shaped exactly like the engine's real
// output (captured from previewChart during the Dev Update 1.5 audit). Using
// fixtures rather than live calculation keeps these tests fast, offline, and
// independent of ephemeris data — and means no owner chart is ever involved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  composeChart, composePlacement, composeBigThree, composeAspects,
  composePatterns, composeOverview, formatPosition, CONTENT_VERSION,
} from "../lib/interpretation/compose.js";
import { rankAspects, ASPECT_HIGHLIGHT_COUNT } from "../lib/interpretation/aspects.js";
import { isMeaningfullyDominant, leastRepresented } from "../lib/interpretation/patterns.js";

const body = (sign, degrees, minutes, retrograde = false) =>
  ({ sign, degrees, minutes, seconds: 0, retrograde, longitude: 0, speed: 1 });

/** A known-time chart: houses, angles, and angle aspects all present. */
const KNOWN = Object.freeze({
  calculation_version: "natal-v1",
  time_known: true,
  time_accuracy: "exact",
  planets: {
    Sun: body("Gemini", 24, 54), Moon: body("Pisces", 26, 20),
    Mercury: body("Leo", 3, 10), Venus: body("Leo", 12, 5),
    Mars: body("Aries", 1, 40), Jupiter: body("Libra", 8, 2),
    Saturn: body("Cancer", 14, 30, true), Uranus: body("Pisces", 4, 58, true),
    Neptune: body("Aquarius", 4, 16, true), Pluto: body("Sagittarius", 4, 11, true),
  },
  angles: { ascendant: body("Leo", 8, 33), midheaven: body("Aries", 18, 5) },
  houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: "Leo", degrees: 8, minutes: 33 })),
  planet_houses: {
    Sun: 11, Moon: 9, Mercury: 11, Venus: 10, Mars: 9,
    Jupiter: 12, Saturn: 6, Uranus: 6, Neptune: 6, Pluto: 4,
  },
  aspects: [
    { a: "Jupiter", b: "Pluto", aspect: "Trine", orb: 0.68, exactAngle: 120 },
    { a: "Sun", b: "Moon", aspect: "Square", orb: 1.43, exactAngle: 90 },
    { a: "Mercury", b: "Ascendant", aspect: "Sextile", orb: 1.46, exactAngle: 60 },
    { a: "Venus", b: "Mars", aspect: "Opposition", orb: 3.2, exactAngle: 180 },
    { a: "Saturn", b: "Neptune", aspect: "Conjunction", orb: 5.5, exactAngle: 0 },
    { a: "Uranus", b: "Neptune", aspect: "Sextile", orb: 4.9, exactAngle: 60 },
  ],
  big_three: { sun: { sign: "Gemini" }, moon: { sign: "Pisces" }, rising: { sign: "Leo" } },
  element_balance: { counts: { Fire: 5, Earth: 5.5, Air: 5, Water: 5.5 },
                     percentages: { Fire: 24, Earth: 26, Air: 24, Water: 26 }, dominant: "Earth" },
  modality_balance: { counts: { Cardinal: 7, Fixed: 6, Mutable: 8 },
                      percentages: { Cardinal: 33, Fixed: 29, Mutable: 38 }, dominant: "Mutable" },
  chart_ruler: "Sun",
  retrogrades: ["Saturn", "Uranus", "Neptune", "Pluto"],
  warnings: [],
  calculation_status: "complete",
});

/** Unknown time: exactly what the engine returns — no angles, no houses. */
const UNKNOWN = Object.freeze({
  ...KNOWN,
  time_known: false,
  time_accuracy: "unknown",
  angles: { ascendant: null, midheaven: null },
  houses: [],
  planet_houses: {},
  big_three: { ...KNOWN.big_three, rising: { unavailable: true, reason: "Birth time required" } },
  aspects: KNOWN.aspects.filter((a) => a.a !== "Ascendant" && a.b !== "Ascendant"),
  warnings: ["birth_time_unknown", "houses_unavailable", "rising_unavailable", "moon_approximate"],
  calculation_status: "partial",
});

const APPROXIMATE = Object.freeze({ ...KNOWN, time_accuracy: "approximate" });

/** A flat chart: the engine still names a dominant, but the spread is noise. */
const FLAT = Object.freeze({
  ...KNOWN,
  element_balance: { counts: { Fire: 5, Earth: 5, Air: 5, Water: 6 },
                     percentages: { Fire: 24, Earth: 24, Air: 24, Water: 28 }, dominant: "Water" },
  modality_balance: { counts: { Cardinal: 7, Fixed: 7, Mutable: 7 },
                      percentages: { Cardinal: 33, Fixed: 33, Mutable: 34 }, dominant: "Mutable" },
});

const SPARSE = Object.freeze({ ...KNOWN, aspects: [KNOWN.aspects[1]] });

// ── Determinism ─────────────────────────────────────────────────────────────

test("the same chart composes to identical output every time", () => {
  const a = JSON.stringify(composeChart(KNOWN));
  for (let i = 0; i < 20; i += 1) {
    assert.equal(JSON.stringify(composeChart(KNOWN)), a, "composition is not stable");
  }
});

test("composition touches no clock, no randomness, and no network", () => {
  const source = readFileSync(new URL("../lib/interpretation/compose.js", import.meta.url), "utf8");
  for (const forbidden of ["Math.random", "Date.now", "new Date", "fetch(", "XMLHttpRequest", "import("]) {
    assert.ok(!source.includes(forbidden), `compose.js must not use ${forbidden}`);
  }
});

test("no interpretation module reaches an AI provider", () => {
  for (const file of ["compose", "planets", "signs", "houses", "aspects", "patterns", "limitations"]) {
    const src = readFileSync(new URL(`../lib/interpretation/${file}.js`, import.meta.url), "utf8");
    for (const forbidden of ["openai", "anthropic", "ollama", "api_key", "fetch("]) {
      assert.ok(!src.toLowerCase().includes(forbidden),
        `${file}.js must not reference ${forbidden} — interpretations are authored, not generated`);
    }
  }
});

// ── Planet → Sign → House ───────────────────────────────────────────────────

test("a placement reads planet, then sign, then house, in that order", () => {
  const p = composePlacement("Mercury", KNOWN);
  const iPlanet = p.summary.indexOf("Mercury");
  const iSign = p.summary.indexOf("Leo");
  const iHouse = p.summary.indexOf("eleventh");
  assert.ok(iPlanet >= 0 && iSign > iPlanet && iHouse > iSign,
    `wrong reading order: "${p.summary}"`);
});

test("the house clause is absent, not blank, when the engine gave no house", () => {
  const p = composePlacement("Mercury", UNKNOWN);
  assert.equal(p.house, null);
  assert.ok(!/house/i.test(p.summary), `unknown-time summary must not mention a house: "${p.summary}"`);
  assert.ok(!/undefined|null|NaN/.test(p.summary + p.detail.join(" ")));
});

test("every supported planet composes, and none is missing content", () => {
  const all = composeChart(KNOWN).placements;
  assert.equal(all.length, 10);
  for (const p of all) {
    assert.ok(p.summary.length > 40, `${p.planet} summary too thin`);
    assert.ok(p.detail.length >= 2, `${p.planet} needs layered detail`);
    assert.ok(p.position.includes("°"), `${p.planet} needs a degree`);
    assert.equal(p.source_version, CONTENT_VERSION);
  }
});

test("retrograde copy appears only for retrograde planets, never for the luminaries", () => {
  const byName = Object.fromEntries(composeChart(KNOWN).placements.map((p) => [p.planet, p]));
  assert.equal(byName.Saturn.retrograde, true);
  assert.ok(byName.Saturn.retrogradeNote, "a retrograde planet explains the distinction from transits");
  assert.equal(byName.Sun.retrograde, false);
  assert.equal(byName.Sun.retrogradeNote, null);
  // Even if a payload wrongly claimed a retrograde Sun, the composer refuses.
  const impossible = { ...KNOWN, planets: { ...KNOWN.planets, Sun: body("Gemini", 1, 0, true) } };
  assert.equal(composePlacement("Sun", impossible).retrograde, false);
});

test("no two placements open with the same sentence", () => {
  const opens = composeChart(KNOWN).placements.map((p) => p.summary.split(".")[0]);
  assert.equal(new Set(opens).size, opens.length, "composed placements repeat an opening");
});

// ── Big Three ───────────────────────────────────────────────────────────────

test("Rising is composed when the engine returned an Ascendant", () => {
  const rising = composeBigThree(KNOWN).find((x) => x.role === "Approach");
  assert.equal(rising.sign, "Leo");
  assert.ok(!rising.unavailable);
});

test("Rising is withheld — never guessed — when there is no Ascendant", () => {
  const rising = composeBigThree(UNKNOWN).find((x) => x.role === "Approach");
  assert.equal(rising.unavailable, true);
  assert.ok(!rising.sign, "an unavailable Rising must carry no sign at all");
  assert.match(rising.reason, /birth time/i);
  // And nothing anywhere in the composed chart may name a Rising sign.
  const whole = JSON.stringify(composeChart(UNKNOWN));
  assert.ok(!/Rising sign is /.test(whole), "unknown-time output must not state a Rising sign");
});

// ── Aspects ─────────────────────────────────────────────────────────────────

test("aspect ranking is deterministic and puts luminaries first", () => {
  const once = rankAspects(KNOWN.aspects).map((a) => `${a.a}-${a.b}`);
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(rankAspects(KNOWN.aspects).map((a) => `${a.a}-${a.b}`), once);
  }
  assert.equal(once[0], "Sun-Moon", "a luminary square outranks a tighter outer-planet trine");
});

test("an angle aspect outranks an outer-planet aspect", () => {
  const order = rankAspects(KNOWN.aspects).map((a) => `${a.a}-${a.b}`);
  assert.ok(order.indexOf("Mercury-Ascendant") < order.indexOf("Uranus-Neptune"));
});

test("aspects carry both a constructive and a tension reading", () => {
  for (const a of composeAspects(KNOWN).all) {
    assert.ok(a.constructive && a.tension, `${a.id} must not be graded one way`);
    assert.ok(a.headline.includes(a.a) && a.headline.includes(a.b));
  }
});

test("highlights are capped and the full list stays available", () => {
  const { highlights, all } = composeAspects(KNOWN);
  assert.equal(highlights.length, Math.min(ASPECT_HIGHLIGHT_COUNT, all.length));
  assert.equal(all.length, KNOWN.aspects.length);
});

test("a chart with few aspects composes without padding", () => {
  const { highlights, all } = composeAspects(SPARSE);
  assert.equal(all.length, 1);
  assert.equal(highlights.length, 1);
});

// ── Patterns ────────────────────────────────────────────────────────────────

test("a flat distribution is reported as balanced, not as a dominant element", () => {
  // The engine names a dominant even at 28/24/24/24. Calling that "a Water
  // chart" would be a claim the numbers do not support.
  assert.equal(isMeaningfullyDominant(FLAT.element_balance.percentages, "Water"), false);
  const patterns = composePatterns(FLAT);
  assert.equal(patterns.element.dominant, null);
  assert.equal(patterns.element.balanced, true);
  assert.match(patterns.element.summary, /No single element clearly dominates/i);
});

test("a genuine dominant is named", () => {
  const strong = { ...KNOWN, element_balance: { counts: {}, percentages: { Fire: 45, Earth: 20, Air: 20, Water: 15 }, dominant: "Fire" } };
  const patterns = composePatterns(strong);
  assert.equal(patterns.element.dominant, "Fire");
  assert.ok(patterns.element.detail);
});

test("a lighter element is described as less emphasised, never as absent", () => {
  const strong = { ...KNOWN, element_balance: { counts: {}, percentages: { Fire: 45, Earth: 25, Air: 20, Water: 10 }, dominant: "Fire" } };
  const { element } = composePatterns(strong);
  assert.equal(element.lighter.element, "Water");
  assert.doesNotMatch(element.lighter.detail, /\bno\b.*\bemotion|lacks?\b/i,
    "a low element must never be described as a missing human quality");
  assert.equal(leastRepresented({ A: 25, B: 25, C: 25, D: 25 }), null);
});

// ── Limitations ─────────────────────────────────────────────────────────────

test("an unknown-time chart gets one page-level limitation, not per-card badges", () => {
  const composed = composeChart(UNKNOWN);
  assert.ok(composed.limitation, "there must be a limitation notice");
  assert.equal(composed.limitation.id, "birth_time_unknown");
  assert.ok(composed.limitation.details.length >= 2, "it should fold in rising and houses");
  // No placement repeats the warning.
  for (const p of composed.placements) {
    assert.ok(!/birth time/i.test(p.summary), `${p.planet} repeats the page-level warning`);
  }
});

test("an approximate-time chart gets its own caution, which the engine cannot supply", () => {
  // The engine treats approximate exactly like exact — time_known true, no
  // warnings. The distinction exists only in what the user told us.
  assert.equal(APPROXIMATE.time_known, true);
  assert.equal(APPROXIMATE.warnings.length, 0);
  const composed = composeChart(APPROXIMATE);
  assert.equal(composed.limitation.id, "birth_time_approximate");
  assert.match(composed.limitation.body, /Rising sign, the Midheaven, and house/i);
});

test("an exact-time chart carries no limitation at all", () => {
  assert.equal(composeChart(KNOWN).limitation, null);
});

test("unknown-time output keeps everything that does not depend on a time", () => {
  const c = composeChart(UNKNOWN);
  assert.equal(c.placements.length, 10, "planet signs survive");
  assert.ok(c.patterns.element && c.patterns.modality, "balances survive");
  assert.ok(c.aspects.all.length > 0, "non-angle aspects survive");
  assert.ok(c.retrogrades.length > 0, "retrograde states survive");
});

// ── Overview ────────────────────────────────────────────────────────────────

test("the overview is composed from named placements, not written about a person", () => {
  const text = composeOverview(KNOWN);
  assert.match(text, /Gemini Sun/);
  assert.match(text, /Pisces Moon/);
  assert.match(text, /Leo rising/);
  // It must not editorialise about the reader.
  assert.doesNotMatch(text, /you are\b|your personality|this makes you/i);
});

test("the overview omits rising when there is none", () => {
  assert.doesNotMatch(composeOverview(UNKNOWN), /rising/i);
});

test("formatPosition renders degree and minute within the sign", () => {
  assert.equal(formatPosition(body("Gemini", 24, 54)), "24° 54′ Gemini");
  assert.equal(formatPosition(body("Leo", 8, 3)), "8° 03′ Leo");
  assert.equal(formatPosition(null), "");
});

// ── Dev Update 1.5 :: defects found by reading real rendered output ─────────

test("the Midheaven is composed from authored content, not written in the view", async () => {
  const { composeMidheaven } = await import("../lib/interpretation/compose.js");
  const mc = composeMidheaven(KNOWN);
  assert.ok(mc, "a known-time chart has a Midheaven");
  assert.equal(mc.key, "midheaven");
  assert.match(mc.summary, /public direction/, "it uses the authored ANGLES copy");
  // The renderer must not carry its own copy of this sentence.
  const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.ok(!appJs.includes("The Midheaven marks the most public point"),
    "Midheaven interpretation must not live in the view layer");
});

test("no Midheaven is composed without a usable birth time", () => {
  assert.equal(composeChart(UNKNOWN).midheaven, null);
});

test("placements are identified by a stable key, not by display text", () => {
  // ANGLES.Ascendant.name is "Rising sign". A renderer that matched that
  // string silently dropped the Ascendant from Houses and Angles.
  const reading = composeChart(KNOWN);
  const rising = reading.bigThree.find((p) => p.key === "ascendant");
  assert.ok(rising, "the Ascendant is addressable by key");
  assert.notEqual(rising.key, rising.planet,
    "key is identity and planet is display text — they are allowed to differ");
  for (const p of reading.placements) assert.ok(p.key, "every placement carries a key");
});

test("Sun and Moon are not printed twice in the same reading", () => {
  const reading = composeChart(KNOWN);
  const keys = reading.remainingPlacements.map((p) => p.key);
  assert.ok(!keys.includes("Sun") && !keys.includes("Moon"),
    "the Big Three lead the page; repeating them verbatim reads as machine output");
  assert.equal(reading.placements.length, 10, "the full set stays available for chart data");
  assert.equal(reading.remainingPlacements.length, 8);
});
