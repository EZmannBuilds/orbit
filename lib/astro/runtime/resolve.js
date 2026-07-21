// Orbit Axis :: runtime resolution — now provided by Orbit Axis Engine.
// See lib/astro/ephemeris.js for why this file is a re-export.
//
// ASTRO_ROOT is re-exported because deployment tooling reports paths relative
// to it. It now points inside the vendored engine, which is correct: that is
// where the executable and ephemeris data actually live.

export {
  runtimeManifest,
  runtimeKey,
  resolveRuntime,
  currentRuntimeStatus,
  requireRuntime,
  checkEphemerisData,
  ephemerisDataDir,
  sha256File,
  OrbitRuntimeError,
  ENGINE_ROOT,
  ENGINE_ROOT as ASTRO_ROOT,
} from "@ezmannbuilds/orbit-axis-engine";
