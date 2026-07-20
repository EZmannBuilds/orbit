// Orbit Core :: hardened Swiss Ephemeris execution (Update 4.0.4).
//
// One controlled way to run the ephemeris. Everything that used to be implicit
// — the timeout, what happens on a non-zero exit, how much output is accepted,
// what the user is allowed to see when it fails — is explicit here.
//
// Security posture:
//   - arguments are always passed as an ARRAY to execFileSync. No shell is ever
//     involved, so shell metacharacters in a birthplace name or a coordinate
//     cannot become commands. The argument allow-list below is defence in
//     depth on top of that, not the only barrier.
//   - every numeric input is range-checked before it reaches the process
//   - output is size-capped, so a runaway process cannot exhaust memory
//   - errors are classified, and the message a customer sees never contains a
//     filesystem path, a native error string, or any birth detail
//
// Privacy posture: diagnostics record the FAILURE, never the INPUT. Birth date,
// birth time, coordinates, and chart contents are never logged here.

import { execFileSync } from "node:child_process";
import { requireRuntime, OrbitRuntimeError } from "./resolve.js";

// A calculation that could not be completed. Distinct from OrbitRuntimeError
// (the runtime itself is missing/unusable) so callers can tell "this machine
// cannot do astrology at all" from "this particular calculation failed".
export class OrbitCalculationError extends Error {
  constructor(message, { code = "calculation_failed", detail = null } = {}) {
    super(message);
    this.name = "OrbitCalculationError";
    this.code = code;
    this.detail = detail;
  }
}

export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_OUTPUT_BYTES = 1_000_000;

// swetest arguments are all of the form -xVALUE. This allow-list rejects
// anything containing a NUL, a newline, or characters that have no business in
// an ephemeris argument. Note that execFileSync does not use a shell, so this
// is belt-and-braces: it turns a malformed argument into a clear rejection
// instead of an obscure parse failure downstream.
const SAFE_ARG = /^-[A-Za-z][A-Za-z0-9_.,:+\-/\\ ]*$/;
const MAX_ARG_LENGTH = 4096;

export function assertSafeArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new OrbitCalculationError("No ephemeris arguments were supplied.", { code: "invalid_input" });
  }
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new OrbitCalculationError("Ephemeris arguments must be strings.", { code: "invalid_input" });
    }
    if (arg.length > MAX_ARG_LENGTH) {
      throw new OrbitCalculationError("An ephemeris argument was too long.", { code: "invalid_input" });
    }
    if (arg.includes("\0") || arg.includes("\n") || arg.includes("\r")) {
      throw new OrbitCalculationError("An ephemeris argument contained a control character.", { code: "invalid_input" });
    }
    if (!SAFE_ARG.test(arg)) {
      throw new OrbitCalculationError("An ephemeris argument was not in the expected form.", { code: "invalid_input" });
    }
  }
  return args;
}

// ── input validation ─────────────────────────────────────────────────────────
// Called before any argument string is built, so an out-of-range value is
// rejected by name rather than producing silently wrong astrology.

function assertInteger(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new OrbitCalculationError(`${name} must be a whole number.`, { code: "invalid_input" });
  }
  if (value < min || value > max) {
    throw new OrbitCalculationError(`${name} is out of range.`, { code: "invalid_input" });
  }
  return value;
}

function assertFinite(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OrbitCalculationError(`${name} must be a number.`, { code: "invalid_input" });
  }
  if (value < min || value > max) {
    throw new OrbitCalculationError(`${name} is out of range.`, { code: "invalid_input" });
  }
  return value;
}

// Swiss Ephemeris house systems Orbit is willing to request. Anything else is
// rejected rather than passed through.
export const HOUSE_SYSTEMS = Object.freeze(["P", "K", "O", "R", "C", "E", "W", "B", "M"]);

export function validateCalculationInput({
  year, month, day, hour = 12, minute = 0, second = 0,
  lat = null, lon = null, houseSystem = "P", withHouses = false,
} = {}) {
  // The bundled .se1 files cover roughly 1800–2400; the wider bound here is a
  // sanity check, not an accuracy claim.
  assertInteger(year, "Birth year", -3000, 3000);
  assertInteger(month, "Birth month", 1, 12);
  assertInteger(day, "Birth day", 1, 31);
  assertInteger(hour, "Hour", 0, 23);
  assertInteger(minute, "Minute", 0, 59);
  assertInteger(second, "Second", 0, 61); // leap seconds

  if (withHouses || lat != null || lon != null) {
    assertFinite(lat, "Latitude", -90, 90);
    assertFinite(lon, "Longitude", -180, 180);
  }
  if (typeof houseSystem !== "string" || !HOUSE_SYSTEMS.includes(houseSystem)) {
    throw new OrbitCalculationError("Unsupported house system.", { code: "invalid_input" });
  }
  return { year, month, day, hour, minute, second, lat, lon, houseSystem, withHouses };
}

// ── execution ────────────────────────────────────────────────────────────────

// Run the resolved Swiss Ephemeris executable with the given argument array.
// Returns stdout as a string. Throws OrbitRuntimeError (runtime unusable) or
// OrbitCalculationError (this run failed).
export function runEphemeris(args, { timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputBytes = MAX_OUTPUT_BYTES, runtime = null } = {}) {
  assertSafeArgs(args);
  const rt = runtime ?? requireRuntime();

  let stdout;
  try {
    stdout = execFileSync(rt.executable, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
      // No shell, no inherited stdio, no ambient environment surprises.
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      // The executable resolves -edir itself; cwd is pinned so a caller's
      // working directory can never influence data-file lookup.
      cwd: rt.ephemerisDir,
    });
  } catch (error) {
    throw classifyExecutionError(error, rt);
  }

  if (typeof stdout !== "string" || stdout.length === 0) {
    throw new OrbitCalculationError("The astronomy engine returned no output.", { code: "invalid_output" });
  }
  if (stdout.length > maxOutputBytes) {
    throw new OrbitCalculationError("The astronomy engine returned more output than expected.", { code: "output_too_large" });
  }
  return stdout;
}

// Turn a native child-process failure into something Orbit can reason about
// and a customer can safely be shown.
//
// The distinction matters operationally: a timeout is transient and worth
// retrying, a missing runtime is a deployment defect, and a non-zero exit is
// usually bad input. Collapsing them into one "calculation failed" would make
// all three indistinguishable in the logs.
export function classifyExecutionError(error, runtime = null) {
  const nodeCode = error?.code;

  if (nodeCode === "ETIMEDOUT" || error?.killed === true || error?.signal === "SIGTERM") {
    return new OrbitCalculationError("The astronomy calculation took too long and was stopped.", {
      code: "timeout",
      detail: { signal: error?.signal ?? null },
    });
  }
  if (nodeCode === "ENOENT") {
    return new OrbitRuntimeError("The astronomy engine is not available in this environment.", { code: "runtime_missing" });
  }
  if (nodeCode === "EACCES" || nodeCode === "EPERM") {
    return new OrbitRuntimeError("The astronomy engine is present but could not be executed.", { code: "runtime_not_executable" });
  }
  if (nodeCode === "ENOEXEC") {
    // The exact 4.0.3 finding: a binary built for another operating system.
    return new OrbitRuntimeError(
      "The astronomy engine in this build was compiled for a different platform.",
      { code: "runtime_wrong_platform", detail: { key: runtime?.key ?? null } },
    );
  }
  if (nodeCode === "ENOBUFS" || /maxBuffer/i.test(String(error?.message || ""))) {
    return new OrbitCalculationError("The astronomy engine returned more output than expected.", { code: "output_too_large" });
  }
  if (typeof error?.status === "number" && error.status !== 0) {
    return new OrbitCalculationError("The astronomy calculation could not be completed.", {
      code: "nonzero_exit",
      // The exit status is a number, not a message — safe to keep.
      detail: { status: error.status },
    });
  }
  return new OrbitCalculationError("The astronomy calculation could not be completed.", { code: "execution_failed" });
}

// ── customer-safe presentation ───────────────────────────────────────────────
// The single function that decides what a user is allowed to read. Native error
// text, absolute paths, argument values, and birth details never pass through.
const CUSTOMER_MESSAGES = {
  unsupported_platform: "Orbit's astronomy engine isn't available in this environment yet.",
  runtime_missing: "Orbit's astronomy engine isn't available right now.",
  runtime_not_executable: "Orbit's astronomy engine isn't available right now.",
  runtime_wrong_platform: "Orbit's astronomy engine isn't available in this environment yet.",
  runtime_checksum_mismatch: "Orbit's astronomy engine failed a safety check and was not used.",
  ephemeris_data_missing: "Orbit's astronomy data isn't available right now.",
  ephemeris_data_corrupt: "Orbit's astronomy data failed a safety check and was not used.",
  timeout: "That calculation took too long. Please try again.",
  invalid_input: "Those birth details couldn't be used for a calculation.",
  invalid_output: "Orbit couldn't complete that calculation just now.",
  output_too_large: "Orbit couldn't complete that calculation just now.",
  nonzero_exit: "Orbit couldn't complete that calculation just now.",
  execution_failed: "Orbit couldn't complete that calculation just now.",
};

export function customerSafeMessage(error) {
  const code = error?.code;
  return CUSTOMER_MESSAGES[code] || "Orbit couldn't complete that calculation just now.";
}

// Non-sensitive diagnostic record for logs. Deliberately contains no input.
export function diagnosticRecord(error, runtime = null) {
  return {
    error: error?.name || "Error",
    code: error?.code || "unknown",
    runtime: runtime?.key || null,
    swiss_ephemeris: runtime?.version || null,
    exit_status: error?.detail?.status ?? null,
  };
}
