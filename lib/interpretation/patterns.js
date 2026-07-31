// Orbit Axis :: elements, modalities, retrogrades, and angles.
//
// The small layers. Each one exists because the engine returns a fact that
// needs words, and none of them is big enough to earn its own file.
//
// WEIGHTING IS THE ENGINE'S, NOT OURS. element_balance and modality_balance
// arrive already counted — including fractional counts, because the engine
// weights some bodies differently. Nothing here recounts them; the copy reports
// what was calculated and says which bodies were included.

export const ELEMENTS = Object.freeze({
  Fire: {
    id: "fire", name: "Fire", signs: ["Aries", "Leo", "Sagittarius"],
    short: "energy and initiative",
    emphasised: "You tend to move first and work out the details in motion. "
              + "Enthusiasm is available to you, and so is the risk of spending it faster than it refills.",
    lighter: "Starting things from a standstill may take more deliberate effort. "
           + "That is not a lack of drive — it often means momentum comes from another part of the chart.",
  },
  Earth: {
    id: "earth", name: "Earth", signs: ["Taurus", "Virgo", "Capricorn"],
    short: "practicality and follow-through",
    emphasised: "You tend to want things that hold up — plans that survive contact with a calendar. "
              + "The same steadiness can make changing course feel more expensive than it is.",
    lighter: "The practical scaffolding may be less instinctive, and worth building on purpose. "
           + "It says nothing about capability, only about where your attention goes first.",
  },
  Air: {
    id: "air", name: "Air", signs: ["Gemini", "Libra", "Aquarius"],
    short: "thinking and connection",
    emphasised: "You tend to process by thinking and talking, and to look for the pattern behind a situation. "
              + "Distance helps you see clearly, and can also be a way of not feeling something yet.",
    lighter: "Stepping back to analyse may be less automatic. "
           + "Other parts of the chart likely handle understanding through feel or through doing instead.",
  },
  Water: {
    id: "water", name: "Water", signs: ["Cancer", "Scorpio", "Pisces"],
    short: "feeling and attunement",
    emphasised: "You tend to read the emotional temperature of a situation early, often before it is spoken. "
              + "That sensitivity is information, and it can be tiring to carry in crowded places.",
    lighter: "Emotional undercurrents may be something you notice later rather than immediately. "
           + "This is about where attention lands first — not about how much you feel.",
  },
});

export const MODALITIES = Object.freeze({
  Cardinal: {
    id: "cardinal", name: "Cardinal", verb: "initiates",
    signs: ["Aries", "Cancer", "Libra", "Capricorn"],
    short: "starting things",
    emphasised: "You are often the one who opens something — a project, a conversation, a change of direction.",
    growth: "Finishing can need more deliberate attention than beginning.",
  },
  Fixed: {
    id: "fixed", name: "Fixed", verb: "sustains",
    signs: ["Taurus", "Leo", "Scorpio", "Aquarius"],
    short: "holding things steady",
    emphasised: "You tend to stay with what you have committed to, well past the point where interest alone would carry it.",
    growth: "Changing an approach that has stopped working can take longer than it needs to.",
  },
  Mutable: {
    id: "mutable", name: "Mutable", verb: "adapts",
    signs: ["Gemini", "Virgo", "Sagittarius", "Pisces"],
    short: "adjusting to what is actually happening",
    emphasised: "You adjust readily as circumstances change, and tend to be useful in situations that will not hold still.",
    growth: "Holding one line when adapting would be easier is the harder skill here.",
  },
});

/** Below this spread, no single element or modality is meaningfully dominant. */
export const DOMINANCE_THRESHOLD_PERCENT = 5;

/**
 * Is the engine's `dominant` value actually a standout, or just the top of a
 * flat distribution?
 *
 * The engine names a dominant even when the spread is 26/24/26/24, and calling
 * that "an Earth chart" would be a claim the numbers do not support.
 */
export function isMeaningfullyDominant(percentages, dominant) {
  if (!percentages || !dominant) return false;
  const values = Object.values(percentages).filter((n) => Number.isFinite(n));
  if (values.length < 2) return false;
  const top = percentages[dominant];
  const rest = values.filter((v) => v !== top);
  const runnerUp = Math.max(...(rest.length ? rest : values));
  return (top - runnerUp) >= DOMINANCE_THRESHOLD_PERCENT;
}

/** The least-represented key, when it is meaningfully below the others. */
export function leastRepresented(percentages) {
  if (!percentages) return null;
  const entries = Object.entries(percentages).filter(([, n]) => Number.isFinite(n));
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  const [lowKey, lowValue] = sorted[0];
  const [, nextValue] = sorted[1];
  return (nextValue - lowValue) >= DOMINANCE_THRESHOLD_PERCENT ? lowKey : null;
}

/* ── Retrograde ─────────────────────────────────────────────────────────── */

export const RETROGRADE = Object.freeze({
  general: "A planet that was retrograde at birth is not damaged or unlucky. "
         + "It tends to describe a function that works inwardly first — "
         + "reviewed, questioned, and worked out privately before it is "
         + "expressed outwardly.",
  // Natal retrograde is not the transit kind, and conflating them is the most
  // common way this topic gets frightening.
  notTransit: "This describes the planet's motion on your birth date, not a "
            + "retrograde happening now.",
  byPlanet: Object.freeze({
    Mercury: "Thinking may run inward before it runs outward — working the idea "
           + "through privately, then explaining it once it holds together.",
    Venus: "What you value tends to be arrived at rather than assumed, often "
         + "after some reconsidering of what you were told to want.",
    Mars: "Drive may be held and aimed rather than discharged immediately, which "
        + "can read as patience or as slow-burning frustration.",
    Jupiter: "Growth tends to come from your own conclusions rather than from "
           + "inherited beliefs about what a bigger life looks like.",
    Saturn: "Authority is something you work out for yourself, which can make "
          + "external rules feel less automatically binding.",
    Uranus: "The need for independence tends to be internal before it is visible.",
    Neptune: "Imagination and idealism are turned inward — a private landscape "
           + "more than a public one.",
    Pluto: "Change tends to be worked through internally, out of anyone's view.",
  }),
});

// The luminaries never retrograde, so writing copy for them would be writing
// for a case that cannot occur.
export const NEVER_RETROGRADE = Object.freeze(["Sun", "Moon"]);

/* ── Angles ─────────────────────────────────────────────────────────────── */

export const ANGLES = Object.freeze({
  Ascendant: {
    id: "ascendant", name: "Rising sign", technical: "Ascendant",
    core: "Your Rising sign is the manner you lead with — how you approach new "
        + "situations and how people tend to read you before they know you. It "
        + "also sets the house layout for the whole chart, which is why it "
        + "needs an accurate birth time.",
  },
  MC: {
    id: "midheaven", name: "Midheaven", technical: "MC",
    core: "The Midheaven describes your public direction — the work you become "
        + "known for and the way you are seen in a professional or public "
        + "context.",
  },
});

export function angleMeaning(key) {
  return ANGLES[key] || ANGLES[key === "midheaven" ? "MC" : key] || null;
}
