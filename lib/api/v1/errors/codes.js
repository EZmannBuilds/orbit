// Orbit Axis API v1 :: error codes.
//
// A stable, machine-readable vocabulary. Clients — including a future iOS app —
// branch on `code`, never on `message`. Messages are prose and may be reworded
// or translated; codes are contract and may not change meaning within v1.
//
// Every code here corresponds to behaviour that actually exists. Codes are not
// added speculatively: an unused code is a promise the API has not made.
//
// The message is what a person reads. It must be understandable without
// astrological or technical knowledge, and it must never contain a filesystem
// path, a stack trace, a token, or any birth detail.

/** @typedef {{ status: number, message: string }} ErrorDefinition */

/** @type {Record<string, ErrorDefinition>} */
export const ERROR_CODES = Object.freeze({
  // ── request shape ──
  INVALID_JSON: { status: 400, message: "The request body could not be read as JSON." },
  INVALID_INPUT: { status: 400, message: "Some of the information supplied could not be used." },
  REQUEST_TOO_LARGE: { status: 413, message: "The request was too large." },
  METHOD_NOT_ALLOWED: { status: 405, message: "That method is not supported on this endpoint." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "Send this request as application/json." },

  // ── birth and calculation input ──
  INVALID_DATE: { status: 400, message: "Enter a real calendar date." },
  INVALID_TIME: { status: 400, message: "Enter a valid time, or say the birth time is unknown." },
  INVALID_TIMEZONE: { status: 400, message: "That time zone was not recognised." },
  INVALID_COORDINATES: { status: 400, message: "Enter a latitude between -90 and 90 and a longitude between -180 and 180." },
  UNSUPPORTED_HOUSE_SYSTEM: { status: 400, message: "That house system is not supported." },
  UNSUPPORTED_ZODIAC_TYPE: { status: 400, message: "That zodiac type is not supported." },
  INVALID_CHART: { status: 400, message: "That chart could not be used for this calculation." },

  // ── access ──
  UNAUTHORIZED: { status: 401, message: "Sign in to use this." },
  FORBIDDEN: { status: 403, message: "You do not have access to that." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Please wait a moment and try again." },

  // ── the engine ──
  ENGINE_UNAVAILABLE: { status: 503, message: "Orbit's astronomy engine isn't available right now." },
  ENGINE_CALCULATION_FAILED: { status: 502, message: "Orbit couldn't complete that calculation." },

  // ── everything else ──
  NOT_FOUND: { status: 404, message: "That endpoint does not exist." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong." },
});

/**
 * An API failure carrying a stable code. Thrown by handlers and validators and
 * converted to an envelope at the boundary — so a handler never has to know
 * about HTTP status codes or response shapes.
 */
export class ApiError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {{ message?: string, details?: object, cause?: unknown }} [options]
   *   `message` overrides the default for a genuinely more helpful one.
   *   `details` is field-level information; it must never contain input values
   *   that are personal (a date, a time, a coordinate). Field NAMES are fine.
   */
  constructor(code, { message, details, cause } = {}) {
    const definition = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    super(message || definition.message);
    this.name = "ApiError";
    this.code = ERROR_CODES[code] ? code : "INTERNAL_ERROR";
    this.status = definition.status;
    this.details = details ?? null;
    if (cause !== undefined) this.cause = cause;
  }
}

export function isApiError(value) {
  return value instanceof ApiError;
}

/** Status for a code, defaulting to 500 for anything unrecognised. */
export function statusForCode(code) {
  return (ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR).status;
}
