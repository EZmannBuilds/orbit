// Orbit Axis API v1 :: platform endpoints — health, version, source.
//
// All three are public and unauthenticated. They are the endpoints an uptime
// monitor, an app-store reviewer, and an AGPL recipient each need, and none of
// them should require an account.
//
// The discipline here is what they must NOT say. A health endpoint is reachable
// by anyone, so it reports capability, never configuration: no database URL, no
// environment values, no filesystem path, no user information.

import { ephemerisCapability, runtimeKey, runtimeManifest, CONTRACT_VERSION, engineVersion }
  from "@ezmannbuilds/orbit-axis-engine";
import { applicationVersion, buildIdentity } from "../contracts/versions.js";
import { checkReadiness } from "../../readiness.js";

/**
 * Cheap readiness: does this instance have a usable astronomy runtime?
 * Deliberately does NOT compute a chart — a health check that spawns a
 * subprocess on every poll is a self-inflicted load problem.
 */
export async function health({ now = () => new Date(), readiness = checkReadiness } = {}) {
  const capability = ephemerisCapability();
  const services = await readiness();

  // `status` reflects only what Orbit itself must do to answer a calculation
  // request. A database that is down does NOT make this "degraded": the
  // calculation endpoints are stateless and keep working without it, and an
  // uptime monitor that pages someone because saved charts are briefly
  // unavailable — while every chart still computes — is a monitor people learn
  // to ignore. The database's own state is reported alongside, honestly.
  return {
    status: capability.ok ? "ok" : "degraded",
    contractVersion: CONTRACT_VERSION,
    applicationVersion: applicationVersion(),
    engineVersion: engineVersion(),
    runtime: {
      platform: runtimeKey(),
      ephemerisAvailable: capability.ok,
      ephemerisVersion: runtimeManifest().swissEphemerisVersion,
    },
    // Capability only. Never which project, never which URL, never any key.
    database: services.database,
    authentication: services.authentication,
    timestamp: now().toISOString(),
  };
}

export function version(env = process.env) {
  return {
    applicationVersion: applicationVersion(),
    engineVersion: engineVersion(),
    contractVersion: CONTRACT_VERSION,
    ephemerisVersion: runtimeManifest().swissEphemerisVersion,
    build: buildIdentity(env),
  };
}

/**
 * AGPL source availability.
 *
 * Both repositories are AGPL-3.0-or-later but neither is published yet, so the
 * URLs are null and the status says so. Returning a plausible-looking GitHub
 * URL that 404s would be worse than returning nothing: the whole point of this
 * endpoint is that a user can actually obtain the source.
 *
 * URLs come from configuration when publication happens, and are validated —
 * an unvalidated URL here is a redirect target Orbit vouches for.
 */
export function source(env = process.env) {
  // Two names each, because this handler and lib/legal/config.js were written
  // against different ones. That divergence meant publication configured the
  // legal page's variables while this endpoint — the one AGPL compliance
  // actually depends on — kept reporting "pending-publication". Accept either,
  // in the same precedence lib/legal/config.js uses.
  const appUrl = safeRepositoryUrl(env.ORBIT_SOURCE_APP_URL || env.ORBIT_SOURCE_URL);
  const engineUrl = safeRepositoryUrl(env.ORBIT_SOURCE_ENGINE_URL || env.ORBIT_ENGINE_SOURCE_URL);
  return {
    application: {
      license: "AGPL-3.0-or-later",
      version: applicationVersion(),
      repositoryStatus: appUrl ? "published" : "pending-publication",
      repositoryUrl: appUrl,
    },
    engine: {
      license: "AGPL-3.0-or-later",
      version: engineVersion(),
      repositoryStatus: engineUrl ? "published" : "pending-publication",
      repositoryUrl: engineUrl,
    },
    thirdParty: [
      {
        name: "Swiss Ephemeris",
        copyright: "Astrodienst AG",
        version: runtimeManifest().swissEphemerisVersion,
        license: "AGPL-3.0 (dual-licensed; Orbit uses the AGPL option)",
        url: "https://www.astro.com/swisseph/",
      },
    ],
    notice: "Orbit Axis is free software under the AGPL. If you interact with it over a "
      + "network you are entitled to its complete corresponding source code.",
  };
}

/** Only https URLs on known code-hosting origins are ever echoed. */
function safeRepositoryUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const allowed = new Set(["github.com", "gitlab.com", "codeberg.org", "git.sr.ht"]);
  if (!allowed.has(url.hostname)) return null;
  return url.toString();
}

export { safeRepositoryUrl };
