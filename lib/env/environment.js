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

// ── Environment resolution ───────────────────────────────────────────────────
// Precedence: explicit ORBIT_ENVIRONMENT → automatic test detection → local.
// NODE_ENV alone is deliberately not trusted: it says nothing about which
// database is configured, which is the risk this update addresses.
export function resolveEnvironmentName(env = process.env) {
  const explicit = String(env.ORBIT_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit) {
    return ENVIRONMENTS.includes(explicit)
      ? { name: explicit, source: "ORBIT_ENVIRONMENT", valid: true }
      : { name: explicit, source: "ORBIT_ENVIRONMENT", valid: false };
  }
  // `node --test` sets NODE_TEST_CONTEXT in each test process.
  if (env.NODE_TEST_CONTEXT) return { name: "test", source: "node --test", valid: true };
  if (String(env.NODE_ENV || "").toLowerCase() === "test") return { name: "test", source: "NODE_ENV", valid: true };
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

  return {
    environment,
    environmentSource: resolved.source,
    environmentValid: resolved.valid,
    databaseTarget: target,
    databaseHost: host,           // hostname only — never a full credential URL
    projectRef,                   // public identifier, or null for local
    isProduction, isLocal, isTest, isPreview,
    // Permissions derived from the environment, not sprinkled through the app.
    allowsDisposableUsers: isLocal || isTest,
    allowsLocalMigrations: isLocal || isTest,
    allowsSeedData: isLocal || isTest,
    allowsDevRoutes: isLocal || isTest,
    allowsLocalLanguageProvider: isLocal || isTest,
    requiresPersistentStorage: isProduction || isPreview,
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
