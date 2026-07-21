// Orbit Axis API :: request correlation IDs.
//
// Every API response carries one, so a user can quote an id from an error and
// it can be found in the logs. The id is random and carries no information
// about the user, the request, or the time — correlating it to anything
// requires the logs, which is exactly the property that makes it safe to show.
//
// An inbound x-request-id is honoured when it looks like a plausible id, so a
// future iOS client can correlate across its own retries. It is length-capped
// and character-restricted first: a request id is echoed into logs and response
// headers, and an unvalidated one is a header-injection and log-forging vector.

import { randomUUID } from "node:crypto";

const SAFE_INBOUND_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * @param {import("node:http").IncomingMessage} [req]
 * @returns {string}
 */
export function requestId(req) {
  const inbound = req?.headers?.["x-request-id"];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  if (typeof candidate === "string" && SAFE_INBOUND_ID.test(candidate)) return candidate;
  // Short, unambiguous, and enough entropy to be unique in any realistic log.
  return randomUUID().replace(/-/g, "").slice(0, 24);
}

export { SAFE_INBOUND_ID };
