// Orbit Axis API v1 :: the response envelope.
//
// One shape for every response, success or failure:
//
//   { data, meta: { requestId, contractVersion, ... }, error }
//
// Exactly one of `data` and `error` is non-null, always. A client can branch on
// `error === null` without inspecting the status code, which matters for a
// future iOS client where a transport layer may surface statuses differently.
//
// `meta` is present on failures too — that is the point of the envelope. An
// error the user can quote a request id for is supportable; one they cannot is
// not.

import { CONTRACT_VERSION, engineVersion } from "@ezmannbuilds/orbit-axis-engine";
import { ERROR_CODES } from "../errors/codes.js";
import { applicationVersion } from "../contracts/versions.js";

/**
 * @param {object|null} data
 * @param {{ requestId: string, extra?: object }} context
 */
export function success(data, { requestId, extra = {} } = {}) {
  return {
    data,
    meta: {
      requestId,
      contractVersion: CONTRACT_VERSION,
      applicationVersion: applicationVersion(),
      engineVersion: engineVersion(),
      ...extra,
    },
    error: null,
  };
}

/**
 * Failures deliberately omit application/engine versions: an error may be
 * produced before the engine is loadable, and a response shape that can itself
 * fail to build is worthless precisely when it is most needed.
 *
 * @param {string} code
 * @param {{ requestId: string, message?: string, details?: object|null }} context
 */
export function failure(code, { requestId, message, details = null } = {}) {
  const known = ERROR_CODES[code] ? code : "INTERNAL_ERROR";
  return {
    data: null,
    meta: { requestId, contractVersion: CONTRACT_VERSION },
    error: {
      code: known,
      message: message || ERROR_CODES[known].message,
      ...(details ? { details } : {}),
    },
  };
}

/** Headers every v1 JSON response carries. */
export function jsonHeaders(requestId, extra = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    // Calculations are deterministic but responses embed a timestamp and a
    // request id, so they are not cacheable as-is.
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Contract-Version": CONTRACT_VERSION,
    ...extra,
  };
}
