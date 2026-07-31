// Orbit Axis :: what the chart will not claim, and why.
//
// These are keyed to the engine's own warning codes so the interface can never
// disagree with the calculation about what is missing. If the engine says
// `rising_unavailable`, that is the only reason Rising is absent — the UI does
// not get its own opinion.
//
// ONE page-level notice, not a badge on every card. Repeating a warning eleven
// times does not make it clearer, it makes it wallpaper.

export const LIMITATIONS = Object.freeze({
  birth_time_unknown: {
    id: "birth_time_unknown",
    title: "This chart was calculated without a birth time",
    body: "Your planet signs, aspects, and element and modality balance are all "
        + "calculated normally. House placements, the Rising sign, and the "
        + "Midheaven need an accurate birth time, so Orbit Axis leaves them out "
        + "rather than guessing at them.",
    action: "Adding a birth time later unlocks houses and angles.",
  },
  rising_unavailable: {
    id: "rising_unavailable",
    title: "Rising sign unavailable",
    body: "A reliable birth time is needed to calculate the Ascendant and house "
        + "placements.",
  },
  houses_unavailable: {
    id: "houses_unavailable",
    title: "House placements unavailable",
    body: "Houses are worked out from the birth time and place together. "
        + "Without a time, there is no honest way to place them.",
  },
  moon_approximate: {
    id: "moon_approximate",
    title: "The Moon sign may be less precise",
    // Deliberately conditional. The Moon covers roughly 13° in a day, so it
    // sometimes changes sign within one date and sometimes does not. The engine
    // reports the risk rather than proving the outcome, so the copy says "may".
    body: "The Moon moves quickly — roughly half a sign in a day. Without a "
        + "birth time it may have changed sign during that date, so treat the "
        + "Moon placement as likely rather than certain.",
  },
});

/**
 * The approximate-time caution.
 *
 * This one is NOT keyed to an engine warning, and that is a real finding rather
 * than an oversight: the engine treats `approximate` exactly like `exact` —
 * `time_known: true`, no warnings, full houses and angles. The distinction only
 * exists in what the user told us, so the caution has to come from
 * `time_accuracy` in this layer.
 */
export const APPROXIMATE_TIME_NOTICE = Object.freeze({
  id: "birth_time_approximate",
  title: "This chart uses an approximate birth time",
  body: "Everything below is calculated from the time you gave. Because it is "
      + "approximate, the placements most sensitive to timing — the Rising "
      + "sign, the Midheaven, and house placements — may shift if you find a "
      + "more exact time. Planet signs and aspects are far less affected.",
  action: "A birth certificate time is worth adding if you can find one.",
});

export function limitationFor(code) {
  return LIMITATIONS[code] || null;
}

/**
 * The single page-level notice for a chart, or null when nothing is missing.
 *
 * Engine warnings win. `moon_approximate` is folded into the unknown-time
 * notice rather than shown separately, because a reader who has just been told
 * there is no birth time does not need a second card explaining a consequence
 * of the same fact.
 */
export function chartLimitation({ time_known, time_accuracy, warnings = [] } = {}) {
  if (time_known === false || warnings.includes("birth_time_unknown")) {
    const base = LIMITATIONS.birth_time_unknown;
    const moon = warnings.includes("moon_approximate") ? LIMITATIONS.moon_approximate : null;
    return {
      ...base,
      details: [
        LIMITATIONS.rising_unavailable.body,
        LIMITATIONS.houses_unavailable.body,
        ...(moon ? [moon.body] : []),
      ],
    };
  }
  if (time_accuracy === "approximate") {
    return { ...APPROXIMATE_TIME_NOTICE, details: [] };
  }
  return null;
}
