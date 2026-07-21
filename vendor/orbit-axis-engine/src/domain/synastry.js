// Orbit Axis Engine :: synastry — aspects between two natal charts.
//
// New in Update 5.0. The Orbit Axis application had a synastry placeholder in
// its interface but no calculation behind it, so there was nothing to extract:
// this is a genuinely new capability rather than a move.
//
// The geometry is the same one already used for natal aspects and transits —
// angular separation compared against a table of aspect angles with an orb
// allowance. What differs is the pairing: every planet in chart A is compared
// against every planet in chart B, INCLUDING the same planet in both charts
// (A's Sun to B's Sun is meaningful; A's Sun to A's Sun is not a thing).
//
// Deliberately NOT included: any claim about relationship quality. This module
// reports which aspects exist, how tight they are, and whether each is
// traditionally read as easy or challenging. It does not score compatibility,
// and it does not decide whether two people suit each other. That is
// interpretation, it belongs above the engine, and it is not something an
// ephemeris can know.
//
// Pure: no I/O, no clock, no randomness.

export const SYNASTRY_VERSION = "synastry-v1";

/** Aspects considered, with base orbs. Mirrors the natal aspect table. */
export const SYNASTRY_ASPECTS = Object.freeze([
  { name: "conjunction", angle: 0,   orb: 8, quality: "intense",    plain: "meeting" },
  { name: "sextile",     angle: 60,  orb: 4, quality: "easy",       plain: "gently supporting" },
  { name: "square",      angle: 90,  orb: 6, quality: "challenging", plain: "pushing against" },
  { name: "trine",       angle: 120, orb: 6, quality: "easy",       plain: "flowing with" },
  { name: "opposition",  angle: 180, orb: 8, quality: "challenging", plain: "pulling against" },
]);

/** Bodies compared between charts, in a stable reporting order. */
export const SYNASTRY_BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto",
]);

const LUMINARIES = new Set(["Sun", "Moon"]);

function angularSeparation(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * @typedef {object} SynastryAspect
 * @property {string} personA   Body in chart A.
 * @property {string} personB   Body in chart B.
 * @property {string} aspect    conjunction | sextile | square | trine | opposition
 * @property {string} plain     Plain-language label.
 * @property {string} quality   easy | challenging | intense
 * @property {number} orb       Degrees from exact, 2dp.
 * @property {number} exactAngle
 * @property {boolean} involvesLuminary  True when the Sun or Moon is involved.
 */

/**
 * Aspects between two natal charts.
 *
 * Both arguments are charts as produced by computeNatalChart. Only planetary
 * positions are used: angles and houses depend on an accurate birth time, and
 * silently mixing a time-known chart with a time-unknown one would produce
 * confident-looking nonsense. Callers that care should check `time_known` on
 * each chart and say so.
 *
 * @param {{ planets?: Record<string, {longitude:number}> }} chartA
 * @param {{ planets?: Record<string, {longitude:number}> }} chartB
 * @param {{ bodies?: readonly string[] }} [options]
 * @returns {SynastryAspect[]} sorted tightest orb first
 */
export function computeSynastryAspects(chartA, chartB, { bodies = SYNASTRY_BODIES } = {}) {
  const out = [];
  for (const a of bodies) {
    const pa = chartA?.planets?.[a];
    if (!pa) continue;
    for (const b of bodies) {
      const pb = chartB?.planets?.[b];
      if (!pb) continue;
      const sep = angularSeparation(pa.longitude, pb.longitude);
      const involvesLuminary = LUMINARIES.has(a) || LUMINARIES.has(b);
      for (const asp of SYNASTRY_ASPECTS) {
        // A luminary widens the orb, matching the natal aspect rules.
        const allowed = asp.orb + (involvesLuminary ? 1 : 0);
        const delta = Math.abs(sep - asp.angle);
        if (delta > allowed) continue;
        out.push({
          personA: a, personB: b,
          aspect: asp.name, plain: asp.plain, quality: asp.quality,
          orb: Math.round(delta * 100) / 100,
          exactAngle: asp.angle,
          involvesLuminary,
        });
        break; // tightest aspect for this pair only
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

/**
 * A structural summary of a synastry comparison.
 *
 * Counts and lists, not a verdict. "easy" and "challenging" are the traditional
 * readings of those aspect families; they are labels for what was calculated,
 * not predictions and not a compatibility score.
 *
 * @param {SynastryAspect[]} aspects
 * @returns {{ total:number, easy:number, challenging:number, intense:number,
 *             luminaryContacts:number, tightest:SynastryAspect|null }}
 */
export function summariseSynastry(aspects) {
  const list = Array.isArray(aspects) ? aspects : [];
  return {
    total: list.length,
    easy: list.filter((a) => a.quality === "easy").length,
    challenging: list.filter((a) => a.quality === "challenging").length,
    intense: list.filter((a) => a.quality === "intense").length,
    luminaryContacts: list.filter((a) => a.involvesLuminary).length,
    tightest: list.length ? list[0] : null,
  };
}
