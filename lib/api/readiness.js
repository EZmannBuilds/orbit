// Orbit Axis :: database and authentication readiness.
//
// Answers one question — "can this instance actually serve a signed-in user?" —
// without saying anything a stranger could use.
//
// WHAT IS REPORTED
//
//   configured : the settings this instance needs are present
//   reachable  : the service answered
//
// WHAT IS NEVER REPORTED
//
// The project URL, the project reference, key material, key length, table
// contents, row counts, internal hostnames, or an upstream error body. This
// endpoint is public, and "is the database up, and which one is it" is exactly
// the pair of facts an attacker wants first.
//
// A "reachable" result is deliberately weaker than "working". It means the
// service answered, not that every policy is correct — proving THAT requires
// signing in as two users and attempting a crossing, which is what
// scripts/rls-check.js does and what no health poll should ever attempt.

import { supabaseConfig } from "../local-llm/config.js";

// Long enough that a health poll never hangs behind a slow database, short
// enough that an uptime monitor gets a verdict rather than a timeout.
const PROBE_TIMEOUT_MS = 4000;

// Readiness is polled, and each poll costs an outbound request. Caching for a
// few seconds keeps a monitor (or a page refresh loop) from turning a status
// widget into a load source on the database it is reporting about.
const CACHE_MS = 5000;
let cached = { at: 0, value: null };

/**
 * @returns {Promise<{database: {configured: boolean, reachable: boolean|null},
 *                    authentication: {configured: boolean, reachable: boolean|null}}>}
 */
export async function checkReadiness({
  now = Date.now,
  fetchImpl = fetch,
  force = false,
  config: injectedConfig = null,
} = {}) {
  if (!force && cached.value && now() - cached.at < CACHE_MS) return cached.value;

  // The config is injectable because supabaseConfig() reads .env.local from
  // disk as a side effect. That makes "what happens with no database
  // configured?" impossible to ask by clearing an environment variable — the
  // next call simply loads it back. An unconfigured database is a state this
  // code must handle correctly, so it has to be a state a test can create.
  const config = injectedConfig || supabaseConfig();
  const configured = Boolean(config?.url && config?.anonKey);

  // Not configured is a legitimate state, not a failure: Orbit runs locally with
  // no database at all, and calculation still works. `reachable` is null rather
  // than false to keep "we did not look" distinct from "we looked and it was
  // down" — collapsing those two makes an outage indistinguishable from a
  // missing setting, and they need completely different responses.
  if (!configured) {
    const value = {
      database: { configured: false, reachable: null },
      authentication: { configured: false, reachable: null },
    };
    cached = { at: now(), value };
    return value;
  }

  const probe = async (path) => {
    try {
      const res = await fetchImpl(`${config.url}${path}`, {
        headers: { apikey: config.anonKey },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      // Any HTTP answer proves the service is up and the key was accepted well
      // enough to route. A 401 on a table read means RLS is doing its job, so
      // it counts as reachable — treating it as a failure would report a
      // correctly-secured database as broken.
      return res.status < 500;
    } catch {
      return false;
    }
  };

  const [database, authentication] = await Promise.all([
    probe("/rest/v1/"),
    probe("/auth/v1/settings"),
  ]);

  const value = {
    database: { configured: true, reachable: database },
    authentication: { configured: true, reachable: authentication },
  };
  cached = { at: now(), value };
  return value;
}

/** Test seam: readiness is cached, and a test must not inherit a prior verdict. */
export function resetReadinessCache() {
  cached = { at: 0, value: null };
}
