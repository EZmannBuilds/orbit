// Orbit Axis :: current sky — now provided by Orbit Axis Engine.
// See lib/astro/ephemeris.js for why this file is a re-export.
// Implementation: https://github.com/EZmannBuilds/orbit-axis-engine

export {
  currentSky,
  moonPhase,
  nextLunarEvents,
  skySnapshotHash,
  SKY_VERSION,
  LUNAR_EVENTS_VERSION,
} from "@ezmannbuilds/orbit-axis-engine";
