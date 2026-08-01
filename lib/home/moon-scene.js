// Orbit Axis :: the deterministic parts of the Moon scene.
//
// Everything here is pure and runs identically in Node and the browser. The
// scene's *look* lives in CSS and SVG; what lives here is the small amount of
// data that look depends on — star positions, the phase geometry inputs, and
// the motion policy. Those are the parts that could drift between renders, so
// they are the parts worth pinning down and testing.
//
// This module calculates NO astronomy. Illumination, phase name and waxing all
// arrive from the canonical current-sky payload, which is engine-backed. A
// second lunar calculation here would be a second source of truth, and the two
// would eventually disagree.

/**
 * A tiny deterministic generator, so the star field is authored rather than
 * random.
 *
 * `Math.random()` would give a different sky on every render — stars would
 * shuffle on each refresh, which reads as a glitch rather than as a sky. A
 * fixed seed means the same build always draws the same stars, and a test can
 * assert that.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Changing this changes the sky. It is a design constant, not a tuning knob. */
export const STAR_SEED = 0x0A315;
export const STAR_COUNT = 46;

/**
 * Stars as percentage coordinates, so the field scales with the scene box
 * rather than needing a re-layout at each breakpoint.
 *
 * Density is deliberately restrained and the lower band is kept clear: that is
 * where the Earth arc and the scene text sit, and stars behind text cost
 * legibility for decoration.
 */
export function starField(count = STAR_COUNT, seed = STAR_SEED) {
  const rand = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    const x = rand() * 100;
    const y = rand() * 62;            // top ~62% only — below is Earth and text
    const r = 0.6 + rand() * 0.9;     // sub-pixel variation reads as depth
    const o = 0.25 + rand() * 0.5;    // never fully opaque; never invisible
    const delay = Math.round(rand() * 8000);
    stars.push(Object.freeze({
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      r: Math.round(r * 100) / 100,
      o: Math.round(o * 100) / 100,
      delay,
    }));
  }
  return Object.freeze(stars);
}

/**
 * The one shooting star, fixed rather than generated.
 *
 * A trajectory that varies per session is a trajectory nobody can test and
 * nobody can reproduce from a bug report.
 */
export const SHOOTING_STAR = Object.freeze({
  x1: 12, y1: 8, x2: 46, y2: 34, durationMs: 1400, delayMs: 2600,
});

/** Marks the once-per-session shooting star. No personal data, ever. */
export const SHOOTING_STAR_KEY = "oa_moon_seen";

/**
 * What the scene needs in order to draw, derived from canonical data only.
 *
 * Returns null when the payload cannot support an honest Moon. The caller then
 * renders the unavailable state — it must never fall back to a default phase,
 * because a wrong Moon is worse than a missing one and looks identical to a
 * working feature.
 */
export function sceneInputs(moon) {
  if (!moon || !moon.phase) return null;
  const illumination = Number.isFinite(moon.illumination) ? moon.illumination : null;
  if (illumination === null) return null;
  return Object.freeze({
    phase: moon.phase,
    illumination,
    waxing: moon.waxing === true,
    direction: moon.waxing === true ? "waxing" : "waning",
    fraction: Math.max(0, Math.min(1, illumination / 100)),
  });
}

/**
 * Illumination as a plain rounded percentage.
 *
 * The canonical field carries one decimal place. Printing "47.3% illuminated"
 * claims a precision the reader cannot use and that the eight-bucket phase
 * name does not share, so it is rounded once, here, rather than formatted
 * differently at each call site.
 */
export function illuminationLabel(illumination) {
  if (!Number.isFinite(illumination)) return null;
  const pct = Math.round(Math.max(0, Math.min(100, illumination)));
  return `${pct}% illuminated`;
}

/** "4° Pisces" — omitted entirely when the degree is not in the payload. */
export function moonPositionLabel(moon) {
  if (!moon || !moon.sign) return null;
  if (!Number.isFinite(moon.degrees)) return `Moon in ${moon.sign}`;
  return `Moon at ${Math.floor(moon.degrees)}° ${moon.sign}`;
}

/**
 * WHAT THIS SCENE DOES NOT CLAIM.
 *
 * The rendered Moon shows phase and illumination. It does not show the tilt a
 * particular observer would actually see — that needs observer latitude,
 * longitude and local sidereal time, none of which are in the current-sky
 * payload, and none of which Orbit Axis asks for in order to show a shared
 * sky. So the disc is drawn orientation-neutral and the copy says phase, never
 * "as you will see it tonight".
 *
 * The Earth arc is framing. It is not to scale, not at a real distance, and
 * not a viewing geometry.
 */
export const OBSERVER_ORIENTATION_SUPPORTED = false;
export const SCALE_ACCURATE = false;

export const ORIENTATION_NOTE =
  "Shows the Moon's phase and illumination, not the tilt you would see from your location.";

/**
 * Motion policy, in one place so the CSS and the tests agree on it.
 *
 * `refresh` is the only motion tied to a request. Everything else is ambient
 * and slow enough that it should read as atmosphere rather than as something
 * loading — a scene that looks busy while nothing is happening trains people
 * to ignore real progress indicators.
 */
export const MOTION = Object.freeze({
  driftSeconds: 90,        // Moon drift, a few pixels
  glowSeconds: 14,         // glow breathing
  starDriftSeconds: 180,   // star field
  refreshMs: 900,          // one partial Earth turn per refresh, then stop
});
