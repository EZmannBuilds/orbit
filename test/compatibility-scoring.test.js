// Orbit Axis :: the compatibility rating contract, held in place (1.11).
//
// The endpoint suite proves the route behaves. This one proves the NUMBERS
// stay honest, because the two ways this feature can quietly go wrong are both
// invisible from the outside:
//
//   1. a weighting bias that pushes every comparison negative, and
//   2. a dedup key that silently halves the evidence.
//
// Both were real during development. Both produced plausible output. Neither
// would have failed a test that only checked the response shape.
//
// Pure and offline: no server, no database, no stack.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASPECT_WEIGHTS, ASPECT_ORBS, CATEGORY_WEIGHTS, THEME_TO_CATEGORY,
  PAIR_MEANINGS, BANDS, SELF_BANDS, CATEGORY_BANDS, CATEGORY_SELF_BANDS,
  bandsFor, pairKey, pairMeaning,
} from "../lib/compatibility/weights.js";
import { CATEGORIES, COMPATIBILITY_MODES, categoryIds, isCalculableRelationship } from "../lib/compatibility/categories.js";
import { collectEvidence, contributionsFor, orbFactor } from "../lib/compatibility/evidence.js";
import { scoreComparison, bandFor, leanFrom } from "../lib/compatibility/scoring.js";
import { buildComparison } from "../lib/compatibility/service.js";

const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

// ── The bias that made the first draft unusable ─────────────────────────────

test("hard and soft aspects carry equal expected weight", () => {
  // Expected contribution per family is (positions × orb width) × weight; the
  // orb factor averages identically for every aspect, so it cancels. The two
  // families occupy the same 40 units of the circle, so any weight difference
  // is a thumb on the scale rather than an astrological opinion.
  //
  // The first draft mirrored lib/interpretation/aspects.js, where hard aspects
  // score 4 and soft ones 2 because they are more INTERESTING to read about.
  // Used as scoring weight that is a built-in 2:1 negative bias: measured, it
  // put the median at 43 and 86% of comparisons in the bottom two bands.
  const window_ = (aspect, positions) => positions * ASPECT_ORBS[aspect] * 2;
  const hard = window_("opposition", 1) * ASPECT_WEIGHTS.opposition
             + window_("square", 2) * ASPECT_WEIGHTS.square;
  const soft = window_("trine", 2) * ASPECT_WEIGHTS.trine
             + window_("sextile", 2) * ASPECT_WEIGHTS.sextile;
  assert.equal(hard, soft,
    `hard=${hard} soft=${soft} — unequal families bias every comparison ever produced`);
});

test("the score distribution spreads across all five bands", () => {
  // Two unrelated people's planets sit at effectively independent longitudes,
  // so a sweep of synthetic pairs is not a toy — it is the population this
  // feature runs on. Deterministic LCG, so this is a fixed assertion rather
  // than a flaky one.
  let seed = 20260801;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const chart = () => ({
    time_known: true,
    planets: Object.fromEntries(BODIES.map((b) => [b, { longitude: rnd() * 360 }])),
  });
  const row = (id, rel) => ({ id, nickname: "Fixture", relationship_type: rel, is_primary: false, avatar_storage_path: null, avatar_version: 0 });

  for (const mode of COMPATIBILITY_MODES) {
    const scores = [];
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const c = buildComparison({
        mode, subject: row("a", "self"), other: row("b", mode),
        subjectChart: chart(), otherChart: chart(),
      });
      scores.push(c.overall.score);
      if (c.overall.band) seen.add(c.overall.band.id);
    }
    scores.sort((x, y) => x - y);
    const median = scores[Math.floor(scores.length / 2)];

    // Every band must be reachable. A label nobody can ever receive is a label
    // that means nothing, and the first draft's top band was exactly that.
    assert.equal(seen.size, 5,
      `${mode}: only ${seen.size}/5 bands occur (${[...seen].join(", ")})`);

    // The median must sit clear of a boundary, or half of all real comparisons
    // flip their headline on rounding noise.
    const edges = bandsFor(mode).map((b) => b.min).filter((m) => m > 0);
    const nearest = Math.min(...edges.map((e) => Math.abs(median - e)));
    assert.ok(nearest >= 3,
      `${mode}: median ${median} sits ${nearest} from a band edge — headlines would be a coin toss`);
  }
});

// ── The dedup key that silently halved the evidence ─────────────────────────

test("synastry is directional and both directions survive", () => {
  // The engine compares every body in A against every body in B with no i<j
  // skip, so "your Venus to their Mars" and "your Mars to their Venus" are two
  // different contacts — one is your affection meeting their drive, the other
  // the reverse. People feel those differently.
  //
  // The MEANING of the pair is symmetric, so pairMeaning uses a sorted key.
  // The IDENTITY is not. Deduping on the sorted key merged the two and dropped
  // one, halving the evidence with no visible symptom.
  const aspects = [
    { personA: "Venus", personB: "Mars", aspect: "trine", quality: "easy", orb: 1, involvesLuminary: false },
    { personA: "Mars", personB: "Venus", aspect: "trine", quality: "easy", orb: 1, involvesLuminary: false },
  ];
  const evidence = collectEvidence(aspects, "partner");
  const contacts = new Set(evidence.map((e) => e.contact));
  assert.deepEqual([...contacts].sort(), ["Mars>Venus", "Venus>Mars"]);

  // And one direction alone must produce strictly less.
  const half = collectEvidence([aspects[0]], "partner");
  assert.ok(evidence.length > half.length,
    "both directions must contribute more evidence than one");

  // The symmetric meaning lookup is still symmetric.
  assert.equal(pairKey("Venus", "Mars"), pairKey("Mars", "Venus"));
  assert.equal(pairMeaning("Venus", "Mars"), pairMeaning("Mars", "Venus"));
});

test("a repeated contact is counted once per category", () => {
  const one = { personA: "Sun", personB: "Moon", aspect: "trine", quality: "easy", orb: 2, involvesLuminary: true };
  const single = collectEvidence([one], "partner");
  const doubled = collectEvidence([one, { ...one }], "partner");
  assert.deepEqual(doubled, single, "the same contact must not count twice");
});

test("overlapping themes do not let one pair shout down another", () => {
  // Mars-Mercury carries communication, drive AND friction. If those summed,
  // a pair with three overlapping themes would outweigh a pair with one purely
  // by being described in more words.
  const aspect = { personA: "Mars", personB: "Mercury", aspect: "square", quality: "challenging", orb: 1, involvesLuminary: false };
  const contributions = contributionsFor(aspect, "partner");
  const perCategory = new Map();
  for (const c of contributions) {
    assert.ok(!perCategory.has(c.categoryId), `${c.categoryId} received two contributions from one contact`);
    perCategory.set(c.categoryId, c);
  }
});

// ── Relationship-awareness is real, not cosmetic ────────────────────────────

test("attraction is scored only in partner mode", () => {
  assert.ok(THEME_TO_CATEGORY.partner.attraction, "partner must route attraction somewhere");
  for (const mode of ["friend", "family", "self"]) {
    assert.equal(THEME_TO_CATEGORY[mode].attraction, undefined,
      `${mode} must drop the attraction theme rather than rename it`);
    for (const c of CATEGORIES[mode]) {
      assert.ok(!/attract|intimacy|romanc|sexual/i.test(`${c.id} ${c.label}`),
        `${mode} has a category that reads as attraction: ${c.label}`);
    }
  }
});

test("every mode's category weights sum to one and match its categories", () => {
  for (const mode of COMPATIBILITY_MODES) {
    const weights = CATEGORY_WEIGHTS[mode];
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9,
      `${mode} weights sum to ${total}, so its overall is not a weighted mean`);
    assert.deepEqual(Object.keys(weights).sort(), categoryIds(mode).sort(),
      `${mode} has a weight without a category, or a category without a weight`);
  }
});

test("every theme routes somewhere in every mode that keeps it", () => {
  const themes = new Set(Object.values(PAIR_MEANINGS).flatMap((m) => m.themes));
  for (const mode of COMPATIBILITY_MODES) {
    const ids = new Set(categoryIds(mode));
    for (const [theme, targets] of Object.entries(THEME_TO_CATEGORY[mode])) {
      assert.ok(themes.has(theme), `${mode} routes theme "${theme}" that no pair produces`);
      for (const categoryId of Object.keys(targets)) {
        assert.ok(ids.has(categoryId),
          `${mode} routes ${theme} into "${categoryId}", which is not one of its categories`);
      }
    }
  }
  // `direction` is produced by Sun|Sun and deliberately routed nowhere; every
  // other theme must land somewhere, or a pair is doing no work at all.
  for (const theme of themes) {
    if (theme === "direction") continue;
    const routed = COMPATIBILITY_MODES.some((m) => THEME_TO_CATEGORY[m][theme]);
    assert.ok(routed, `theme "${theme}" is produced by a pair but routed by no mode`);
  }
});

test("self mode uses alignment bands, never relationship verdicts", () => {
  assert.equal(bandsFor("self"), SELF_BANDS);
  for (const mode of ["partner", "friend", "family"]) assert.equal(bandsFor(mode), BANDS);
  // Telling somebody their own two charts are "Highly Challenging" says they
  // are a difficult relationship, which is both meaningless and unkind.
  for (const b of SELF_BANDS) {
    assert.ok(!/challenging|supportive/i.test(b.label), `self band "${b.label}" reads as a verdict`);
  }
  // The thresholds stay shared, so there is one scale to keep honest.
  assert.deepEqual(SELF_BANDS.map((b) => b.min), BANDS.map((b) => b.min));
});

test("a category band means the same thing as an overall band", () => {
  // An overall is a weighted mean of eight categories and concentrates; a
  // single category rests on whatever landed in it and spreads. Measured:
  // overall sd 10.0, category sd 15.9. One threshold set across both is a
  // distortion — it put 19% of categories in the bottom band against 8% of
  // overalls, so an ordinary comparison showed "Highly Challenging" six times
  // beside a Growth-Heavy overall. Seen in a browser, not theorised.
  let seed = 7654321;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const chart = () => ({ time_known: true, planets: Object.fromEntries(BODIES.map((b) => [b, { longitude: rnd() * 360 }])) });
  const row = (id, rel) => ({ id, nickname: "Fixture", relationship_type: rel, is_primary: false, avatar_storage_path: null, avatar_version: 0 });

  const overall = [], categories = [];
  for (const mode of COMPATIBILITY_MODES) {
    for (let i = 0; i < 150; i++) {
      const c = buildComparison({ mode, subject: row("a", "self"), other: row("b", mode), subjectChart: chart(), otherChart: chart() });
      if (c.overall.band) overall.push(c.overall.band.id);
      for (const cat of c.categories) if (cat.hasEvidence) categories.push(cat.band.id);
    }
  }
  const share = (list, id) => list.filter((x) => x === id).length / list.length;
  for (const id of ["highly_challenging", "strongly_supportive", "mixed_workable"]) {
    const o = share(overall, id) || share(overall, CATEGORY_SELF_BANDS.find((b) => b.id === id)?.id) || 0;
    const c = share(categories, id);
    assert.ok(Math.abs(o - c) < 0.08,
      `"${id}" lands on ${(c * 100).toFixed(0)}% of categories but ${(o * 100).toFixed(0)}% of overalls`);
  }

  // The two scales differ in thresholds, never in labels.
  assert.deepEqual(CATEGORY_BANDS.map((b) => b.label), BANDS.map((b) => b.label));
  assert.deepEqual(CATEGORY_SELF_BANDS.map((b) => b.label), SELF_BANDS.map((b) => b.label));
  assert.notDeepEqual(CATEGORY_BANDS.map((b) => b.min), BANDS.map((b) => b.min));
  assert.equal(bandsFor("partner", "category"), CATEGORY_BANDS);
  assert.equal(bandsFor("self", "category"), CATEGORY_SELF_BANDS);
});

// ── Refusals and edges ──────────────────────────────────────────────────────

test("legacy relationship values are never calculable", () => {
  for (const v of ["other", "public_figure", null, undefined, "", "OTHER", "Partner"]) {
    assert.equal(isCalculableRelationship(v), false, `"${v}" must not reach a calculation`);
  }
  for (const v of COMPATIBILITY_MODES) assert.equal(isCalculableRelationship(v), true);
});

test("a malformed aspect contributes nothing rather than NaN", () => {
  for (const bad of [
    { personA: "Venus", personB: "Mars", aspect: "quintile", quality: "easy", orb: 1 },
    { personA: "Venus", personB: "Mars", aspect: "trine", quality: "easy", orb: -5 },
    { personA: "Venus", personB: "Mars", aspect: "trine", quality: "easy", orb: NaN },
    { personA: "Chiron", personB: "Mars", aspect: "trine", quality: "easy", orb: 1 },
    {},
  ]) {
    const evidence = collectEvidence([bad], "partner");
    for (const e of evidence) {
      assert.ok(Number.isFinite(e.magnitude), `produced a non-finite magnitude from ${JSON.stringify(bad)}`);
    }
    const scored = scoreComparison(evidence, "partner");
    for (const c of scored.categories) assert.ok(Number.isFinite(c.score));
    assert.ok(Number.isFinite(scored.overall.score));
  }
});

test("orb factor stays inside its documented range", () => {
  for (const aspect of Object.keys(ASPECT_ORBS)) {
    for (const orb of [0, 0.5, 2, 4, 6, 8, 9, 100]) {
      for (const luminary of [true, false]) {
        const f = orbFactor({ aspect, orb, involvesLuminary: luminary });
        assert.ok(f >= 0 && f <= 1, `${aspect} at ${orb}° gave ${f}`);
      }
    }
  }
  assert.equal(orbFactor({ aspect: "trine", orb: 0, involvesLuminary: false }), 1);
});

test("scores stay bounded and neutral when there is nothing to say", () => {
  assert.equal(leanFrom(0, 0), 0);
  const empty = scoreComparison([], "partner");
  assert.equal(empty.overall.hasBand, false);
  assert.equal(empty.overall.coverage, 0);
  assert.equal(empty.categories.length, 8, "categories must not vanish when evidence does");
  for (const c of empty.categories) assert.equal(c.band, null);

  for (const score of [-50, 0, 50, 100, 150]) {
    for (const mode of COMPATIBILITY_MODES) assert.ok(bandFor(score, mode)?.label);
  }
});

test("the category summary is a sentence, not a number", () => {
  // A category definition owns `supportive` and `straining` as AUTHORED
  // SENTENCES; scoreCategory returns accumulated weights. When those weights
  // were named plainly they overwrote the copy in the object spread and every
  // summary rendered as a bare decimal. Nothing type-checks that.
  const scored = scoreComparison(
    collectEvidence([{ personA: "Sun", personB: "Moon", aspect: "trine", quality: "easy", orb: 1, involvesLuminary: true }], "partner"),
    "partner");
  for (const c of scored.categories) {
    assert.equal(typeof c.supportive, "string", `${c.id}.supportive was overwritten by a number`);
    assert.equal(typeof c.straining, "string", `${c.id}.straining was overwritten by a number`);
    assert.equal(typeof c.supportiveWeight, "number");
  }
});
