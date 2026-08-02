// Orbit Axis :: turning engine aspects into typed compatibility evidence.
//
// One job: take what the engine calculated and say which categories each
// contact speaks to, how loudly, and in which direction. No arithmetic about
// the final score happens here, and no copy is written here — this layer is
// the bridge between "what is true about these two charts" and "what question
// we are asking of it".
//
// Pure: no I/O, no clock, no randomness. Same aspects in, same evidence out.

import {
  ASPECT_WEIGHTS, ASPECT_ORBS, LUMINARY_ORB_BONUS, MIN_ORB_FACTOR,
  THEME_TO_CATEGORY, pairMeaning, pairKey,
} from "./weights.js";

/**
 * How much of its orb allowance this aspect is using, as a 0..1 strength.
 *
 * Exact scores 1; the far edge of the orb scores MIN_ORB_FACTOR rather than 0,
 * because a wide aspect is faint rather than absent. Clamped at both ends so a
 * malformed orb cannot produce a negative or runaway contribution.
 */
export function orbFactor(aspect) {
  const base = ASPECT_ORBS[aspect?.aspect];
  if (!base) return 0;
  const allowed = base + (aspect.involvesLuminary ? LUMINARY_ORB_BONUS : 0);
  const orb = Number(aspect.orb);
  if (!Number.isFinite(orb) || orb < 0) return 0;
  const closeness = 1 - Math.min(orb, allowed) / allowed;
  return MIN_ORB_FACTOR + (1 - MIN_ORB_FACTOR) * closeness;
}

/**
 * Which way this contact pushes.
 *
 * `easy` supports and `challenging` strains — those are the traditional
 * readings and the engine already labels them. A conjunction is neither by
 * default: the engine calls every conjunction "intense" precisely because
 * fusing two bodies means different things for different pairs, so the
 * direction comes from the documented pair meaning instead.
 *
 * Returns 1 (supportive), -1 (straining), or 0 (genuinely mixed — counted as
 * evidence, contributing to neither side).
 */
export function contributionDirection(aspect, meaning) {
  if (aspect.quality === "easy") return 1;
  if (aspect.quality === "challenging") return -1;
  // quality === "intense" → a conjunction. Decided per pair.
  if (meaning?.conjunction === "supportive") return 1;
  if (meaning?.conjunction === "straining") return -1;
  return 0;
}

/**
 * @typedef {object} Contribution
 * @property {string} categoryId
 * @property {number} magnitude   always positive; how much this contact matters
 * @property {number} direction   1 supportive, -1 straining, 0 mixed
 * @property {string} pair        unordered meaning key, e.g. "Mars|Venus"
 * @property {string} contact     ORDERED identity, e.g. "Venus>Mars"
 * @property {string} bodyA       body in the first chart
 * @property {string} bodyB       body in the second chart
 * @property {string} aspect
 * @property {number} orb
 * @property {string[]} themes
 */

/**
 * DIRECTION MATTERS, and this is the subtle part.
 *
 * The engine compares every body in chart A against every body in chart B with
 * no i<j skip, so "A's Venus to B's Mars" and "A's Mars to B's Venus" both
 * appear and are genuinely two different contacts — one is your affection
 * meeting their drive, the other is your drive meeting their affection. People
 * feel those differently.
 *
 * The MEANING of the pair is symmetric (Mars-Venus is about attraction whoever
 * holds which), so pairMeaning uses the sorted key. The IDENTITY is not, so
 * dedup and display use the ordered one. Getting this backwards silently
 * halves the evidence and nobody would ever see it in a score.
 */
function contactKey(aspect) {
  return `${aspect.personA}>${aspect.personB}`;
}

/**
 * All contributions this aspect makes, for one relationship mode.
 *
 * An aspect legitimately speaks to several categories — a Mercury-Mars square
 * says something about communication AND about conflict. Each lands with its
 * own documented weight. The same aspect never lands twice in the SAME
 * category: themes are merged per category first, so a pair carrying both
 * `drive` and `friction` into `conflict_repair` contributes once, at the
 * stronger of the two weights, rather than counting itself twice.
 */
export function contributionsFor(aspect, mode) {
  const meaning = pairMeaning(aspect.personA, aspect.personB);
  if (!meaning) return [];
  const themeMap = THEME_TO_CATEGORY[mode];
  if (!themeMap) return [];

  const aspectWeight = ASPECT_WEIGHTS[aspect.aspect] ?? 0;
  const factor = orbFactor(aspect);
  const direction = contributionDirection(aspect, meaning);
  const base = aspectWeight * factor * (meaning.intensity ?? 1);
  if (!(base > 0)) return [];

  // Merge themes per category, keeping the strongest weight rather than summing
  // — that is the anti-double-count rule, and it is why a pair with three
  // overlapping themes cannot shout down a pair with one.
  const perCategory = new Map();
  for (const theme of meaning.themes) {
    const targets = themeMap[theme];
    if (!targets) continue;                       // theme has no category in this mode
    for (const [categoryId, weight] of Object.entries(targets)) {
      const existing = perCategory.get(categoryId) ?? 0;
      if (weight > existing) perCategory.set(categoryId, weight);
    }
  }

  return [...perCategory.entries()].map(([categoryId, weight]) => ({
    categoryId,
    magnitude: base * weight,
    direction,
    pair: pairKey(aspect.personA, aspect.personB),
    contact: contactKey(aspect),
    bodyA: aspect.personA,
    bodyB: aspect.personB,
    aspect: aspect.aspect,
    orb: aspect.orb,
    themes: meaning.themes,
  }));
}

/**
 * Every contribution from a synastry aspect list, for one mode.
 *
 * Deduplicated by (ordered contact, aspect, category) — see contactKey above
 * for why the order is load-bearing. The engine already reports at most one
 * aspect per ordered body pair, so this only fires if the same contact somehow
 * arrives twice; output is sorted tightest-first, so the tighter one wins.
 */
export function collectEvidence(aspects, mode) {
  const seen = new Set();
  const out = [];
  for (const aspect of Array.isArray(aspects) ? aspects : []) {
    for (const contribution of contributionsFor(aspect, mode)) {
      const key = `${contribution.contact}|${contribution.aspect}|${contribution.categoryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(contribution);
    }
  }
  return out;
}
