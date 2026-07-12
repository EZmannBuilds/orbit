// Orbit :: current sky.
//
// Deterministic snapshot of the real sky at an instant, computed locally from
// the Swiss Ephemeris. Moon phase + illumination are derived from the Sun–Moon
// elongation — no external astrology/weather API.

import { createHash } from "node:crypto";
import { positionsNow, PLANETS } from "./ephemeris.js";
import { computeAspects, elementOf } from "./natal.js";

export const SKY_VERSION = "sky-v1";

const PHASES = [
  { name: "New Moon", waxing: true },
  { name: "Waxing Crescent", waxing: true },
  { name: "First Quarter", waxing: true },
  { name: "Waxing Gibbous", waxing: true },
  { name: "Full Moon", waxing: false },
  { name: "Waning Gibbous", waxing: false },
  { name: "Last Quarter", waxing: false },
  { name: "Waning Crescent", waxing: false },
];

// Sun–Moon elongation (0..360) → phase bucket + illumination fraction.
export function moonPhase(sunLon, moonLon) {
  const elongation = ((moonLon - sunLon) % 360 + 360) % 360;
  const illumination = (1 - Math.cos((elongation * Math.PI) / 180)) / 2;
  // 8 buckets of 45°, centred so New Moon straddles 0/360.
  const idx = Math.floor(((elongation + 22.5) % 360) / 45);
  const phase = PHASES[idx];
  return {
    elongation: Math.round(elongation * 100) / 100,
    phase_name: phase.name,
    waxing: phase.waxing,
    waning: !phase.waxing,
    illumination_percent: Math.round(illumination * 1000) / 10,
  };
}

export function currentSky(date = new Date()) {
  const pos = positionsNow(date);
  const sun = pos.planets.Sun;
  const moon = pos.planets.Moon;

  const phase = moonPhase(sun.longitude, moon.longitude);

  const retrogrades = PLANETS.filter((p) => pos.planets[p]?.retrograde);

  const aspectBodies = PLANETS.filter((p) => pos.planets[p]).map((p) => ({
    name: p, longitude: pos.planets[p].longitude, isLuminary: p === "Sun" || p === "Moon",
  }));
  const aspects = computeAspects(aspectBodies).filter((a) => a.orb <= 3); // tightest "major current aspects"

  const snapshot = {
    sky_version: SKY_VERSION,
    instant_utc: date.toISOString(),
    zodiac_season: sun.sign,
    sun: { sign: sun.sign, degrees: sun.degrees, minutes: sun.minutes, longitude: sun.longitude },
    moon: {
      sign: moon.sign, degrees: moon.degrees, minutes: moon.minutes, longitude: moon.longitude,
      phase_name: phase.phase_name, illumination_percent: phase.illumination_percent,
      waxing: phase.waxing, waning: phase.waning,
    },
    dominant_element: sun ? elementOf(sun.sign) : null,
    retrogrades,
    aspects,
    planets: pos.planets,
  };
  snapshot.snapshot_hash = skySnapshotHash(snapshot);
  return snapshot;
}

// Stable hash of the *coarse* sky state (sign-level + phase + retrogrades), so
// it only changes when something astrologically meaningful changes — suitable
// as a fortune-seed input without churning every minute.
export function skySnapshotHash(sky) {
  const coarse = {
    season: sky.zodiac_season,
    moonSign: sky.moon.sign,
    phase: sky.moon.phase_name,
    retro: [...sky.retrogrades].sort(),
  };
  return createHash("sha256").update(JSON.stringify(coarse)).digest("hex");
}
