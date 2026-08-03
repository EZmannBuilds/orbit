// Orbit Axis :: Symbol Atlas — basic combination explanations (Dev Update 3.1).
//
// WHAT THIS IS. Orbit already shows combinations on other surfaces: "Moon in
// Cancer" on My Chart, "Mercury trine Jupiter" in the aspect list, "Sun
// conjunct Midheaven" in transits. Until now those were two links to two
// entries and nothing that explained the pairing. This composes the
// explanation from the canonical entries themselves.
//
// WHAT THIS IS NOT. It is not a second astrology engine: nothing here reads a
// chart, computes a position, or decides whether a combination applies. It
// takes two slugs that some other part of Orbit has already established and
// explains what those two symbols mean together. It is not an interpretation
// service either — there are no thousands of authored pages behind it, and no
// model generating text at read time.
//
// THE RULES, which the tests enforce:
//
//   Deterministic     same input produces byte-identical output, forever.
//   No AI             no request, no model, no generation.
//   No randomness     no Math.random, no Date, no shuffling, no rotation.
//   No new claims     every clause traces to an authored field on an entry.
//   Fails safe        a missing building block returns null, and the caller
//                     falls back to plain links to the canonical entries.
//   Order-stable      "Moon square Saturn" and "Saturn square Moon" compose
//                     the same page, because the pair is normalised to
//                     canonical entry order before anything is written.
//
// HOW THE COMPOSITION AVOIDS SAYING THE SAME THING TWICE. Each authored
// fragment is used exactly once per page. `role` (what a planet does), `style`
// (how a sign expresses it), `arena` (what a house directs it toward),
// `interaction` (how an aspect relates two functions), and `axisRole` (what an
// angle marks) appear in the composed sentence and nowhere else on the page.
// The definition sections quote each entry's one-sentence `summary`, which is
// a different string. Nothing is restated in different words, because
// restating a claim in different words is how a composed page starts
// contradicting itself.

import { ATLAS_ENTRIES, atlasEntry } from "./index.js";

// Canonical position of an entry, for order-stable pair normalisation. Built
// lazily for the same reason search.js builds its index lazily: index.js
// re-exports this module, so an eager build would read ATLAS_ENTRIES while
// that module is still initializing.
let ORDER = null;
function entryOrder(entry) {
  if (!ORDER) ORDER = new Map(ATLAS_ENTRIES.map((e) => [`${e.category}/${e.slug}`, e.order]));
  return ORDER.get(`${entry.category}/${entry.slug}`) ?? Number.MAX_SAFE_INTEGER;
}

export const COMBINATION_TYPES = Object.freeze({
  "planet-in-sign": Object.freeze({
    slug: "planet-in-sign",
    label: "Planet in Sign",
    parts: Object.freeze(["planets", "signs"]),
  }),
  "planet-in-house": Object.freeze({
    slug: "planet-in-house",
    label: "Planet in House",
    parts: Object.freeze(["planets", "houses"]),
  }),
  "planet-aspect-planet": Object.freeze({
    slug: "planet-aspect-planet",
    label: "Planet aspect Planet",
    parts: Object.freeze(["planets", "aspects", "planets"]),
  }),
  "planet-with-angle": Object.freeze({
    slug: "planet-with-angle",
    label: "Planet with Angle",
    parts: Object.freeze(["planets", "angles"]),
  }),
});

export const COMBINATION_TYPE_LIST = Object.freeze(Object.values(COMBINATION_TYPES));

/**
 * "a square" but "an opposition". Computed from the word rather than authored,
 * so an aspect added later cannot ship with the wrong article. Aspect names
 * are ordinary English words with no silent-h or long-u traps among them, so
 * the vowel test is sufficient here and stays where it can be seen.
 */
function article(word) {
  return /^[aeiou]/i.test(String(word)) ? "an" : "a";
}

/** A link descriptor back to a canonical entry. Rendering escapes it. */
function ref(entry) {
  return { label: entry.title, category: entry.category, slug: entry.slug };
}

/**
 * The one caveat every combination carries, chosen by what the combination
 * actually depends on. House and angle combinations need a birth time; sign
 * and aspect combinations do not, and claiming otherwise would be a small lie
 * repeated on hundreds of pages.
 */
const BIRTH_TIME_NOTE =
  "This combination depends on an accurate birth time. Without one, Orbit "
  + "leaves the placement out rather than guessing at it.";

const FULL_CHART_NOTE =
  "One combination is one factor among many. Other placements, the houses "
  + "involved, and aspects to either symbol can change how this reads — and a "
  + "single pairing does not describe a person.";

/**
 * Planet in Sign. The planet supplies the FUNCTION; the sign supplies the
 * STYLE it is expressed in. Those two jobs stay separate on purpose: a sign
 * says how, not where, and conflating the two is the error the whole Atlas is
 * arranged to avoid.
 */
function planetInSign(planet, sign) {
  if (!planet?.role || !sign?.style) return null;
  return {
    kind: "planet-in-sign",
    typeLabel: COMBINATION_TYPES["planet-in-sign"].label,
    title: `${planet.title} in ${sign.title}`,
    glyphs: [planet.glyph, sign.glyph],
    composed: `${planet.title} describes ${planet.role}. In ${sign.title}, that function tends to be expressed ${sign.style}.`,
    sections: [
      { heading: `What ${planet.title} describes`, body: planet.summary },
      { heading: `What ${sign.title} does to it`, body: sign.summary },
      {
        heading: "Reading them together",
        body: `${sign.title} describes the style of the expression, not how strong the function is `
          + `and not which area of life it operates in. The house ${planet.title} falls in supplies `
          + `that, and any aspects to it qualify the whole picture.`,
      },
    ],
    contributions: [
      { heading: `${planet.title} brings`, items: planet.strengths },
      { heading: `${sign.title} brings`, items: sign.strengths },
    ],
    tensions: [
      { heading: `Where ${planet.title} can strain`, items: planet.challenges },
      { heading: `Where ${sign.title} can strain`, items: sign.challenges },
    ],
    note: FULL_CHART_NOTE,
    entries: [ref(planet), ref(sign)],
  };
}

/**
 * Planet in House. The planet supplies the FUNCTION; the house supplies the
 * AREA OF LIFE. Deliberately worded so that no sentence can be read as the
 * house supplying a style — that is the sign's job, and this composer has no
 * access to a sign at all.
 */
function planetInHouse(planet, house) {
  if (!planet?.role || !house?.arena) return null;
  return {
    kind: "planet-in-house",
    typeLabel: COMBINATION_TYPES["planet-in-house"].label,
    title: `${planet.title} in the ${house.title}`,
    glyphs: [planet.glyph, house.glyph],
    composed: `${planet.title} describes ${planet.role}. The ${house.title} directs that function toward ${house.arena}.`,
    sections: [
      { heading: `What ${planet.title} describes`, body: planet.summary },
      { heading: `What the ${house.title} covers`, body: house.summary },
      {
        heading: "Reading them together",
        body: `The house says which area of life the function operates in. It does not describe `
          + `the style of it — the sign ${planet.title} occupies supplies that, and the two answer `
          + `different questions about the same placement.`,
      },
    ],
    contributions: [
      { heading: `${planet.title} brings`, items: planet.strengths },
      { heading: `The ${house.title} asks for`, items: house.strengths },
    ],
    tensions: [
      { heading: `Where ${planet.title} can strain`, items: planet.challenges },
      { heading: `Where the ${house.title} can strain`, items: house.challenges },
    ],
    note: `${BIRTH_TIME_NOTE} ${FULL_CHART_NOTE}`,
    entries: [ref(planet), ref(house)],
  };
}

/**
 * Planet aspect Planet. The aspect supplies the RELATIONSHIP between two
 * functions and nothing else — it does not decide whether the result is good.
 * Each aspect's own `pairNote` carries that argument in its own words, so five
 * aspect pages do not share one sentence.
 *
 * The pair is normalised to canonical entry order first, so Moon-square-Saturn
 * and Saturn-square-Moon are the same page rather than two pages that disagree
 * about which planet is mentioned first.
 */
function planetAspectPlanet(a, aspect, b) {
  if (!a?.role || !b?.role || !aspect?.interaction) return null;
  if (a.id === b.id) return null;                   // a planet does not aspect itself
  const [first, second] = entryOrder(a) <= entryOrder(b) ? [a, b] : [b, a];
  return {
    kind: "planet-aspect-planet",
    typeLabel: COMBINATION_TYPES["planet-aspect-planet"].label,
    title: `${first.title} ${aspect.title.toLowerCase()} ${second.title}`,
    glyphs: [first.glyph, aspect.glyph, second.glyph],
    composed: `${first.title} describes ${first.role}; ${second.title} describes ${second.role}. `
      + `In ${article(aspect.title)} ${aspect.title.toLowerCase()}, the two ${aspect.interaction}.`,
    sections: [
      { heading: `What ${article(aspect.title)} ${aspect.title.toLowerCase()} is`, body: aspect.summary },
      { heading: "Why the pair matters more than the angle", body: aspect.pairNote },
      {
        heading: "Reading them together",
        body: `The angle describes the relationship between the two functions. How much weight it `
          + `carries depends on how close the two are to exact — Orbit's orb for ${article(aspect.title)} `
          + `${aspect.title.toLowerCase()} is ${aspect.facts.orb.toLowerCase()}, and a contact near the edge of `
          + `that allowance is read more lightly than one near exact.`,
      },
    ],
    contributions: [
      { heading: `${first.title} brings`, items: first.strengths },
      { heading: `${second.title} brings`, items: second.strengths },
    ],
    tensions: [
      { heading: `Where ${first.title} can strain`, items: first.challenges },
      { heading: `Where ${second.title} can strain`, items: second.challenges },
    ],
    note: FULL_CHART_NOTE,
    entries: [ref(first), ref(aspect), ref(second)],
  };
}

/**
 * Planet with Angle. Angles are calculated points rather than bodies, so the
 * wording says "close to" rather than "in" — a planet does not occupy an angle
 * the way it occupies a sign, and the copy is not allowed to imply it does.
 */
function planetWithAngle(planet, angle) {
  if (!planet?.role || !angle?.axisRole) return null;
  return {
    kind: "planet-with-angle",
    typeLabel: COMBINATION_TYPES["planet-with-angle"].label,
    title: `${planet.title} with the ${angle.title}`,
    glyphs: [planet.glyph, angle.glyph],
    composed: `${planet.title} describes ${planet.role}. Sitting close to the ${angle.title} — ${angle.axisRole} — `
      + `tends to make that function unusually prominent.`,
    sections: [
      { heading: `What ${planet.title} describes`, body: planet.summary },
      { heading: `What the ${angle.title} marks`, body: angle.summary },
      {
        heading: "Reading them together",
        body: `An angle is a calculated point rather than a body, so a planet is read as close to it `
          + `rather than placed in it. Proximity is what does the work here: the nearer the planet `
          + `sits to the exact degree, the more prominent its function tends to be. The opposite end `
          + `of the ${angle.facts.axis} axis is part of the same reading.`,
      },
    ],
    contributions: [
      { heading: `${planet.title} brings`, items: planet.strengths },
      { heading: `The ${angle.title} brings`, items: angle.strengths },
    ],
    tensions: [
      { heading: `Where ${planet.title} can strain`, items: planet.challenges },
      { heading: `Where the ${angle.title} can strain`, items: angle.challenges },
    ],
    note: `${BIRTH_TIME_NOTE} ${FULL_CHART_NOTE}`,
    entries: [ref(planet), ref(angle)],
  };
}

/**
 * Compose a combination from route parts, or return null.
 *
 * Null is the only failure mode: an unknown type, a slug that resolves to
 * nothing, a wrong-category slug, or an entry missing its composition field
 * all return null, and the caller shows the canonical entries instead. Nothing
 * here throws on junk input, because these values arrive straight off a URL.
 */
export function composeCombination(type, parts) {
  const spec = COMBINATION_TYPES[String(type ?? "").toLowerCase().trim()];
  if (!spec || !Array.isArray(parts) || parts.length !== spec.parts.length) return null;

  const entries = spec.parts.map((category, i) => atlasEntry(category, parts[i]));
  if (entries.some((e) => !e)) return null;

  switch (spec.slug) {
    case "planet-in-sign": return planetInSign(entries[0], entries[1]);
    case "planet-in-house": return planetInHouse(entries[0], entries[1]);
    case "planet-aspect-planet": return planetAspectPlanet(entries[0], entries[1], entries[2]);
    case "planet-with-angle": return planetWithAngle(entries[0], entries[1]);
    default: return null;
  }
}

/** The route path for a combination, without the leading "#". */
export function combinationPath(type, parts) {
  return `symbol-atlas/combinations/${type}/${parts.join("/")}`;
}

/**
 * Whichever canonical entries a failed combination was reaching for, so the
 * not-found view can still be useful. Returns whatever resolved, in order.
 */
export function combinationFallbackEntries(type, parts) {
  const spec = COMBINATION_TYPES[String(type ?? "").toLowerCase().trim()];
  if (!spec || !Array.isArray(parts)) return [];
  return spec.parts
    .map((category, i) => atlasEntry(category, parts[i]))
    .filter(Boolean);
}

/**
 * A small, fixed set of worked examples for the combinations index. Authored
 * order, no sampling, no rotation — the page looks the same on every visit.
 */
export const COMBINATION_EXAMPLES = Object.freeze([
  Object.freeze({ type: "planet-in-sign", parts: Object.freeze(["moon", "cancer"]) }),
  Object.freeze({ type: "planet-in-sign", parts: Object.freeze(["mars", "aries"]) }),
  Object.freeze({ type: "planet-in-house", parts: Object.freeze(["saturn", "4th-house"]) }),
  Object.freeze({ type: "planet-in-house", parts: Object.freeze(["jupiter", "10th-house"]) }),
  Object.freeze({ type: "planet-aspect-planet", parts: Object.freeze(["moon", "square", "saturn"]) }),
  Object.freeze({ type: "planet-aspect-planet", parts: Object.freeze(["venus", "opposition", "mars"]) }),
  Object.freeze({ type: "planet-with-angle", parts: Object.freeze(["sun", "midheaven"]) }),
]);

/**
 * Validate the combination layer against the whole content set. Returns a list
 * of problems; empty means every combination the routes can reach composes.
 *
 * This is exhaustive rather than sampled: 10 planets × 12 signs, 10 × 12
 * houses, 10 × 5 aspects × 10 planets, and 10 × 4 angles — every page the URL
 * space can produce, checked for a missing building block, an empty clause, or
 * a reference that does not resolve.
 */
export function validateCombinations() {
  const problems = [];
  const byCategory = (c) => ATLAS_ENTRIES.filter((e) => e.category === c);
  const planets = byCategory("planets");
  const check = (type, parts) => {
    const composed = composeCombination(type, parts);
    const where = `${type}/${parts.join("/")}`;
    if (!composed) { problems.push(`${where}: does not compose`); return; }
    if (!composed.composed || composed.composed.length < 40) problems.push(`${where}: composed sentence too thin`);
    if (/\s{2,}/.test(composed.composed)) problems.push(`${where}: composed sentence has a double space`);
    if (/[<>]/.test(JSON.stringify(composed))) problems.push(`${where}: angle bracket in composed output`);
    for (const e of composed.entries) {
      if (!atlasEntry(e.category, e.slug)) problems.push(`${where}: links to missing entry ${e.category}/${e.slug}`);
    }
    for (const s of composed.sections) {
      if (!s.heading || !s.body) problems.push(`${where}: empty section`);
    }
    // Determinism, asserted rather than assumed.
    if (JSON.stringify(composeCombination(type, parts)) !== JSON.stringify(composed)) {
      problems.push(`${where}: composed twice and differed`);
    }
  };

  for (const p of planets) {
    for (const s of byCategory("signs")) check("planet-in-sign", [p.slug, s.slug]);
    for (const h of byCategory("houses")) check("planet-in-house", [p.slug, h.slug]);
    for (const a of byCategory("angles")) check("planet-with-angle", [p.slug, a.slug]);
    for (const asp of byCategory("aspects")) {
      for (const q of planets) {
        if (q.id === p.id) continue;
        check("planet-aspect-planet", [p.slug, asp.slug, q.slug]);
      }
    }
  }
  return problems;
}

/** How many distinct pages the combination routes can produce. */
export function combinationCounts() {
  const n = (c) => ATLAS_ENTRIES.filter((e) => e.category === c).length;
  const planets = n("planets");
  const pairs = (planets * (planets - 1)) / 2;      // unordered: order is normalised
  return Object.freeze({
    "planet-in-sign": planets * n("signs"),
    "planet-in-house": planets * n("houses"),
    "planet-aspect-planet": pairs * n("aspects"),
    "planet-with-angle": planets * n("angles"),
  });
}
