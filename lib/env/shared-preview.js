// Orbit Axis :: owner-approved shared-database Preview mode.
//
// WHAT THIS IS, AND WHY IT IS UNCOMFORTABLE
//
// Orbit normally refuses to let a Preview deployment use the production
// Supabase project. That guard exists because a Preview is where unreviewed
// code runs, and pointing unreviewed code at real accounts is how people lose
// data they cannot get back.
//
// The owner has approved a narrow exception: a PRIVATE Preview, reachable only
// by them, using the existing Orbit project, because no second Supabase project
// is available right now. That is a legitimate trade — but it is a trade, and
// the code should make it impossible to take accidentally.
//
// So the exception is not a boolean and not a default. It requires FOUR things
// to line up, each of which a person had to write on purpose:
//
//   ORBIT_ENVIRONMENT=preview
//   ORBIT_PREVIEW_DATABASE_MODE=shared-orbit
//   ORBIT_PREVIEW_PROJECT_REFS=<the exact Orbit ref>
//   SUPABASE_URL whose ref matches that same value
//
// Any one of them missing, misspelled, or disagreeing with the others and the
// connection is refused. A typo fails closed.
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not widen anything for Production. It does not accept an arbitrary
// hosted project. It does not re-enable a single development affordance — the
// deployed-function denials in resolveEnvironment still apply, so disposable
// users, seeds, local migrations, dev routes, and the local language provider
// stay off. This mode changes exactly one answer: whether a Preview may talk to
// the Orbit database.

import { PRODUCTION_PROJECT_REF, projectRefFromUrl, hostFromUrl, isLocalHost }
  from "./known-targets.js";

/** The single accepted value. Anything else — including close misspellings. */
export const SHARED_ORBIT_MODE = "shared-orbit";

/** What Preview and Production share while this mode is active. */
export const SHARED_DATA_CATEGORIES = Object.freeze([
  "auth users",
  "profiles",
  "birth profiles and saved charts",
  "active chart selection and history",
  "daily fortunes and reading history",
  "Ask Orbit conversations and messages",
  "database schema and RLS policies",
  "storage (none currently in use)",
]);

/**
 * Is the owner-approved shared-database Preview mode active AND valid?
 *
 * Returns a verdict rather than a boolean so callers can explain a refusal.
 * `approved` is only ever true when every condition holds.
 *
 * @param {object} env
 * @param {{ environment?: string, isVercel?: boolean, vercelEnv?: string }} context
 */
export function sharedPreviewVerdict(env = process.env, context = {}) {
  const declared = String(env.ORBIT_PREVIEW_DATABASE_MODE || "").trim();
  const requested = declared.length > 0;

  const refuse = (reason) => ({ requested, approved: false, reason, mode: declared || null });

  if (!requested) return refuse("no shared-database mode was requested");

  // Exact match, case-sensitively. "Shared-Orbit" and "shared_orbit" are
  // refused: a value this consequential should be copied, not remembered, and
  // an approximate match is indistinguishable from someone guessing.
  if (declared !== SHARED_ORBIT_MODE) {
    return refuse(`unrecognised shared-database mode (expected exactly "${SHARED_ORBIT_MODE}")`);
  }

  // Preview only. A Production environment must never reach this path, even
  // with every other value set correctly — Production approval is a separate
  // decision nobody has made.
  const environment = String(context.environment || "").toLowerCase();
  if (environment !== "preview") {
    return refuse(`shared-database mode applies to preview only, not "${environment || "unknown"}"`);
  }

  // If we are on Vercel at all, it must be reporting a Preview. This catches
  // ORBIT_ENVIRONMENT=preview being set on a Production deployment, where the
  // variable would be lying about where it is running.
  if (context.isVercel && String(context.vercelEnv || "").toLowerCase() !== "preview") {
    return refuse(`Vercel reports "${context.vercelEnv || "unknown"}", not preview`);
  }

  const url = String(env.SUPABASE_URL || "").trim();
  if (!url) return refuse("SUPABASE_URL is not set");

  const host = hostFromUrl(url);
  if (!host) return refuse("SUPABASE_URL is not a valid URL");
  if (isLocalHost(host)) return refuse("shared-database mode is for the hosted project, not localhost");

  const urlRef = projectRefFromUrl(url);
  if (!urlRef) return refuse("SUPABASE_URL does not contain a Supabase project reference");

  // The allow-list must name the project explicitly. Reading the ref out of the
  // URL and trusting it would make this check circular — the point is that a
  // second, independently-written value has to agree.
  const allowed = String(env.ORBIT_PREVIEW_PROJECT_REFS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return refuse("ORBIT_PREVIEW_PROJECT_REFS is not set");
  if (!allowed.includes(urlRef)) {
    return refuse("the project in SUPABASE_URL is not listed in ORBIT_PREVIEW_PROJECT_REFS");
  }

  // Only the known Orbit project. This is what stops the mode from becoming a
  // general "any hosted database in preview" escape hatch, and it is what makes
  // pointing a Preview at The Lorehouse impossible rather than merely unlikely.
  if (urlRef !== PRODUCTION_PROJECT_REF) {
    return refuse("shared-database mode approves the Orbit project only");
  }

  // A service-role key in a Preview would be one misconfiguration away from a
  // browser. The Preview has no need for one: it authenticates users with the
  // anon key and RLS.
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return refuse("a service-role key must not be configured for a shared-database Preview");
  }
  if (!env.SUPABASE_ANON_KEY) return refuse("SUPABASE_ANON_KEY is not set");

  // Destructive and development helpers must be off. These are already denied
  // for a deployed function by resolveEnvironment; refusing here as well means
  // a Preview that has been misconfigured fails at the database boundary rather
  // than relying on a downstream check to catch it.
  for (const [name, value] of Object.entries({
    ORBIT_ALLOW_DISPOSABLE_USERS: env.ORBIT_ALLOW_DISPOSABLE_USERS,
    ORBIT_ALLOW_SEED_DATA: env.ORBIT_ALLOW_SEED_DATA,
    ORBIT_ALLOW_DB_RESET: env.ORBIT_ALLOW_DB_RESET,
    ORBIT_ALLOW_LOCAL_MIGRATIONS: env.ORBIT_ALLOW_LOCAL_MIGRATIONS,
  })) {
    if (String(value || "").trim()) {
      return refuse(`${name} must not be set for a shared-database Preview`);
    }
  }

  return {
    requested: true,
    approved: true,
    reason: null,
    mode: SHARED_ORBIT_MODE,
    projectRef: urlRef,
  };
}

/**
 * Lines describing what this mode means, for a startup banner or a readiness
 * report. Deliberately blunt: the risk is that someone forgets a Preview is
 * writing to real accounts, and a mild phrasing is what makes that easy.
 */
export function sharedPreviewWarnings() {
  return [
    "Preview and Production share ONE Supabase project.",
    `Shared: ${SHARED_DATA_CATEGORIES.join(", ")}.`,
    "Anything created, edited, or deleted in Preview is real production data.",
    "Destructive testing in Preview is forbidden.",
    "This is temporary, and for owner-controlled private testing only.",
    "A dedicated staging database is required before any outside tester is invited.",
  ];
}
