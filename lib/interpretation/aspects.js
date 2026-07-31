// Orbit Axis :: how two functions interact, and which interactions to show.
//
// The five major aspects the engine returns, and nothing else. There is no
// applying/separating copy here because the natal chart response does not
// carry that distinction — inventing it would be inventing a chart fact.
//
// TONE. Squares are not bad and trines are not good. A square is friction that
// produces movement; a trine is ease that can go unused. Copy that grades
// aspects morally is both wrong and, worse, boring — it makes every chart read
// like a school report.

export const ASPECTS = Object.freeze({
  Conjunction: {
    id: "conjunction",
    name: "Conjunction",
    exactAngle: 0,
    interaction: "act as one",
    detail: "These two work as a single unit — it can be hard to feel them "
          + "separately, because whatever moves one tends to move the other.",
    constructive: "concentrated force when both functions want the same thing",
    tension: "difficulty telling the two apart when they want different things",
    weight: 5,
  },
  Opposition: {
    id: "opposition",
    name: "Opposition",
    exactAngle: 180,
    interaction: "pull against each other",
    detail: "These two sit across from each other, and satisfying one can feel "
          + "like neglecting the other. The pull is usually most obvious in "
          + "situations that ask you to pick a side.",
    constructive: "perspective, once both ends are given room rather than one winning",
    tension: "swinging between the two instead of holding them together",
    weight: 4,
  },
  Square: {
    id: "square",
    name: "Square",
    exactAngle: 90,
    interaction: "grind against each other",
    detail: "These two work in ways that do not naturally fit, so acting on "
          + "one tends to cost the other something. That friction is also "
          + "where a lot of the chart's momentum comes from.",
    constructive: "genuine drive — this is the aspect that makes people build things",
    tension: "recurring internal argument when neither function will give way",
    weight: 4,
  },
  Trine: {
    id: "trine",
    name: "Trine",
    exactAngle: 120,
    interaction: "flow together",
    detail: "These two cooperate without much effort. The ease is real, and it "
          + "is also easy to leave unused, because nothing forces you to "
          + "develop it.",
    constructive: "a capability that is available whenever you reach for it",
    tension: "taking the talent for granted and never testing its limits",
    weight: 2,
  },
  Sextile: {
    id: "sextile",
    name: "Sextile",
    exactAngle: 60,
    interaction: "support each other",
    detail: "These two work well together when you make the connection "
          + "deliberately. It tends to show up as an option rather than an "
          + "automatic strength.",
    constructive: "a reliable combination once you have noticed it is there",
    tension: "leaving the opportunity on the table because nothing insists",
    weight: 2,
  },
});

export function aspectMeaning(name) {
  return ASPECTS[name] || null;
}

/* ── Ranking ──────────────────────────────────────────────────────────────
   A chart returns roughly 25 aspects. Showing all of them, unsorted, is the
   same as showing none: nothing stands out and the reader gives up. So the
   list is ranked by rules that are written down here rather than by an opaque
   "importance score" that nobody can check.

   Every input is a fact the engine supplied. Nothing is invented.

     1. Involves a luminary (Sun or Moon)      — the chart's two loudest bodies
     2. Involves an angle (Ascendant or MC)    — anchors of the whole chart
     3. Involves a personal planet             — felt day to day
     4. Aspect type weight                     — a square outranks a sextile
     5. Tightness of orb                       — a 0.4° contact is more pointed
     6. Alphabetical pair                      — a deterministic final tie-break

   Rule 6 exists so the order can never change between two renders of the same
   chart. A list that reshuffles itself is a list nobody trusts. */

const LUMINARIES = new Set(["Sun", "Moon"]);
const ANGLES = new Set(["Ascendant", "MC", "Midheaven"]);
const PERSONAL = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars"]);

export function aspectRank(aspect) {
  const bodies = [aspect.a, aspect.b];
  return {
    luminary: bodies.some((b) => LUMINARIES.has(b)) ? 0 : 1,
    angle: bodies.some((b) => ANGLES.has(b)) ? 0 : 1,
    personal: bodies.some((b) => PERSONAL.has(b)) ? 0 : 1,
    weight: -(ASPECTS[aspect.aspect]?.weight ?? 0),
    orb: Number.isFinite(aspect.orb) ? aspect.orb : 99,
    pair: `${aspect.a}|${aspect.b}|${aspect.aspect}`,
  };
}

export function rankAspects(aspects = []) {
  return [...aspects].sort((x, y) => {
    const a = aspectRank(x);
    const b = aspectRank(y);
    return a.luminary - b.luminary
      || a.angle - b.angle
      || a.personal - b.personal
      || a.weight - b.weight
      || a.orb - b.orb
      || a.pair.localeCompare(b.pair);
  });
}

/** How many to show before "show all" — enough to be useful, few enough to read. */
export const ASPECT_HIGHLIGHT_COUNT = 5;
