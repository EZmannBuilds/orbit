// Orbit :: deterministic ephemeris adapter.
//
// Thin wrapper around the bundled Swiss Ephemeris `swetest` binary. All
// astronomy is computed locally by this binary against the bundled `.se1`
// ephemeris files — no network, no external astrology API, no LLM. Output is
// fully deterministic for a given (UT instant, location, house system).
//
// This module only *runs and parses* the ephemeris. Higher-level chart shaping
// (aspects, element balance, rulers) lives in natal.js / current-sky.js.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SWETEST = join(__dirname, "bin", "swetest");
const EPHE_DIR = join(__dirname, "ephe");

export const EPHEMERIS_VERSION = "swisseph-2.10.03";

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

// ── core runner ──────────────────────────────────────────────────────────────
function run(args) {
  return execFileSync(SWETEST, args, { encoding: "utf8", timeout: 10000 });
}

// Compute raw positions at a UT instant. If lat/lon/withHouses given, also
// returns house cusps + Ascendant + MC. Deterministic.
export function positionsAtUT({ year, month, day, hour = 12, minute = 0, second = 0,
  lat = null, lon = null, houseSystem = "P", withHouses = false }) {
  const dateStr = `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  const args = [`-edir${EPHE_DIR}`, `-b${dateStr}`, `-ut${timeStr}`, `-p${BODY_CODES}`, "-fPlZs", "-head"];
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
