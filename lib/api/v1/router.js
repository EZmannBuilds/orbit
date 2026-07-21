// Orbit Axis API v1 :: router.
//
// The single entry point for /api/v1/*. It owns the cross-cutting concerns —
// request id, method and content-type checks, body limits, rate limiting, error
// translation, headers — so that every handler is a plain function of its input
// and none of them repeat this logic or forget part of it.
//
// ROUTE CLASSIFICATION (see docs/deployment/api-v1.md)
//
//   public              GET  /api/v1/health, /version, /source
//   public calculation  POST /api/v1/charts/*, /api/v1/readings/evidence
//   authenticated       (none yet — saving, history, and account operations
//                        arrive in a later session and will live under paths
//                        that require a verified Supabase token)
//
// Calculations are public on purpose. Orbit has always let someone explore a
// chart before creating an account, and these endpoints read nothing and write
// nothing. They are rate-limited instead. If a request DOES carry a valid
// bearer token the identity is used for rate-limit bucketing only — it never
// changes the answer, and a client-supplied user id is never trusted.

import { CONTRACT_VERSION } from "@ezmannbuilds/orbit-axis-engine";
import { requestId as makeRequestId } from "../request-id.js";
import { createMemoryRateLimiter, RATE_LIMITS, rateLimitKey } from "../rate-limit.js";
import { ApiError, isApiError } from "./errors/codes.js";
import { success, failure, jsonHeaders } from "./responses/envelope.js";
import { assertMethod, assertJsonContentType, readJsonBody } from "./validation/request.js";
import * as platform from "./handlers/platform.js";
import * as charts from "./handlers/charts.js";

export const API_V1_PREFIX = "/api/v1";

// One limiter per class, created at module scope so counters survive across
// requests on a warm instance. See rate-limit.js for the honest caveat: this is
// best-effort per-instance, not distributed enforcement.
//
// Injectable via handleApiV1({ limiters }). A limiter that can only be reached
// through module state is impossible to test in isolation and impossible to
// swap for a distributed implementation later — both of which this API needs.
const defaultLimiters = {
  calculation: createMemoryRateLimiter(RATE_LIMITS.calculation),
  platform: createMemoryRateLimiter(RATE_LIMITS.platform),
};

/** Fresh limiters, for tests and for any caller wanting isolated counters. */
export function createLimiters(overrides = {}) {
  return {
    calculation: createMemoryRateLimiter({ ...RATE_LIMITS.calculation, ...overrides.calculation }),
    platform: createMemoryRateLimiter({ ...RATE_LIMITS.platform, ...overrides.platform }),
  };
}

/** @type {Record<string, { method: string|string[], kind: "platform"|"calculation", handler: Function, body: boolean }>} */
const ROUTES = {
  "/api/v1/health": { method: "GET", kind: "platform", body: false, handler: () => platform.health() },
  "/api/v1/version": { method: "GET", kind: "platform", body: false, handler: () => platform.version() },
  "/api/v1/source": { method: "GET", kind: "platform", body: false, handler: () => platform.source() },
  "/api/v1/charts/natal": { method: "POST", kind: "calculation", body: true, handler: charts.natal },
  "/api/v1/charts/transits": { method: "POST", kind: "calculation", body: true, handler: charts.transits },
  "/api/v1/charts/synastry": { method: "POST", kind: "calculation", body: true, handler: charts.synastry },
  "/api/v1/readings/evidence": { method: "POST", kind: "calculation", body: true, handler: charts.evidence },
};

export const ROUTE_TABLE = Object.freeze(
  Object.entries(ROUTES).map(([path, r]) => ({
    path, method: r.method, kind: r.kind,
    access: "public",
    requiresBody: r.body,
  })),
);

/**
 * Handle a /api/v1/* request.
 *
 * @returns {Promise<{ status: number, headers: object, body: object }|null>}
 *   null when the path is not a v1 path at all, so the caller can continue
 *   routing rather than this router claiming every request.
 */
export async function handleApiV1(req, route, { env = process.env, limiters = defaultLimiters } = {}) {
  if (!route.startsWith(`${API_V1_PREFIX}/`) && route !== API_V1_PREFIX) return null;

  const id = makeRequestId(req);
  const deployed = Boolean(env.VERCEL);

  try {
    const definition = ROUTES[route];
    if (!definition) {
      throw new ApiError("NOT_FOUND", {
        message: "That endpoint does not exist in API v1.",
        details: { available: Object.keys(ROUTES) },
      });
    }

    // CORS preflight is answered before anything else so a browser client is
    // not blocked by a method check it cannot satisfy.
    if (req.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders(req, env, jsonHeaders(id)), body: null };
    }

    assertMethod(req, definition.method);

    const limiter = definition.kind === "calculation" ? limiters.calculation : limiters.platform;
    const key = await rateLimitKey(req);
    const verdict = limiter.check(key);
    if (!verdict.allowed) {
      throw new ApiError("RATE_LIMITED", {
        message: `Too many requests. Try again in ${verdict.retryAfterSeconds} seconds.`,
        details: { retryAfterSeconds: verdict.retryAfterSeconds },
      });
    }

    let body = null;
    if (definition.body) {
      assertJsonContentType(req);
      body = await readJsonBody(req);
    }

    const data = await definition.handler(body);
    return {
      status: 200,
      headers: corsHeaders(req, env, jsonHeaders(id, {
        "X-RateLimit-Remaining": String(verdict.remaining),
      })),
      body: success(data, { requestId: id }),
    };
  } catch (error) {
    return errorResponse(error, { id, req, env, deployed });
  }
}

function errorResponse(error, { id, req, env, deployed }) {
  const apiError = isApiError(error) ? error : new ApiError("INTERNAL_ERROR", { cause: error });

  // Server-side diagnosis without client-side leakage. Logged: the code, the
  // route, and the request id. Never logged: the request body, which contains
  // birth date, time, and coordinates.
  if (apiError.code === "INTERNAL_ERROR" || apiError.code === "ENGINE_CALCULATION_FAILED") {
    const cause = apiError.cause;
    console.error(`[api/v1] ${apiError.code} req=${id} route=${req?.url?.split("?")[0]} `
      + `cause=${cause?.name || "none"}:${cause?.code || "none"}`);
  }

  const headers = corsHeaders(req, env, jsonHeaders(id));
  if (apiError.code === "RATE_LIMITED" && apiError.details?.retryAfterSeconds) {
    headers["Retry-After"] = String(apiError.details.retryAfterSeconds);
  }
  if (apiError.code === "METHOD_NOT_ALLOWED" && apiError.details?.allowed) {
    headers.Allow = [].concat(apiError.details.allowed).join(", ");
  }

  // Details are field names and limits — never values. Stack traces never
  // appear in a response at all, on any environment.
  return {
    status: apiError.status,
    headers,
    body: failure(apiError.code, {
      requestId: id,
      message: apiError.message,
      details: safeDetails(apiError.details, deployed),
    }),
  };
}

/**
 * Details are already constructed to be value-free, but this is the last gate
 * before they reach a client, so it enforces the rule rather than trusting it.
 */
function safeDetails(details, deployed) {
  if (!details || typeof details !== "object") return null;
  const allowedKeys = new Set(["field", "allowed", "available", "maxBytes", "retryAfterSeconds", "received"]);
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || Array.isArray(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

// ── CORS ────────────────────────────────────────────────────────────────────
// Not a blanket wildcard. The allow-list covers the production origin, Vercel
// preview deployments (which have per-commit hostnames and so must be matched
// by pattern), and local development.
//
// A native iOS client is unaffected: CORS is a browser mechanism, and a native
// HTTP client does not send an Origin header or enforce the response. So the
// policy can stay tight for browsers without blocking the future app.
//
// Credentials are never allowed, because these endpoints do not use cookies.
export function isAllowedOrigin(origin, env = process.env) {
  if (typeof origin !== "string" || !origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }

  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  if (url.protocol !== "https:") return false;

  const configured = String(env.ORBIT_ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (configured.includes(origin)) return true;

  // Vercel preview and production hostnames for this project only. The scope
  // suffix keeps it to our own deployments rather than any *.vercel.app.
  if (/^orbit-axis[a-z0-9-]*\.vercel\.app$/.test(url.hostname)) return true;
  if (/^orbit-axis-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/.test(url.hostname)) return true;

  return false;
}

function corsHeaders(req, env, base = {}) {
  const origin = req?.headers?.origin;
  const headers = { ...base, Vary: "Origin" };
  if (isAllowedOrigin(origin, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Request-Id";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export { CONTRACT_VERSION };
