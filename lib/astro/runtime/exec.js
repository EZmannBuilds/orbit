// Orbit Axis :: hardened ephemeris execution — now provided by Orbit Axis Engine.
// See lib/astro/ephemeris.js for why this file is a re-export.

export {
  runEphemeris,
  validateCalculationInput,
  assertSafeArgs,
  classifyExecutionError,
  customerSafeMessage,
  diagnosticRecord,
  OrbitCalculationError,
  HOUSE_SYSTEMS,
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
} from "@ezmannbuilds/orbit-axis-engine";
