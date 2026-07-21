// Orbit Axis :: environment safety guards (Update 4.0.2).
//
// Reusable assertions that run BEFORE anything dangerous: binding a port,
// constructing a service-role client, applying a migration, seeding, creating
// disposable users, or running database integration tests.
//
// Every message says what is wrong and which command fixes it. No message ever
// contains a key, token, or credential-bearing URL — only the environment name,
// hostname, and public project reference.

import { sharedPreviewWarnings } from "./shared-preview.js";
import { resolveEnvironment, describeTarget } from "./environment.js";

export class EnvironmentSafetyError extends Error {
  constructor(message, { code = "environment_unsafe", info = null } = {}) {
    super(message);
    this.name = "EnvironmentSafetyError";
    this.code = code;
    this.info = info;
  }
}

const DEV_LOCAL_HINT = [
  "Start the local database and run Orbit against it:",
  "",
  "  supabase start",
  "  npm run env:check",
  "  npm run dev:local",
].join("\n");

// ── The main startup gate ────────────────────────────────────────────────────
// Called by every server entry point before it begins listening or touching a
// database. Returns the resolved environment when safe; throws otherwise.
export function assertStartupSafe(info = resolveEnvironment()) {
  const where = describeTarget(info);

  if (!info.environmentValid) {
    // A Vercel deployment with no usable VERCEL_ENV gets its own message,
    // because "set ORBIT_ENVIRONMENT" is the wrong advice there.
    if (info.isVercel) {
      throw new EnvironmentSafetyError(
        [
          "Orbit stopped before startup because it is running on Vercel but could not tell which",
          "environment this deployment is.",
          "",
          "Vercel normally sets VERCEL_ENV to production, preview, or development. If it is missing,",
          "set ORBIT_ENVIRONMENT explicitly for this Vercel environment in the project settings.",
        ].join("\n"),
        { code: "vercel_environment_unknown", info },
      );
    }
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because ORBIT_ENVIRONMENT="${info.environment}" is not an environment Orbit recognises.`,
        "",
        "Use one of: local, test, preview, production.",
        "",
        DEV_LOCAL_HINT,
      ].join("\n"),
      { code: "unknown_environment", info },
    );
  }

  // ── Vercel-specific rules (Update 4.0.3) ───────────────────────────────────
  // A deployed function cannot reach the owner's machine. Pointing one at
  // localhost is always a misconfiguration, and it must fail loudly rather than
  // spend the whole invocation timing out against an address that is not there.
  // This is checked before the environment-name rules so it holds even when
  // ORBIT_ENVIRONMENT has been set to something permissive.
  if (info.isDeployed && info.databaseTarget === "local") {
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because this Vercel ${info.vercelEnv} deployment is configured to`,
        "use a database on localhost. A deployed function has no localhost to reach.",
        "",
        "Set SUPABASE_URL and SUPABASE_ANON_KEY for this Vercel environment to a hosted Supabase project.",
      ].join("\n"),
      { code: "vercel_points_at_localhost", info },
    );
  }

  // A deployed function must have a database. There is no local fallback and
  // no in-memory substitute that would survive the next invocation.
  if (info.isDeployed && (info.databaseTarget === "missing" || info.databaseTarget === "invalid")) {
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because this Vercel ${info.vercelEnv} deployment has no usable`,
        "database configuration.",
        "",
        "Set SUPABASE_URL and SUPABASE_ANON_KEY for this Vercel environment. Orbit will not fall back",
        "to in-memory storage on a deployment: a serverless instance can disappear between requests,",
        "so anything held in memory would be silently lost.",
      ].join("\n"),
      { code: "vercel_missing_database", info },
    );
  }

  // Browsers authenticate with the anon key; without it every signed-in feature
  // fails one request at a time instead of once, clearly, at startup.
  if (info.isDeployed && !info.hasAnonKey) {
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because this Vercel ${info.vercelEnv} deployment is missing`,
        "SUPABASE_ANON_KEY.",
        "",
        "Add it to this Vercel environment. Never expose the service-role key to browsers.",
      ].join("\n"),
      { code: "vercel_missing_anon_key", info },
    );
  }

  // Local development must never be pointed at the hosted production database
  // BY ACCIDENT.
  //
  // Orbit runs on a single Supabase project — a deliberate cost decision by the
  // owner, not an oversight. So local development genuinely does share a
  // database with production, and a guard that simply refuses would be a guard
  // that has to be deleted, which is worse than one that can be acknowledged.
  //
  // The acknowledgement names the project rather than being a boolean. `=true`
  // would survive being copied into an unrelated checkout pointed at a
  // different database; a project reference does not. It also cannot be set by
  // accident, and it reads, in the file where it lives, as a decision someone
  // made on purpose.
  //
  // This escape hatch exists for LOCAL only. The test guard below has none: a
  // test suite is exactly the thing that creates and deletes rows without
  // anyone watching.
  if (info.isLocal && info.databaseTarget === "production") {
    const acknowledged = String(process.env.ORBIT_ACKNOWLEDGE_PRODUCTION_DB || "").trim();
    const projectRef = (String(process.env.SUPABASE_URL || "")
      .match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || "";

    if (!acknowledged || acknowledged !== projectRef) {
      throw new EnvironmentSafetyError(
        [
          "Orbit stopped before startup because local development is configured to use the hosted production database.",
          "",
          "Nothing was read from or written to that database.",
          "",
          "Orbit runs on a single Supabase project, so this may well be what you want —",
          "but it will not be assumed. Anything you create, edit, or delete while running",
          "this way is real production data belonging to real accounts.",
          "",
          "To proceed deliberately, name the project in .env.local:",
          "",
          `  ORBIT_ACKNOWLEDGE_PRODUCTION_DB=${projectRef || "<project-ref>"}`,
          "",
          "To use a database on this machine instead:",
          "",
          DEV_LOCAL_HINT,
        ].join("\n"),
        { code: "local_points_at_production", info },
      );
    }

    // Acknowledged, but never silent. Someone returning to this terminal an
    // hour later must be able to see which database they are about to change.
    console.warn(
      `\n  ⚠  Local development is using the HOSTED database (project ${projectRef}).`
      + `\n     Changes here affect real accounts. Acknowledged via ORBIT_ACKNOWLEDGE_PRODUCTION_DB.\n`,
    );
  }

  // An unrecognised hosted project is not assumed safe just because it is not production.
  if ((info.isLocal || info.isTest)
    && (info.databaseTarget === "unknown" || info.databaseTarget === "preview"
      || info.databaseTarget === "approved-shared-preview")) {
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because ${info.environment} mode is configured to use ${where}.`,
        "",
        `${info.environment === "test" ? "Tests" : "Local development"} must use a database on this machine.`,
        "",
        DEV_LOCAL_HINT,
      ].join("\n"),
      { code: "non_local_target_in_local_mode", info },
    );
  }

  // Tests must never reach production, whatever else is configured.
  if (info.isTest && info.databaseTarget === "production") {
    throw new EnvironmentSafetyError(
      [
        "Orbit stopped the test run because it is configured to use the hosted production database.",
        "",
        "Tests may only use a local database. Run:",
        "",
        "  supabase start",
        "  npm run test:local",
      ].join("\n"),
      { code: "test_points_at_production", info },
    );
  }

  // Preview requires a project someone has explicitly approved — either a
  // disposable preview project, or the owner-approved shared Orbit database.
  if (info.isPreview && info.databaseTarget === "approved-shared-preview") {
    // Approved, and never silent. A Preview writing to real accounts is exactly
    // the thing that becomes invisible after the second week of using it.
    console.warn(
      [
        "",
        `  ⚠  PREVIEW IS USING THE SHARED ORBIT DATABASE (project ${info.projectRef}).`,
        ...sharedPreviewWarnings().map((line) => `     ${line}`),
        "",
      ].join("\n"),
    );
  } else if (info.isPreview && info.databaseTarget !== "preview") {
    const reason = info.databaseTarget === "production"
      ? "the hosted production database"
      : where;
    // When the shared mode was ASKED for but refused, say which condition
    // failed. A generic refusal here would send someone hunting through four
    // variables to find the one they mistyped.
    const sharedNote = info.sharedPreview?.requested
      ? ["", `Shared-database mode was requested but refused: ${info.sharedPreview.reason}.`]
      : [];
    throw new EnvironmentSafetyError(
      [
        `Orbit stopped before startup because preview mode is configured to use ${reason}.`,
        ...sharedNote,
        "",
        "Preview deployments need a hosted project that has been explicitly approved as",
        "disposable. Add its project reference to ORBIT_PREVIEW_PROJECT_REFS (or to the",
        "approved list in lib/env/known-targets.js) before using it.",
        "",
        "To use the existing Orbit database for a private Preview, all of these must be set:",
        "  ORBIT_ENVIRONMENT=preview",
        "  ORBIT_PREVIEW_DATABASE_MODE=shared-orbit",
        "  ORBIT_PREVIEW_PROJECT_REFS=<the Orbit project reference>",
        "  SUPABASE_URL whose project reference matches that value",
      ].join("\n"),
      { code: "preview_target_not_approved", info },
    );
  }

  // Production must be a real hosted database, never localhost.
  if (info.isProduction) {
    if (info.databaseTarget === "local") {
      throw new EnvironmentSafetyError(
        [
          "Orbit stopped before startup because production mode is configured to use a database on this machine.",
          "",
          "A production deployment must point at the hosted Supabase project. Set SUPABASE_URL",
          "and SUPABASE_ANON_KEY for the production environment.",
        ].join("\n"),
        { code: "production_points_at_localhost", info },
      );
    }
    if (info.databaseTarget === "missing" || info.databaseTarget === "invalid") {
      throw new EnvironmentSafetyError(
        [
          "Orbit stopped before startup because production mode has no usable database configuration.",
          "",
          "Set SUPABASE_URL and SUPABASE_ANON_KEY for the production environment.",
        ].join("\n"),
        { code: "production_missing_config", info },
      );
    }
    if (!info.hasAnonKey) {
      throw new EnvironmentSafetyError(
        [
          "Orbit stopped before startup because production mode is missing SUPABASE_ANON_KEY.",
          "",
          "Set it for the production environment. Never expose the service-role key to browsers.",
        ].join("\n"),
        { code: "production_missing_anon_key", info },
      );
    }
  }

  return info;
}

// ── Targeted guards for dangerous operations ─────────────────────────────────

// Migrations, seeds, resets: local database only.
export function assertLocalDatabaseTarget(operation = "This operation", info = resolveEnvironment()) {
  if (info.databaseTarget !== "local") {
    throw new EnvironmentSafetyError(
      [
        `${operation} was stopped because it is configured to use ${describeTarget(info)}.`,
        "",
        "It may only run against a database on this machine. Nothing was changed.",
        "",
        DEV_LOCAL_HINT,
      ].join("\n"),
      { code: "requires_local_target", info },
    );
  }
  return info;
}

// Anything that must never touch production, even if it can run against preview.
export function assertNonProductionTarget(operation = "This operation", info = resolveEnvironment()) {
  if (info.databaseTarget === "production" || info.isProduction) {
    throw new EnvironmentSafetyError(
      [
        `${operation} was stopped because it is configured to use the hosted production database.`,
        "",
        "Nothing was read or changed.",
        "",
        "Point at a local or approved disposable database first. For the test suite:",
        "",
        "  supabase start",
        "  npm run test:local",
      ].join("\n"),
      { code: "production_target_forbidden", info },
    );
  }
  return info;
}

// Creating disposable users / synthetic charts.
export function assertDisposableUserOperationsAllowed(operation = "Disposable test users", info = resolveEnvironment()) {
  assertNonProductionTarget(operation, info);
  if (!info.allowsDisposableUsers) {
    throw new EnvironmentSafetyError(
      [
        `${operation} are not permitted in ${info.environment} mode.`,
        "",
        "They may only be created in local or test mode against a local database.",
      ].join("\n"),
      { code: "disposable_users_forbidden", info },
    );
  }
  return assertLocalDatabaseTarget(operation, info);
}

// Using the service-role key (bypasses row-level security).
export function assertServiceRoleAllowed(operation = "Service-role access", info = resolveEnvironment()) {
  assertNonProductionTarget(operation, info);
  return info;
}

// ── Safe status line ─────────────────────────────────────────────────────────
// Deliberately plain text with explicit words — never colour alone — so the
// target is obvious in any terminal.
export function environmentStatusLines(info = resolveEnvironment(), extra = {}) {
  const askHistory = info.databaseTarget === "local" || info.databaseTarget === "production"
    || info.databaseTarget === "preview" || info.databaseTarget === "approved-shared-preview"
    ? "persistent"
    : "not persistent (in-memory)";
  const lines = [
    "Orbit Axis development server",
    `Environment: ${info.environment}`,
    `Database: ${describeTarget(info)}`,
    `Ask history: ${extra.askHistory ?? askHistory}`,
  ];
  if (extra.ollama) lines.push(`Ollama: ${extra.ollama}`);
  if (info.databaseTarget === "production") {
    lines.push("");
    lines.push("WARNING: this session is connected to the PRODUCTION database.");
  }
  return lines;
}
