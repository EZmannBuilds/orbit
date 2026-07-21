// Orbit Axis API v1 :: request-level guards.
//
// Method, content type, and body size are checked before a body is parsed, so
// a hostile request is rejected on the cheapest possible path rather than after
// buffering megabytes or handing untrusted text to JSON.parse.

import { ApiError } from "../errors/codes.js";

/** 64 KB. A natal request is a few hundred bytes; a synastry request twice */
/** that. Anything approaching this ceiling is not a real Orbit client.      */
export const MAX_BODY_BYTES = 64 * 1024;

export function assertMethod(req, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(req.method)) {
    throw new ApiError("METHOD_NOT_ALLOWED", {
      message: `Use ${list.join(" or ")} on this endpoint.`,
      details: { allowed: list },
    });
  }
}

export function assertJsonContentType(req) {
  const raw = req.headers?.["content-type"] || "";
  const type = String(raw).split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", { details: { received: type || null } });
  }
}

/**
 * Read and parse a JSON body with a hard size ceiling.
 *
 * The stream is destroyed the moment the limit is exceeded rather than read to
 * completion — otherwise the size check would be an accounting exercise while
 * the memory has already been spent.
 */
export function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value); } };

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        finish(reject, new ApiError("REQUEST_TOO_LARGE", { details: { maxBytes } }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => finish(reject, new ApiError("INVALID_JSON")));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) { finish(reject, new ApiError("INVALID_JSON", { message: "The request body was empty." })); return; }
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { finish(reject, new ApiError("INVALID_JSON")); return; }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        finish(reject, new ApiError("INVALID_INPUT", { message: "The request body must be a JSON object." }));
        return;
      }
      finish(resolve, parsed);
    });
  });
}
