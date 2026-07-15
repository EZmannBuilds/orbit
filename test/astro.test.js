// Orbit :: deterministic astrology engine tests.
import { test } from "node:test";
import assert from "node:assert/strict";

import { positionsAtUT, localToUT, offsetToMinutes } from "../lib/astro/ephemeris.js";
import { computeNatalChart, chartInputHash, normalizePercentages, computeAspects } from "../lib/astro/natal.js";
import { currentSky, moonPhase } from "../lib/astro/current-sky.js";

// A fixed reference chart: 1990-06-16, 08:30 local, offset +00:00, London.
// UT == local here, so it matches a direct swetest run.
const REF = {
  birth_date: "1990-06-16", birth_time: "08:30", time_accuracy: "exact",
  latitude: 51.5, longitude: -0.13, timezone_name: "Europe/London",
  utc_offset_at_birth: "+00:00", zodiac_system: "tropical", house_system: "placidus",
};

test("offsetToMinutes parses several formats", () => {
  assert.equal(offsetToMinutes("-05:00"), -300);
  assert.equal(offsetToMinutes("+05:30"), 330);
  assert.equal(offsetToMinutes(-5), -300);
  assert.equal(offsetToMinutes(0), 0);
  assert.equal(offsetToMinutes(""), 0);
});

test("localToUT handles offset without date rollover", () => {
  const ut = localToUT({ year: 1990, month: 6, day: 16, hour: 8, minute: 30, offsetMinutes: 0 });
  assert.deepEqual([ut.year, ut.month, ut.day, ut.hour, ut.minute], [1990, 6, 16, 8, 30]);
});

test("localToUT rolls the date back across midnight", () => {
  // 01:00 local at +05:00 offset => 20:00 previous UT day
  const ut = localToUT({ year: 2020, month: 3, day: 10, hour: 1, minute: 0, offsetMinutes: 300 });
  assert.deepEqual([ut.year, ut.month, ut.day, ut.hour], [2020, 3, 9, 20]);
});

test("reference chart matches known Swiss Ephemeris positions", () => {
  const c = computeNatalChart(REF);
  assert.equal(c.planets.Sun.sign, "Gemini");
  assert.equal(c.planets.Sun.degrees, 24);
  assert.equal(c.planets.Moon.sign, "Pisces");
  assert.equal(c.planets.Moon.degrees, 26);
  assert.equal(c.big_three.rising.sign, "Leo");
  assert.equal(c.big_three.rising.degrees, 19);
  assert.equal(c.calculation_status, "complete");
});

test("retrograde detection works (outer planets retrograde in ref chart)", () => {
  const c = computeNatalChart(REF);
  for (const p of ["Saturn", "Uranus", "Neptune", "Pluto"]) {
    assert.equal(c.planets[p].retrograde, true, `${p} should be retrograde`);
  }
  assert.equal(c.planets.Sun.retrograde, false);
});

test("planetary houses assigned when time known", () => {
  const c = computeNatalChart(REF);
  assert.equal(c.houses.length, 12);
  assert.ok(c.planet_houses.Sun >= 1 && c.planet_houses.Sun <= 12);
});

test("element and modality percentages each total 100", () => {
  const c = computeNatalChart(REF);
  const el = Object.values(c.element_balance.percentages).reduce((a, b) => a + b, 0);
  const mo = Object.values(c.modality_balance.percentages).reduce((a, b) => a + b, 0);
  assert.equal(el, 100);
  assert.equal(mo, 100);
});

test("chart is fully deterministic (same input -> identical output + hash)", () => {
  const a = computeNatalChart(REF);
  const b = computeNatalChart(REF);
  assert.deepEqual(a, b);
  assert.equal(chartInputHash(REF), chartInputHash(REF));
});

test("unknown birth time hides Rising and houses, flags warnings", () => {
  const unknown = { ...REF, time_accuracy: "unknown", birth_time: null };
  const c = computeNatalChart(unknown);
  assert.equal(c.time_known, false);
  assert.equal(c.big_three.rising.unavailable, true);
  assert.equal(c.houses.length, 0);
  assert.deepEqual(c.angles, { ascendant: null, midheaven: null });
  assert.ok(c.warnings.includes("birth_time_unknown"));
  assert.ok(c.warnings.includes("rising_unavailable"));
  assert.equal(c.calculation_status, "partial");
  // Sun still valid (slow enough)
  assert.equal(c.planets.Sun.sign, "Gemini");
});

test("approximate birth time keeps calculated houses but marks the chart approximate", () => {
  const c = computeNatalChart({ ...REF, time_accuracy: "approximate" });
  assert.equal(c.time_known, true);
  assert.equal(c.time_accuracy, "approximate");
  assert.equal(c.big_three.rising.sign, "Leo");
  assert.equal(c.houses.length, 12);
  assert.ok(c.angles.ascendant, "approximate time still calculates angles with a visible UI caution");
});

test("unknown-time hash differs from known-time hash", () => {
  const unknown = { ...REF, time_accuracy: "unknown", birth_time: null };
  assert.notEqual(chartInputHash(REF), chartInputHash(unknown));
});

test("normalizePercentages sums to 100 with largest-remainder rounding", () => {
  const p = normalizePercentages({ a: 1, b: 1, c: 1 }, ["a", "b", "c"]);
  assert.equal(p.a + p.b + p.c, 100);
  const z = normalizePercentages({ a: 0, b: 0 }, ["a", "b"]);
  assert.equal(z.a + z.b, 0);
});

test("computeAspects finds an exact opposition", () => {
  const asp = computeAspects([
    { name: "X", longitude: 10, isLuminary: false },
    { name: "Y", longitude: 190, isLuminary: false },
  ]);
  assert.equal(asp.length, 1);
  assert.equal(asp[0].aspect, "Opposition");
  assert.ok(asp[0].orb < 0.001);
});

test("moonPhase: conjunction is New (0% lit), opposition is Full (100% lit)", () => {
  const nw = moonPhase(100, 100);
  assert.equal(nw.phase_name, "New Moon");
  assert.ok(nw.illumination_percent < 0.1);
  const full = moonPhase(100, 280);
  assert.equal(full.phase_name, "Full Moon");
  assert.ok(full.illumination_percent > 99.9);
  const fq = moonPhase(100, 190);
  assert.equal(fq.phase_name, "First Quarter");
  assert.ok(fq.waxing);
});

test("currentSky returns a coherent, hashed snapshot", () => {
  const sky = currentSky(new Date("2026-07-11T12:00:00Z"));
  assert.ok(["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"].includes(sky.zodiac_season));
  assert.ok(sky.moon.illumination_percent >= 0 && sky.moon.illumination_percent <= 100);
  assert.match(sky.snapshot_hash, /^[0-9a-f]{64}$/);
  // deterministic for a fixed instant
  const sky2 = currentSky(new Date("2026-07-11T12:00:00Z"));
  assert.equal(sky.snapshot_hash, sky2.snapshot_hash);
  assert.deepEqual(sky.retrogrades, sky2.retrogrades);
});
