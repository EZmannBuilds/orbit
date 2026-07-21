// Orbit Axis :: environment + database-target resolver (Update 4.0.2).
//
// One module decides three things, so no other file has to guess:
//   1. Which environment Orbit is running in (local / test / preview / production).
//   2. Which database the configuration actually points at.
//   3. Which development-only operations are permitted as a result.
//
// Why this exists: Update 4.0.1 found that `.env.local` points at the hosted
// production project, so an ordinary `npm start` — or a test run, migration, or
// disposable-user script — could reach production. Safety previously depended on
// a developer remembering per-process overrides. This module makes the target
// explicit and checkable instead.
//
// Nothing here reads or returns a key. Only public identifiers (hostname,
// project reference, environment name) are exposed, so results are safe to log.

import { sharedPreviewVerdict } from "./shared-preview.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, loadEnvLocal } from "../local-llm/config.js";
import {
  PRODUCTION_PROJECT_REF, APPROVED_PREVIEW_PROJECT_REFS, configuredPreviewRefs,
  projectRefFromUrl, hostFromUrl, isLocalHost,
} from "./known-targets.js";

export const ENVIRONMENTS = Object.freeze(["local", "test", "preview", "production"]);

// ── Local defaults from tracked configuration ────────────────────────────────
// The local API port lives in supabase/config.toml (tracked), so developers
// never copy port numbers between terminals. Orbit uses the 553xx range because
// another project occupies the standard 543xx range.
export const FALLBACK_LOCAL_API_PORT = 55321;

export function localSupabasePort(root = REPO_ROOT) {
  const configPath = join(root, "supabase", "config.toml");
  if (!existsSync(configPath)) return FALLBACK_LOCAL_API_PORT;
  try {
    const toml = readFileSync(configPath, "utf8");
    // The [api] section's port is the REST/auth endpoint the app talks to.
    const api = toml.split(/^\[/m).find((section) => section.startsWith("api]"));
    const match = api && api.match(/^port\s*=\s*(\d+)/m);
    return match ? Number(match[1]) : FALLBACK_LOCAL_API_PORT;
  } catch { return FALLBACK_LOCAL_API_PORT; }
}

export function localSupabaseUrl(root = REPO_ROOT) {
  return `http://127.0.0.1:${localSupabasePort(root)}`;
}

// The standard Supabase local development anon key. Identical on every machine,
// published in Supabase's own docs, and only ever valid against a local stack.
// It is NOT a secret and deliberately is not read from .env.local.
export const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// ── Database-target classification ───────────────────────────────────────────
// "local"      — a database on this machine
// "production" — the known hosted production project
// "preview"    — a hosted project explicitly approved as disposable
// "unknown"    — some other hosted project; never assumed safe
// "missing"    — no URL configured
// "invalid"    — a URL that could not be parsed
export function classifyDatabaseTarget(url, env = process.env) {
  if (url == null || String(url).trim() === "") {
    return { target: "missing", host: null, projectRef: null };
  }
  const host = hostFromUrl(url);
  if (!host) return { target: "invalid", host: null, projectRef: null };
  if (isLocalHost(host)) return { target: "local", host, projectRef: null };

  const projectRef = projectRefFromUrl(url);
  if (projectRef && projectRef === PRODUCTION_PROJECT_REF) {
    return { target: "production", host, projectRef };
  }
  const approved = new Set([...APPROVED_PREVIEW_PROJECT_REFS, ...configuredPreviewRefs(env)]);
  if (projectRef && approved.has(projectRef)) {
    return { target: "preview", host, projectRef };
  }
  return { target: "unknown", host, projectRef };
}

// ── Vercel detection (Update 4.0.3) ──────────────────────────────────────────
// Vercel sets VERCEL=1 in every build and every function invocation, and
// VERCEL_ENV to one of production / preview / development. These are the only
// signals trusted to mean "this process is running on Vercel" — a deployment
// URL alone is not, because VERCEL_URL can be echoed into a local shell.
//
// Nothing here reads a secret. VERCEL_URL is a public hostname.
export const VERCEL_ENVIRONMENTS = Object.freeze(["production", "preview", "development"]);

export function resolveVercelContext(env = process.env) {
  const onVercel = String(env.VERCEL || "") === "1" || String(env.VERCEL || "").toLowerCase() === "true";
  const rawEnv = String(env.VERCEL_ENV || "").trim().toLowerCase();
  const vercelEnv = VERCEL_ENVIRONMENTS.includes(rawEnv) ? rawEnv : null;
  // VERCEL_URL is the per-deployment hostname with no protocol (Vercel's own
  // format). Stored as a hostname so it is safe to log and safe to compare.
  const rawUrl = String(env.VERCEL_URL || "").trim();
  const deploymentHost = rawUrl ? rawUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
  return {
    isVercel: onVercel,
    vercelEnv,
    deploymentHost,
    // Git metadata is informational only — never a safety input.
    gitBranch: String(env.VERCEL_GIT_COMMIT_REF || "").trim() || null,
    gitSha: String(env.VERCEL_GIT_COMMIT_SHA || "").trim().slice(0, 12) || null,
  };
}

// ── Environment resolution ───────────────────────────────────────────────────
// Precedence: explicit ORBIT_ENVIRONMENT → Vercel's own VERCEL_ENV →
// automatic test detection → local.
//
// VERCEL_ENV is trusted above test detection but below ORBIT_ENVIRONMENT so the
// owner can still pin a deployment explicitly. NODE_ENV alone is deliberately
// not trusted: it says nothing about which database is configured, which is the
// risk Update 4.0.2 addressed.
export function resolveEnvironmentName(env = process.env) {
  const explicit = String(env.ORBIT_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit) {
    return ENVIRONMENTS.includes(explicit)
      ? { name: explicit, source: "ORBIT_ENVIRONMENT", valid: true }
      : { name: explicit, source: "ORBIT_ENVIRONMENT", valid: false };
  }
  // `node --test` sets NODE_TEST_CONTEXT in each test process. Checked before
  // VERCEL_ENV so a test process can never be reclassified as a deployment by
  // stray Vercel variables in the shell.
  if (env.NODE_TEST_CONTEXT) return { name: "test", source: "node --test", valid: true };
  if (String(env.NODE_ENV || "").toLowerCase() === "test") return { name: "test", source: "NODE_ENV", valid: true };

  const vercel = resolveVercelContext(env);
  if (vercel.isVercel && vercel.vercelEnv) {
    // `vercel dev` reports "development" and runs on the owner's own machine,
    // so it maps to local rather than to a deployed environment.
    const mapped = vercel.vercelEnv === "development" ? "local" : vercel.vercelEnv;
    return { name: mapped, source: "VERCEL_ENV", valid: true };
  }
  if (vercel.isVercel) {
    // On Vercel but with no usable VERCEL_ENV: refuse to guess. Treating this
    // as local would be the dangerous default, so it fails the guard instead.
    return { name: "unknown-vercel", source: "VERCEL", valid: false };
  }
  return { name: "local", source: "default", valid: true };
}

// The structured description everything else consumes. Safe to log in full.
//
// Callers that want to force a value (for example "check this as if it were
// production") must pass `overrides`, NOT a pre-spread copy of process.env:
// the env files are loaded inside this function, so a snapshot taken by the
// caller would be missing everything .env.local provides.
export function resolveEnvironment({ env = null, overrides = null, loadEnvFiles = true } = {}) {
  if (loadEnvFiles) loadEnvLocal();
  const effective = env ?? { ...process.env, ...(overrides || {}) };
  const resolved = resolveEnvironmentName(effective);
  const environment = resolved.name;
  const url = effective.SUPABASE_URL || "";
  const { target, host, projectRef } = classifyDatabaseTarget(url, effective);

  const isProduction = environment === "production";
  const isLocal = environment === "local";
  const isTest = environment === "test";
  const isPreview = environment === "preview";
  const vercel = resolveVercelContext(effective);

  // The owner-approved shared-database Preview. Evaluated here so exactly one
  // place decides, and every consumer — guard, deploy:check, startup banner —
  // reads the same verdict rather than re-deriving it and drifting.
  const sharedPreview = sharedPreviewVerdict(effective, {
    environment,
    isVercel: vercel.isVercel,
    vercelEnv: vercel.vercelEnv,
  });

  // A deployed Vercel function has no localhost to reach: no Ollama, no local
  // Supabase, no disposable users, no migrations — regardless of how the
  // environment name resolved. `vercel dev` (VERCEL_ENV=development) maps to
  // local above and is therefore not "deployed".
  const isDeployed = vercel.isVercel && (vercel.vercelEnv === "production" || vercel.vercelEnv === "preview");

  return {
    environment,
    environmentSource: resolved.source,
    environmentValid: resolved.valid,
    // An approved shared Preview reclassifies the Orbit project from
    // "production" to "approved-shared-preview". The reclassification is the
    // entire mechanism: downstream guards keep refusing "production" in a
    // preview exactly as before, and nothing about the Production path changed.
    databaseTarget: sharedPreview.approved ? "approved-shared-preview" : target,
    rawDatabaseTarget: target,
    sharedPreview,
    databaseHost: host,           // hostname only — never a full credential URL
    projectRef,                   // public identifier, or null for local
    isProduction, isLocal, isTest, isPreview,
    // ── Vercel context (Update 4.0.3) ─────────────────────────────────────────
    isVercel: vercel.isVercel,
    vercelEnv: vercel.vercelEnv,
    deploymentHost: vercel.deploymentHost,   // public hostname, safe to log
    gitBranch: vercel.gitBranch,
    gitSha: vercel.gitSha,
    isDeployed,
    // Permissions derived from the environment, not sprinkled through the app.
    // Every development affordance is additionally denied on a deployed
    // function, so a mis-set ORBIT_ENVIRONMENT cannot re-enable it.
    allowsDisposableUsers: (isLocal || isTest) && !isDeployed,
    allowsLocalMigrations: (isLocal || isTest) && !isDeployed,
    allowsSeedData: (isLocal || isTest) && !isDeployed,
    allowsDevRoutes: (isLocal || isTest) && !isDeployed,
    allowsLocalLanguageProvider: (isLocal || isTest) && !isDeployed,
    requiresPersistentStorage: isProduction || isPreview || isDeployed,
    hasAnonKey: Boolean(effective.SUPABASE_ANON_KEY),
    hasServiceRoleKey: Boolean(effective.SUPABASE_SERVICE_ROLE_KEY),
  };
}

// A short, non-sensitive, human-readable summary.
export function describeTarget(info) {
  switch (info.databaseTarget) {
    case "local": return `local Supabase (${info.databaseHost})`;
    case "production": return "the hosted PRODUCTION database";
    case "preview": return `an approved preview database (${info.projectRef})`;
    case "unknown": return `an unrecognised hosted database (${info.databaseHost})`;
    case "missing": return "no database configured";
    default: return "an unreadable database URL";
  }
}
