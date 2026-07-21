// Orbit :: deterministic ephemeris adapter.
//
// Parses Swiss Ephemeris output into Orbit's own structures. All astronomy is
// computed locally against the bundled `.se1` ephemeris files — no network, no
// external astrology API, no LLM. Output is fully deterministic for a given
// (UT instant, location, house system).
//
// This module only *shapes and parses*. Since Update 4.0.4 it does not know
// where the executable lives, which platform it was built for, or how it is
// invoked — lib/astro/runtime/ owns all of that. That separation is what makes
// the same calculations run on Apple Silicon locally and on Linux x64 in a
// Vercel function.
//
// Higher-level chart shaping (aspects, element balance, rulers) lives in
// natal.js / current-sky.js, both of which reach the ephemeris only through
// this module.

import { runtimeManifest, currentRuntimeStatus, requireRuntime, OrbitRuntimeError } from "./paths.js";
import {
  runEphemeris, validateCalculationInput, OrbitCalculationError,
  customerSafeMessage, diagnosticRecord,
} from "./exec.js";

export const EPHEMERIS_VERSION = `swisseph-${runtimeManifest().swissEphemerisVersion}`;

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_ABBR = {
  ar: "Aries", ta: "Taurus", ge: "Gemini", cn: "Cancer", le: "Leo", vi: "Virgo",
  li: "Libra", sc: "Scorpio", sa: "Sagittarius", cp: "Capricorn", aq: "Aquarius", pi: "Pisces",
};

// swetest -p body letters → our planet names (order matters for -p string)
const BODY_CODES = "0123456789mt";
const BODY_NAMES = {
  "Sun": "Sun", "Moon": "Moon", "Mercury": "Mercury", "Venus": "Venus",
  "Mars": "Mars", "Jupiter": "Jupiter", "Saturn": "Saturn", "Uranus": "Uranus",
  "Neptune": "Neptune", "Pluto": "Pluto",
  "mean Node": "North Node", "true Node": "True Node",
};

export const PLANETS = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

// ── UT conversion ────────────────────────────────────────────────────────────
// Parse a UTC offset ("-05:00", "+5.5", -300 minutes, 5) into minutes east.
export function offsetToMinutes(offset) {
  if (offset == null || offset === "") return 0;
  if (typeof offset === "number") return Math.abs(offset) > 16 ? offset : offset * 60;
  const s = String(offset).trim();
  const m = s.match(/^([+-]?)(\d{1,2}):(\d{2})$/);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  }
  const dec = parseFloat(s);
  if (!Number.isNaN(dec)) return Math.abs(dec) > 16 ? dec : dec * 60;
  return 0;
}

// Convert a local civil date/time + offset into UT calendar fields.
// Uses epoch math so date rollover across midnight is handled correctly.
export function localToUT({ year, month, day, hour = 12, minute = 0, offsetMinutes = 0 }) {
  const ms = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}

// ── parsing ──────────────────────────────────────────────────────────────────
function signInfo(lonRaw) {
  const lon = ((lonRaw % 360) + 360) % 360;
  const idx = Math.floor(lon / 30);
  const within = lon - idx * 30;
  const deg = Math.floor(within);
  const minFloat = (within - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return { sign: SIGNS[idx], degrees: deg, minutes: min, seconds: sec };
}

function parseBodyLine(line) {
  // "Sun              84.9453382 24 ge 56'43.2176   0.9550264"
  const m = line.match(/^(.+?)\s{2,}(-?[\d.]+)\s+\d+\s+([a-z]{2})\s+\d+'[\d. ]+\s+(-?[\d.]+)\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  const longitude = parseFloat(m[2]);
  const speed = parseFloat(m[4]);
  return { name, longitude, speed };
}

function parseHouseLine(line) {
  const m = line.match(/^house\s+(\d+)\s+(-?[\d.]+)/);
  if (!m) return null;
  return { house: parseInt(m[1], 10), longitude: parseFloat(m[2]) };
}

function parseAngleLine(line, keyword) {
  if (!line.startsWith(keyword)) return null;
  const m = line.match(/^\S+\s+(-?[\d.]+)/);
  if (!m) return null;
  return { longitude: parseFloat(m[1]) };
}

function body(name, longitude, speed) {
  return {
    name,
    longitude: ((longitude % 360) + 360) % 360,
    speed,
    retrograde: speed < 0,
    ...signInfo(longitude),
  };
}

// ── platform capability ──────────────────────────────────────────────────────
// Kept as the stable, human-readable capability answer that deploy-check and
// the runtime check both report. Since 4.0.4 it is a thin projection of the
// runtime resolver rather than its own path-and-exec logic, so there is exactly
// one definition of "can this machine do astrology?".
//
// This is a diagnostic, not a fallback: there is no second ephemeris to fall
// back to, and inventing positions would be worse than failing.
export class EphemerisUnavailableError extends Error {
  constructor(message, { code = "ephemeris_unavailable" } = {}) {
    super(message);
    this.name = "EphemerisUnavailableError";
    this.code = code;
  }
}

let capability = null;

export function ephemerisCapability({ fresh = false, verifyChecksum = false } = {}) {
  if (capability && !fresh) return capability;
  const status = currentRuntimeStatus({ verifyChecksum });
  capability = status.ok
    ? {
      ok: true,
      code: "ok",
      runtime: status.key,
      detail: `${EPHEMERIS_VERSION} is executable on ${status.key} (${status.linkage}ally linked).`,
    }
    : { ok: false, code: status.code, runtime: status.key, detail: status.detail };
  return capability;
}

// Re-exported so callers that already import from this module can classify and
// present failures without reaching into lib/astro/runtime themselves.
export { OrbitRuntimeError, OrbitCalculationError, customerSafeMessage, diagnosticRecord };

// ── core runner ──────────────────────────────────────────────────────────────
// Resolution, timeout, output caps, exit-code handling, and error
// classification all live in lib/astro/runtime/exec.js.
function run(args) {
  return runEphemeris(args);
}

// Compute raw positions at a UT instant. If lat/lon/withHouses given, also
// returns house cusps + Ascendant + MC. Deterministic.
//
// Inputs are validated before an argument string is built, so an out-of-range
// coordinate is rejected by name instead of producing silently wrong astrology.
export function positionsAtUT(input) {
  const { year, month, day, hour, minute, second, lat, lon, houseSystem, withHouses } =
    validateCalculationInput(input);
  const runtime = requireRuntime();

  const dateStr = `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  const args = [`-edir${runtime.ephemerisDir}`, `-b${dateStr}`, `-ut${timeStr}`, `-p${BODY_CODES}`, "-fPlZs", "-head"];
  if (withHouses && lat != null && lon != null) {
    args.push(`-house${lon},${lat},${houseSystem}`);
  }
  const raw = run(args);

  const planets = {};
  const nodes = {};
  const houses = [];
  let asc = null, mc = null;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;

    if (line.startsWith("house ")) {
      const h = parseHouseLine(line);
      if (h) houses[h.house] = { house: h.house, longitude: h.longitude, ...signInfo(h.longitude) };
      continue;
    }
    if (line.startsWith("Ascendant")) { const a = parseAngleLine(line, "Ascendant"); if (a) asc = body("Ascendant", a.longitude, 0); continue; }
    if (line.startsWith("MC")) { const a = parseAngleLine(line, "MC"); if (a) mc = body("MC", a.longitude, 0); continue; }
    if (line.startsWith("ARMC") || line.startsWith("Vertex") || line.includes("Asc")) continue;

    const b = parseBodyLine(line);
    if (!b) continue;
    const mapped = BODY_NAMES[b.name];
    if (!mapped) continue;
    if (mapped === "North Node") { nodes.north = body("North Node", b.longitude, b.speed); nodes.south = body("South Node", b.longitude + 180, b.speed); }
    else if (mapped === "True Node") { nodes.trueNorth = body("True Node", b.longitude, b.speed); }
    else planets[mapped] = body(mapped, b.longitude, b.speed);
  }

  // Reject output that parsed into nothing usable. Without this a truncated or
  // malformed run would return an empty-but-valid-looking chart, which is worse
  // than an error: downstream code would treat "no planets" as a real chart and
  // Ask Orbit would build evidence from an absence.
  const found = Object.keys(planets).length;
  if (found < PLANETS.length) {
    throw new OrbitCalculationError(
      "The astronomy engine returned an incomplete result.",
      { code: "invalid_output", detail: { planets_found: found, planets_expected: PLANETS.length } },
    );
  }
  if (withHouses && lat != null && lon != null && (!asc || houses.filter(Boolean).length < 12)) {
    throw new OrbitCalculationError(
      "The astronomy engine returned an incomplete house result.",
      { code: "invalid_output", detail: { houses_found: houses.filter(Boolean).length } },
    );
  }

  return { planets, nodes, houses: houses.filter(Boolean), ascendant: asc, midheaven: mc };
}

// Current sky positions (no houses; angles need a location + exact time).
export function positionsNow(date = new Date()) {
  return positionsAtUT({
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
  });
}

export { SIGN_ABBR };
