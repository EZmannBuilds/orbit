// Orbit Core :: regenerate the calculation parity fixture (Update 4.0.4).
//
//   node scripts/generate-parity-fixture.mjs
//
// Writes test/fixtures/calculation-parity.json from the CURRENT platform's
// runtime. Run it on darwin-arm64, then run the test suite inside a linux-x64
// container: if both pass the same fixture within tolerance, the two runtimes
// agree. Regenerate only when the Swiss Ephemeris version or the calculation
// formulas intentionally change — never to make a failing test pass.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/local-llm/config.js";
import { positionsAtUT } from "../lib/astro/ephemeris.js";
import { computeNatalChart } from "../lib/astro/natal.js";
import { currentSky } from "../lib/astro/current-sky.js";
import { personalTransits } from "../lib/fortune/engine.js";
import { runtimeManifest } from "../lib/astro/runtime/resolve.js";

const CASES = [
  { name: "normal_known_time",   year:1990, month:6,  day:15, hour:14, minute:30, second:0, lat:41.8781,  lon:-87.6298,  withHouses:true },
  { name: "northern_high_lat",   year:1985, month:12, day:21, hour:6,  minute:0,  second:0, lat:59.3293,  lon:18.0686,   withHouses:true },
  { name: "southern_lat",        year:1978, month:3,  day:3,  hour:23, minute:15, second:0, lat:-33.8688, lon:151.2093,  withHouses:true },
  { name: "eastern_lon",         year:2001, month:9,  day:9,  hour:8,  minute:45, second:0, lat:35.6895,  lon:139.6917,  withHouses:true },
  { name: "western_lon",         year:2004, month:2,  day:28, hour:19, minute:5,  second:0, lat:37.7749,  lon:-122.4194, withHouses:true },
  { name: "day_boundary_before", year:1999, month:12, day:31, hour:23, minute:59, second:0, lat:51.5072,  lon:0.1276,    withHouses:true },
  { name: "day_boundary_after",  year:2000, month:1,  day:1,  hour:0,  minute:1,  second:0, lat:51.5072,  lon:0.1276,    withHouses:true },
  { name: "leap_day",            year:2000, month:2,  day:29, hour:12, minute:0,  second:0, lat:48.8566,  lon:2.3522,    withHouses:true },
  { name: "equator",             year:1995, month:6,  day:1,  hour:12, minute:0,  second:0, lat:0,        lon:0,         withHouses:true },
  { name: "far_past",            year:1911, month:11, day:11, hour:11, minute:11, second:0, lat:52.5200,  lon:13.4050,   withHouses:true },
  { name: "far_future",          year:2040, month:1,  day:1,  hour:0,  minute:0,  second:0, lat:51.5074,  lon:-0.1278,   withHouses:true },
  { name: "no_houses",           year:1988, month:7,  day:7,  hour:12, minute:0,  second:0, lat:null,     lon:null,      withHouses:false },
];

const positions = {};
for (const c of CASES) {
  const { name, ...input } = c;
  const p = positionsAtUT(input);
  positions[name] = {
    planets: Object.fromEntries(Object.entries(p.planets).map(([k, v]) => [k, {
      longitude: v.longitude, sign: v.sign, degrees: v.degrees, minutes: v.minutes,
      speed: v.speed, retrograde: v.retrograde,
    }])),
    houses: p.houses.map((h) => ({ house: h.house, longitude: h.longitude, sign: h.sign })),
    ascendant: p.ascendant ? { longitude: p.ascendant.longitude, sign: p.ascendant.sign } : null,
    midheaven: p.midheaven ? { longitude: p.midheaven.longitude, sign: p.midheaven.sign } : null,
    nodes: Object.fromEntries(Object.entries(p.nodes).map(([k, v]) => [k, { longitude: v.longitude, sign: v.sign }])),
  };
}

// Higher-level chain, fixed instant.
const AT = new Date("2026-07-20T12:00:00Z");
const PROFILE = {
  id: "00000000-0000-4000-8000-000000000001", nickname: "Parity Fixture",
  birth_date: "1990-06-15", birth_time: "14:30", time_accuracy: "exact",
  latitude: 41.8781, longitude: -87.6298, utc_offset_at_birth: "-05:00", house_system: "placidus",
};
const UNKNOWN_TIME = { ...PROFILE, id: "00000000-0000-4000-8000-000000000002", birth_time: null, time_accuracy: "unknown" };

const chart = computeNatalChart(PROFILE);
const unknownChart = computeNatalChart(UNKNOWN_TIME);
const sky = currentSky(AT);
const transits = personalTransits(sky, chart, 3);

writeFileSync(join(REPO_ROOT, "test/fixtures/calculation-parity.json"), JSON.stringify({
  _comment: [
    "Orbit Core calculation parity fixtures (Update 4.0.4).",
    "Generated on darwin-arm64 and verified byte-identical on linux-x64.",
    "These are synthetic inputs only — no real person's birth data appears here.",
    "Regenerate with: node scripts/generate-parity-fixture.mjs (see docs/deployment/orbit-core-runtime.md)."
  ],
  swissEphemerisVersion: runtimeManifest().swissEphemerisVersion,
  generatedOn: "darwin-arm64",
  instant: AT.toISOString(),
  positions,
  natal: {
    sun: chart.planets.Sun.longitude, moon: chart.planets.Moon.longitude,
    ascendant: chart.angles.ascendant.longitude, midheaven: chart.angles.midheaven.longitude,
    houseCount: chart.houses.length, aspectCount: chart.aspects.length,
    retrogrades: chart.retrogrades, bigThree: chart.big_three,
    elementBalance: chart.element_balance, modalityBalance: chart.modality_balance,
    calculationStatus: chart.calculation_status,
  },
  natalUnknownTime: {
    timeKnown: unknownChart.time_known, houseCount: unknownChart.houses.length,
    hasAscendant: Boolean(unknownChart.angles?.ascendant), warnings: unknownChart.warnings,
    sun: unknownChart.planets.Sun.longitude,
  },
  sky: {
    sun: sky.planets.Sun.longitude, moon: sky.planets.Moon.longitude,
    zodiacSeason: sky.zodiac_season, moonSign: sky.moon.sign,
    moonPhase: sky.moon.phase_name, illumination: sky.moon.illumination_percent,
    retrogrades: sky.retrogrades, aspectCount: sky.aspects.length, snapshotHash: sky.snapshot_hash,
  },
  transits: transits.map((t) => ({
    transiting: t.transiting, natal: t.natal, aspect: t.aspect,
    orb: t.orb, applying: t.applying,
  })),
}, null, 2) + "\n");
console.log("fixture written:", Object.keys(positions).length, "position cases,", transits.length, "transits");
