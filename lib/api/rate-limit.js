// Orbit Axis API :: rate limiting.
//
// HONEST SCOPE, STATED UP FRONT: this is a BEST-EFFORT, PER-INSTANCE limiter.
// It is NOT distributed enforcement.
//
// Orbit runs as serverless functions. Each instance keeps its own counters, and
// Vercel may run many instances concurrently, so the effective global limit is
// roughly (limit x instances). An attacker with enough parallelism can exceed
// any number configured here.
//
// It is still worth having: it stops accidental client loops and casual abuse
// from a single caller, which is the realistic threat for a free version-one
// app, and it costs nothing. What it must not do is create false confidence —
// so the ceiling is documented rather than implied, and `describeGuarantees()`
// exists so the limitation can be surfaced rather than discovered.
//
// Replaceable: swap `createMemoryRateLimiter` for a Redis/Upstash-backed
// implementation with the same interface when real enforcement is needed.

/** @typedef {{ allowed: boolean, remaining: number, retryAfterSeconds: number }} RateVerdict */

/**
 * @param {{ limit?: number, windowMs?: number, now?: () => number }} [options]
 */
export function createMemoryRateLimiter({ limit = 60, windowMs = 60_000, now = () => Date.now() } = {}) {
  const buckets = new Map();

  return {
    /**
     * @param {string} key caller identity — never a raw IP in a log, never a user id
     * @returns {RateVerdict}
     */
    check(key) {
      const t = now();
      const bucket = buckets.get(key);
      if (!bucket || t - bucket.start >= windowMs) {
        buckets.set(key, { start: t, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (t - bucket.start)) / 1000)),
        };
      }
      return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
    },

    /** Bounded so a long-lived instance cannot grow this map without limit. */
    prune() {
      const t = now();
      for (const [key, bucket] of buckets) if (t - bucket.start >= windowMs) buckets.delete(key);
      return buckets.size;
    },

    size() { return buckets.size; },

    describeGuarantees() {
      return {
        kind: "in-memory",
        scope: "per function instance",
        distributed: false,
        limit,
        windowMs,
        caveat: "Best-effort only. Each serverless instance keeps its own counters, "
          + "so the effective global limit scales with instance count. Not a defence "
          + "against a determined distributed attacker.",
      };
    },
  };
}

// Conservative per-route defaults. Calculations spawn a subprocess, so they are
// limited harder than the static platform endpoints.
export const RATE_LIMITS = Object.freeze({
  calculation: { limit: 30, windowMs: 60_000 },
  platform: { limit: 120, windowMs: 60_000 },
});

/**
 * Caller identity for rate limiting. An authenticated user is limited as a
 * user; otherwise the peer address is used and HASHED — the bucket key ends up
 * in memory and potentially in diagnostics, and a raw IP is personal data.
 */
export async function rateLimitKey(req, { userId = null } = {}) {
  if (userId) return `user:${userId}`;
  const raw = req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
    || req?.socket?.remoteAddress || "unknown";
  const { createHash } = await import("node:crypto");
  return `ip:${createHash("sha256").update(String(raw)).digest("hex").slice(0, 16)}`;
}
