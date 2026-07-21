// Orbit Axis :: ephemeris access — now provided by Orbit Axis Engine.
//
// This file used to contain the Swiss Ephemeris adapter. Update 5.0 extracted
// that code into a separate AGPL-3.0 repository so the calculations can be
// inspected, tested, and reused independently of this application:
//
//   https://github.com/EZmannBuilds/orbit-axis-engine
//
// It survives as a re-export so the ~25 call sites in this repository keep
// working unchanged, and so there remains exactly one obvious place to look
// for "where does Orbit get astronomy from". The implementation is no longer
// here; there is no second copy to drift.
//
// Prefer importing from "@ezmannbuilds/orbit-axis-engine" directly in new code.

export {
  positionsAtUT,
  positionsNow,
  ephemerisCapability,
  EPHEMERIS_VERSION,
  PLANETS,
  SIGNS,
  SIGN_ABBR,
  offsetToMinutes,
  localToUT,
  EphemerisUnavailableError,
  OrbitRuntimeError,
  OrbitCalculationError,
  customerSafeMessage,
  diagnosticRecord,
} from "@ezmannbuilds/orbit-axis-engine";
