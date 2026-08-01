// Orbit Axis :: what to say about the sky right now, and in what order.
//
// Home shows a handful of highlights, not the whole sky. Choosing which handful
// is the entire problem, and it is not solved by sorting on orb.
//
// THE TRAP: the tightest current aspects are almost always outer-planet pairs.
// On the day this was written the sky held Neptune sextile Pluto at 0.08°,
// Uranus sextile Neptune at 0.73°, and Uranus trine Pluto at 0.81° — all
// tighter than anything involving a luminary. Those three pairs stay within a
// degree of each other for *years*. Rank by orb and Home opens with the same
// three sentences every morning for the rest of the decade, which is the same
// as opening with nothing.
//
// So relevance is scored first and tightness only breaks ties. Everything here
// is pure and deterministic: same sky in, same highlights out.

const LUMINARIES = new Set(["Sun", "Moon"]);
const PERSONAL = new Set(["Mercury", "Venus", "Mars"]);
const SOCIAL = new Set(["Jupiter", "Saturn"]);

/** How much a body's involvement earns. Higher is more personally legible. */
function bodyWeight(name) {
  if (LUMINARIES.has(name)) return 3;
  if (PERSONAL.has(name)) return 2;
  if (SOCIAL.has(name)) return 1;
  return 0;                                  // outer planets: generational
}

export const ASPECT_WEIGHT = Object.freeze({
  Conjunction: 5, Opposition: 4, Square: 4, Trine: 2, Sextile: 2,
});

/**
 * An aspect between two outer planets describes a generation, not a Tuesday.
 * It is never a daily highlight, however tight it is.
 */
export function isGenerational(aspect) {
  return bodyWeight(aspect.a) === 0 && bodyWeight(aspect.b) === 0;
}

/**
 * Deterministic sort key. Read top to bottom; each field only breaks ties in
 * the field above it.
 */
export function highlightRank(aspect) {
  return {
    relevance: -(bodyWeight(aspect.a) + bodyWeight(aspect.b)),
    weight: -(ASPECT_WEIGHT[aspect.aspect] ?? 0),
    orb: Number.isFinite(aspect.orb) ? aspect.orb : 99,
    pair: `${aspect.a}|${aspect.b}|${aspect.aspect}`,   // final tie-break
  };
}

const ORDER = ["relevance", "weight", "orb", "pair"];

export function rankSkyAspects(aspects = []) {
  return aspects
    .filter((a) => a && a.a && a.b && a.aspect && !isGenerational(a))
    .map((a) => ({ aspect: a, key: highlightRank(a) }))
    .sort((x, y) => {
      for (const f of ORDER) {
        if (x.key[f] < y.key[f]) return -1;
        if (x.key[f] > y.key[f]) return 1;
      }
      return 0;
    })
    .map((x) => x.aspect);
}

export const HIGHLIGHT_COUNT = 3;

/** "2 days" / "today" — how far off a lunar event is, in whole local days. */
export function daysUntil(localDate, fromLocalDate) {
  if (!localDate || !fromLocalDate) return null;
  const a = Date.parse(`${localDate}T00:00:00Z`);
  const b = Date.parse(`${fromLocalDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

function whenLabel(days) {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The Moon, from ONE source.
 *
 * The sky payload carries phase and illumination twice — once at the top level
 * (`moon_phase_name`, `is_waxing`, `illumination_percent`) and once inside
 * `sky.moon`. They agree today because both come from the same calculation,
 * but two accessors is one more than the number that can be right, so
 * everything downstream reads `sky.moon` and nothing reads the mirror.
 */
export function moonState(sky) {
  const m = sky?.moon;
  if (!m || !m.phase_name) return null;
  const illum = Number.isFinite(m.illumination_percent) ? Math.round(m.illumination_percent) : null;
  // `m.waxing === true` used to collapse an ABSENT flag into false, which the
  // renderer then printed as "waning" — a confident claim about a direction
  // the payload never stated. Unknown now stays unknown, and the direction and
  // the terminator are both withheld rather than guessed.
  const waxing = (m.waxing === true || m.waning === false) ? true
               : (m.waxing === false || m.waning === true) ? false
               : null;
  const nextFull = daysUntil(sky?.next_full_moon?.local_date, sky?.local_date);
  const nextNew = daysUntil(sky?.next_new_moon?.local_date, sky?.local_date);
  // Whichever comes first is the one worth naming.
  const soonest = (nextFull !== null && nextNew !== null)
    ? (nextFull <= nextNew ? { kind: "Full Moon", days: nextFull, date: sky.next_full_moon.local_date }
                           : { kind: "New Moon", days: nextNew, date: sky.next_new_moon.local_date })
    : (nextFull !== null ? { kind: "Full Moon", days: nextFull, date: sky.next_full_moon.local_date }
    : (nextNew !== null ? { kind: "New Moon", days: nextNew, date: sky.next_new_moon.local_date } : null));

  return Object.freeze({
    phase: m.phase_name,
    sign: m.sign || null,
    // Degree within the sign, passed through from the canonical payload rather
    // than recomputed. Null when absent, so the scene omits the line instead
    // of printing a confident 0°.
    degrees: Number.isFinite(m.degrees) ? m.degrees : null,
    minutes: Number.isFinite(m.minutes) ? m.minutes : null,
    // The ecliptic longitude sign and degree are derived from. Carried so a
    // reader can reconcile the two rather than having to trust them.
    longitude: Number.isFinite(m.longitude) ? m.longitude : null,
    // Sun–Moon elongation: the canonical phase angle the eight phase buckets
    // and the illumination figure are both derived from. Carried so the scene
    // has the precise value available and never has to infer one from a label.
    elongation: Number.isFinite(m.elongation_degrees) ? m.elongation_degrees : null,
    illumination: illum,
    waxing,
    direction: waxing === null ? null : (waxing ? "waxing" : "waning"),
    // Reflective, never predictive. Describes the light, not the reader — and
    // says nothing at all when the direction is unknown, since both sentences
    // would be a claim about which way the light is going.
    meaning: waxing === null
      ? "Whether the Moon is filling out or drawing back isn’t available right now."
      : waxing
        ? "The Moon is filling out — light building night after night."
        : "The Moon is drawing back — light easing off night after night.",
    nextEvent: soonest ? { ...soonest, when: whenLabel(soonest.days) } : null,
    source_version: "home-v1",
  });
}

/** Plain sentences for the ranked aspects. No grading, no prediction. */
const INTERACTION = Object.freeze({
  Conjunction: "are sitting together",
  Opposition: "are facing each other",
  Square: "are at odds",
  Trine: "are working easily together",
  Sextile: "are within easy reach of each other",
});

/**
 * Destinations Home is allowed to link to.
 *
 * There is no Positions workspace yet — it is Dev Update 1.7 — so nothing here
 * may point at `#positions`, however natural it reads. A highlight that links
 * somewhere nonexistent is worse than one that does not link at all.
 */
export const HIGHLIGHT_DESTINATIONS = Object.freeze(["#transits", "#symbol-atlas", "#me"]);

export function composeHighlights(sky, { limit = HIGHLIGHT_COUNT } = {}) {
  if (!sky) return [];
  const out = [];
  const moon = moonState(sky);

  if (sky.zodiac_season) {
    out.push({ id: "season", kind: "season", label: `${sky.zodiac_season} season`,
               detail: `The Sun is travelling through ${sky.zodiac_season}.`, href: "#symbol-atlas" });
  }
  if (moon?.sign) {
    out.push({ id: "moon-sign", kind: "moon", label: `Moon in ${moon.sign}`,
               detail: `${moon.phase}, ${moon.illumination}% lit and ${moon.direction}.`, href: "#transits" });
  }
  for (const a of rankSkyAspects(sky.aspects).slice(0, limit)) {
    out.push({
      id: `${a.a}-${a.aspect}-${a.b}`.toLowerCase(),
      kind: "aspect",
      label: `${a.a} ${a.aspect.toLowerCase()} ${a.b}`,
      detail: `${a.a} and ${a.b} ${INTERACTION[a.aspect] || "are in aspect"}`
            + (Number.isFinite(a.orb) ? ` — ${a.orb.toFixed(1)}° from exact.` : "."),
      href: "#transits",
    });
  }
  const retro = (sky.retrogrades || []).filter(Boolean);
  if (retro.length) {
    out.push({
      id: "retrogrades", kind: "retrograde",
      label: retro.length === 1 ? `${retro[0]} retrograde` : `${retro.length} planets retrograde`,
      detail: `${retro.join(", ")} appear to be moving backwards from here.`,
      href: "#transits",
    });
  }
  return out;
}
