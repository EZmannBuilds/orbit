// Orbit Axis :: the current sky, described.
//
// Current Positions answers "where is each planet right now" — a question about
// the shared sky that needs no birth chart. Today's Transits answers how that
// sky meets one person's chart. Keeping those apart is the whole reason this
// module exists separately from the interpretation layer.
//
// Everything here is pure. The canonical `/api/sky/current` response is the only
// input; nothing recalculates astrology.

import { PLANETS, PLANET_ORDER } from "../interpretation/planets.js";

export { PLANET_ORDER };

/**
 * Mean APPARENT (geocentric) daily motion, degrees per day.
 *
 * WHY THIS EXISTS: the payload's `speed` is degrees/day, and the bodies differ
 * by roughly seven hundred times — the Moon covers ~13° a day, Pluto about
 * 0.018°. A single "slow" threshold is therefore meaningless: it would call
 * Pluto slow on every day it has ever existed and never call the Moon slow at
 * all. Speed is only interpretable relative to what that body normally does.
 *
 * WHY *APPARENT*, NOT ORBITAL: this was first written from orbital period
 * (360° ÷ period), which is the wrong reference and produced visibly wrong
 * output — Neptune and Pluto were labelled "Moving quickly" whenever they were
 * retrograde. An outer planet's apparent speed from Earth is dominated by
 * Earth's own motion, not by its orbit, so its retrograde speed is several
 * times its orbital mean. Orbital values were low by 3–4.5× for the outer
 * planets, which is exactly the size of that error.
 *
 * These are measured from the engine itself: mean |speed| over two years
 * sampled every two days, long enough for retrograde loops to be represented
 * in proportion. Regenerate them the same way if the ephemeris changes.
 */
export const MEAN_DAILY_MOTION = Object.freeze({
  Sun: 0.9856, Moon: 13.1809, Mercury: 1.2355, Venus: 1.0782, Mars: 0.5674,
  Jupiter: 0.1351, Saturn: 0.0717, Uranus: 0.0332, Neptune: 0.0214, Pluto: 0.0178,
});

/**
 * How near a station counts as "near", as a fraction of mean apparent motion.
 *
 * Validated against a full year of engine output for Mercury, Venus and
 * Saturn: every day falling below this threshold was within seven days of an
 * actual station — a real sign change in speed — with no false positives. The
 * test re-runs that check rather than trusting this number. See
 * test/positions.test.js.
 */
export const STATION_THRESHOLD = 0.10;

/** Speed bands, as a fraction of the body's own mean motion. */
const SLOW = 0.60;
const SWIFT = 1.30;

export function normalizedSpeed(name, speed) {
  const mean = MEAN_DAILY_MOTION[name];
  if (!mean || !Number.isFinite(speed)) return null;
  return Math.abs(speed) / mean;
}

/**
 * A movement description, or null when speed is missing.
 *
 * `derived: true` on every one of these, because none of it is supplied by the
 * engine — it is this module's reading of the engine's number, and the page
 * says so rather than presenting it as a reported fact.
 */
export function movementState(name, body) {
  if (!body || !Number.isFinite(body.speed)) return null;
  const n = normalizedSpeed(name, body.speed);
  if (n === null) return null;
  const retrograde = body.retrograde === true;
  if (n < STATION_THRESHOLD) {
    return Object.freeze({
      label: "Near station", detail: "Barely moving against the stars — close to changing direction.",
      direction: retrograde ? "Retrograde" : "Direct", nearStation: true, normalized: n, derived: true,
    });
  }
  const label = n < SLOW ? "Moving slowly" : n > SWIFT ? "Moving quickly" : "Moving at its usual pace";
  return Object.freeze({
    label,
    detail: retrograde
      ? "Appears to travel backwards through the zodiac from where we stand."
      : "Travelling forwards through the zodiac.",
    direction: retrograde ? "Retrograde" : "Direct",
    nearStation: false, normalized: n, derived: true,
  });
}

/** "19° 20′ Cancer". Seconds are carried but not shown — minutes is the product convention. */
export function formatDegree(body) {
  if (!body || !body.sign) return "";
  const d = Number.isFinite(body.degrees) ? body.degrees : 0;
  const m = Number.isFinite(body.minutes) ? String(body.minutes).padStart(2, "0") : "00";
  return `${d}° ${m}′ ${body.sign}`;
}

/** Degrees remaining before this body leaves its current sign. */
export function degreesLeftInSign(body) {
  if (!body || !Number.isFinite(body.degrees)) return null;
  const mins = Number.isFinite(body.minutes) ? body.minutes : 0;
  return 30 - (body.degrees + mins / 60);
}

/** Documented, and deliberately factual rather than urgent. */
export const BOUNDARY_DEGREES = 2;

export function composePositions(sky) {
  const planets = sky?.planets;
  if (!planets) return [];
  return PLANET_ORDER.map((name) => {
    const body = planets[name];
    if (!body || !body.sign) return null;
    const meaning = PLANETS[name];
    const movement = movementState(name, body);
    const left = degreesLeftInSign(body);
    return Object.freeze({
      name,
      sign: body.sign,
      position: formatDegree(body),
      degrees: body.degrees, minutes: body.minutes,
      retrograde: body.retrograde === true,
      direction: body.retrograde === true ? "Retrograde" : "Direct",
      movement,
      // Reused from the interpretation corpus so Positions and My Chart cannot
      // describe the same planet in two different ways.
      role: meaning ? meaning.function_ : null,
      approachingBoundary: left !== null && !body.retrograde && left <= BOUNDARY_DEGREES,
      degreesLeftInSign: left,
      speed: Number.isFinite(body.speed) ? body.speed : null,
    });
  }).filter(Boolean);
}

/** An orienting summary, built only from facts the payload actually carries. */
export function composeSkySummary(sky) {
  const positions = composePositions(sky);
  if (!positions.length) return null;
  const byName = (n) => positions.find((p) => p.name === n);
  const retro = positions.filter((p) => p.retrograde).map((p) => p.name);
  const stationing = positions.filter((p) => p.movement?.nearStation).map((p) => p.name);
  const boundary = positions.filter((p) => p.approachingBoundary).map((p) => p.name);
  return Object.freeze({
    sun: byName("Sun")?.position || null,
    moon: byName("Moon")?.position || null,
    retrograde: retro,
    retrogradeLabel: retro.length === 0
      ? "No planets are currently retrograde."
      : retro.length === 1 ? `${retro[0]} is retrograde.` : `${retro.length} planets are retrograde: ${retro.join(", ")}.`,
    nearStation: stationing,
    nearStationLabel: stationing.length
      ? `${stationing.join(", ")} ${stationing.length === 1 ? "is" : "are"} close to changing direction.`
      : "No planets are close to changing direction.",
    approachingBoundary: boundary,
    boundaryLabel: boundary.length
      ? `${boundary.join(", ")} ${boundary.length === 1 ? "is" : "are"} approaching the end of a sign.`
      : "No planets are near a sign boundary.",
    count: positions.length,
  });
}

/**
 * What the page may say about how this was calculated.
 *
 * NOTE ON WHAT IS ABSENT. The sky payload states no zodiac system, no
 * coordinate frame, and no house system — so none is claimed, exactly as in
 * My Chart. A house system would be doubly wrong here: the current sky has no
 * houses at all, and printing one because saved charts use one would describe
 * a calculation that never ran.
 */
export function calculationDetails(sky) {
  const rows = [];
  if (sky?.timezone_name) rows.push({ label: "Display timezone", value: sky.timezone_name });
  if (sky?.local_date) rows.push({ label: "Local date", value: sky.local_date });
  rows.push({ label: "Speed units", value: "Degrees per day" });
  rows.push({ label: "Movement labels", value: "Derived from speed relative to each body's mean motion" });
  return rows;
}

/**
 * Upcoming sign changes are NOT offered.
 *
 * The payload carries no ingress timing, and the only way to produce one here
 * would be to extrapolate from current speed — which is wrong for exactly the
 * bodies people care about, because a planet slowing toward a station never
 * reaches the boundary the straight-line estimate promises. A confidently
 * wrong date is worse than an absent section.
 */
export const INGRESS_SUPPORTED = false;
export const INGRESS_UNAVAILABLE_REASON =
  "Orbit Axis doesn’t have reliable timing for upcoming sign changes yet, so it doesn’t guess at them.";
