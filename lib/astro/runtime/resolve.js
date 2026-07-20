// Orbit Core :: runtime resolution (Update 4.0.4).
//
// The ONE place that answers "which Swiss Ephemeris executable should this
// process use, and is it actually usable?". Before 4.0.4 the answer was a
// single hardcoded path to a macOS arm64 binary, which is why every astrology
// feature would have failed on Vercel's Linux x64 functions.
//
// Nothing above this module knows that an executable exists at all. Chart,
// transit, Current Sky, fortune, and Ask Orbit evidence all reach the ephemeris
// through lib/astro/ephemeris.js, which resolves through here — so there is no
// second code path that could pick a different binary.
//
// Rules this module enforces:
//   - the runtime is chosen from process.platform + process.arch, never guessed
//   - an unsupported platform fails with a structured error, it does NOT fall
//     back to a binary built for another operating system
//   - every path is resolved relative to this module, never the process cwd
//   - nothing is ever downloaded, at startup or during a request

import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
// lib/astro/runtime → lib/astro. Everything below is relative to this, so the
// current working directory cannot change what gets resolved.
export const ASTRO_ROOT = resolvePath(MODULE_DIR, "..");
const MANIFEST_PATH = join(MODULE_DIR, "manifest.json");

export class OrbitRuntimeError extends Error {
  constructor(message, { code = "runtime_unavailable", detail = null } = {}) {
    super(message);
    this.name = "OrbitRuntimeError";
    this.code = code;
    this.detail = detail;
  }
}

let manifestCache = null;

export function runtimeManifest() {
  if (manifestCache) return manifestCache;
  manifestCache = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return manifestCache;
}

// "darwin-arm64", "linux-x64", … Node reports arch as "x64" (not "x86_64"),
// which is the spelling used throughout the manifest.
export function runtimeKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function ephemerisDataDir() {
  return join(ASTRO_ROOT, runtimeManifest().dataDirectory);
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Resolve the runtime for a platform/arch pair.
//
// `verifyChecksum` is off by default: hashing a ~2 MB executable on every
// request would be wasted work, and the checksum protects against a corrupted
// or swapped artifact, which is a build-time and audit-time concern. The
// runtime check command and the test suite turn it on.
//
// Returns { ok: true, ... } or { ok: false, code, detail, ... }. It does not
// throw, so callers can report a structured failure instead of a stack trace;
// `requireRuntime()` below is the throwing variant.
export function resolveRuntime({
  platform = process.platform,
  arch = process.arch,
  verifyChecksum = false,
  manifest = runtimeManifest(),
} = {}) {
  const key = runtimeKey(platform, arch);
  const base = {
    key, platform, arch,
    swissEphemerisVersion: manifest.swissEphemerisVersion,
    ephemerisDir: join(ASTRO_ROOT, manifest.dataDirectory),
  };

  const entry = manifest.runtimes[key];
  if (!entry || entry.supported !== true) {
    const supported = Object.keys(manifest.runtimes).filter((k) => manifest.runtimes[k].supported).sort();
    return {
      ...base,
      ok: false,
      code: "unsupported_platform",
      // Named explicitly so an unsupported host is an obvious, fixable finding
      // rather than a mysterious execution error later.
      detail: `Orbit has no Swiss Ephemeris runtime for ${key}. Supported: ${supported.join(", ")}.`,
      executable: null,
    };
  }

  const executable = join(ASTRO_ROOT, entry.executable);
  const result = { ...base, executable, expectedSha256: entry.sha256, linkage: entry.linkage, version: entry.version };

  if (!existsSync(executable) || !statSync(executable).isFile()) {
    return { ...result, ok: false, code: "runtime_missing", detail: `The ${key} Swiss Ephemeris executable is not present in this build.` };
  }

  try {
    accessSync(executable, constants.X_OK);
  } catch {
    return { ...result, ok: false, code: "runtime_not_executable", detail: `The ${key} Swiss Ephemeris executable is present but not marked executable.` };
  }

  const dataCheck = checkEphemerisData(manifest);
  if (!dataCheck.ok) return { ...result, ...dataCheck, ok: false };

  if (verifyChecksum) {
    const actual = sha256File(executable);
    if (actual !== entry.sha256) {
      return {
        ...result,
        ok: false,
        code: "runtime_checksum_mismatch",
        // The actual hash is included: it is not secret, and without it the
        // finding is not actionable.
        detail: `The ${key} Swiss Ephemeris executable does not match its recorded checksum (expected ${entry.sha256.slice(0, 12)}…, found ${actual.slice(0, 12)}…).`,
        actualSha256: actual,
      };
    }
    result.checksumVerified = true;
  }

  return { ...result, ok: true, code: "ok", detail: `Swiss Ephemeris ${entry.version} (${key}, ${entry.linkage}ally linked).` };
}

// The .se1 data files are as load-bearing as the executable: without them
// swetest runs but returns no usable positions.
export function checkEphemerisData(manifest = runtimeManifest(), { verifyChecksums = false } = {}) {
  const dir = join(ASTRO_ROOT, manifest.dataDirectory);
  if (!existsSync(dir)) {
    return { ok: false, code: "ephemeris_data_missing", detail: `The ephemeris data directory (${manifest.dataDirectory}) is not present in this build.` };
  }
  const missing = [];
  const mismatched = [];
  for (const [name, expected] of Object.entries(manifest.dataFiles)) {
    const path = join(dir, name);
    if (!existsSync(path)) { missing.push(name); continue; }
    if (verifyChecksums && sha256File(path) !== expected) mismatched.push(name);
  }
  if (missing.length) {
    return { ok: false, code: "ephemeris_data_missing", detail: `Missing ephemeris data file(s): ${missing.join(", ")}.` };
  }
  if (mismatched.length) {
    return { ok: false, code: "ephemeris_data_corrupt", detail: `Ephemeris data file(s) do not match their recorded checksum: ${mismatched.join(", ")}.` };
  }
  return { ok: true, code: "ok", dir };
}

// Cached throwing variant for the request path. The resolution cannot change
// while the process is alive, so resolving once per process is correct and
// keeps per-request cost at zero.
let cached = null;

export function requireRuntime({ fresh = false, verifyChecksum = false } = {}) {
  if (fresh || !cached) cached = resolveRuntime({ verifyChecksum });
  if (!cached.ok) {
    throw new OrbitRuntimeError(cached.detail, { code: cached.code, detail: cached });
  }
  return cached;
}

export function currentRuntimeStatus({ verifyChecksum = false } = {}) {
  return resolveRuntime({ verifyChecksum });
}

// Test seam only — lets a test resolve a different platform without mutating
// process.platform, and clears the per-process cache.
export function _resetRuntimeCache() { cached = null; }
