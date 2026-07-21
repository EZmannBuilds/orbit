// Orbit Axis :: natal chart — now provided by Orbit Axis Engine.
// See lib/astro/ephemeris.js for why this file is a re-export.
// Implementation: https://github.com/EZmannBuilds/orbit-axis-engine

export {
  computeNatalChart,
  computeAspects,
  chartInputHash,
  elementOf,
  modalityOf,
  normalizePercentages,
  natalComputeCount,
  resetNatalComputeCount,
  CALCULATION_VERSION,
} from "@ezmannbuilds/orbit-axis-engine";
