// Orbit Axis :: environment safety + database-target guard tests (Update 4.0.2).
//
// Pure unit tests against mocked targets. Nothing here contacts a database, and
// no test may use the real production project reference as a permitted target.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveEnvironment, resolveEnvironmentName, classifyDatabaseTarget,
  describeTarget, localSupabaseUrl, localSupabasePort, LOCAL_ANON_KEY,
} from "../lib/env/environment.js";
import {
  assertStartupSafe, assertLocalDatabaseTarget, assertNonProductionTarget,
  assertDisposableUserOperationsAllowed, assertServiceRoleAllowed,
  environmentStatusLines, EnvironmentSafetyError,
} from "../lib/env/guard.js";
import { PRODUCTION_PROJECT_REF, projectRefFromUrl, isLocalHost } from "../lib/env/known-targets.js";

const LOCAL_URL = "http://127.0.0.1:55321";
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const OTHER_HOSTED_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PREVIEW_REF = "previewprojectref0123";
const PREVIEW_URL = `https://${PREVIEW_REF}.supabase.co`;

// Build an isolated env; never inherits the developer's real configuration.
const env = (over = {}) => ({ ...over });
const info = (over = {}) => resolveEnvironment({ env: env(over), loadEnvFiles: false });

// ── Database-target detection ────────────────────────────────────────────────
test("detects a local URL as local", () => {
  for (const url of ["http://127.0.0.1:55321", "http://localhost:55321", "http://[::1]:55321"]) {
    assert.equal(classifyDatabaseTarget(url).target, "local", url);
  }
});

test("detects the known production project as production", () => {
  const c = classifyDatabaseTarget(PROD_URL);
  assert.equal(c.target, "production");
  assert.equal(c.projectRef, PRODUCTION_PROJECT_REF);
});

test("detects an approved preview project as preview", () => {
  const c = classifyDatabaseTarget(PREVIEW_URL, { ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF });
  assert.equal(c.target, "preview");
  assert.equal(c.projectRef, PREVIEW_REF);
});

test("treats an unapproved hosted project as unknown, never safe", () => {
  const c = classifyDatabaseTarget(OTHER_HOSTED_URL);
  assert.equal(c.target, "unknown", "an unrecognised hosted project is not assumed safe");
});

test("handles a malformed URL and missing configuration safely", () => {
  assert.equal(classifyDatabaseTarget("not a url").target, "invalid");
  assert.equal(classifyDatabaseTarget("").target, "missing");
  assert.equal(classifyDatabaseTarget(null).target, "missing");
  assert.equal(classifyDatabaseTarget(undefined).target, "missing");
});

test("project reference parsing only matches real Supabase hosts", () => {
  assert.equal(projectRefFromUrl(PROD_URL), PRODUCTION_PROJECT_REF);
  assert.equal(projectRefFromUrl("https://evil.example.com"), null);
  assert.equal(projectRefFromUrl(`https://${PRODUCTION_PROJECT_REF}.supabase.co.evil.com`), null,
    "a look-alike host must not be read as the production project");
  assert.ok(isLocalHost("127.0.0.1") && !isLocalHost("supabase.co"));
});

// ── Environment resolution ───────────────────────────────────────────────────
test("explicit ORBIT_ENVIRONMENT wins; unknown values are flagged", () => {
  assert.equal(resolveEnvironmentName({ ORBIT_ENVIRONMENT: "production" }).name, "production");
  const bad = resolveEnvironmentName({ ORBIT_ENVIRONMENT: "staging" });
  assert.equal(bad.valid, false, "an unrecognised environment is not silently accepted");
});

test("test mode is detected automatically under node --test", () => {
  assert.equal(resolveEnvironmentName({ NODE_TEST_CONTEXT: "child-v8" }).name, "test");
  assert.equal(resolveEnvironmentName({ NODE_ENV: "test" }).name, "test");
});

test("defaults to local when nothing is set", () => {
  const r = resolveEnvironmentName({});
  assert.equal(r.name, "local");
  assert.equal(r.source, "default");
});

test("permissions are derived from the environment", () => {
  const local = info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: LOCAL_URL });
  assert.ok(local.allowsDisposableUsers && local.allowsLocalMigrations && local.allowsSeedData);
  assert.equal(local.requiresPersistentStorage, false);

  const prod = info({ ORBIT_ENVIRONMENT: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: "k" });
  assert.equal(prod.allowsDisposableUsers, false, "production never allows disposable users");
  assert.equal(prod.allowsLocalMigrations, false);
  assert.equal(prod.allowsSeedData, false);
  assert.equal(prod.allowsDevRoutes, false, "production disables development-only routes");
  assert.equal(prod.allowsLocalLanguageProvider, false, "production never uses a local model");
  assert.equal(prod.requiresPersistentStorage, true);
});

// ── Startup guard ────────────────────────────────────────────────────────────
test("local mode + local database starts", () => {
  const i = info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: LOCAL_URL });
  assert.equal(assertStartupSafe(i).databaseTarget, "local");
});

test("local mode + PRODUCTION database stops", () => {
  const i = info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: PROD_URL });
  assert.throws(() => assertStartupSafe(i), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "local_points_at_production");
});

test("local mode + an unknown hosted database stops", () => {
  const i = info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: OTHER_HOSTED_URL });
  assert.throws(() => assertStartupSafe(i), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "non_local_target_in_local_mode");
});

test("test mode + PRODUCTION database stops", () => {
  const i = info({ ORBIT_ENVIRONMENT: "test", SUPABASE_URL: PROD_URL });
  assert.throws(() => assertStartupSafe(i), (e) => e instanceof EnvironmentSafetyError);
});

test("production mode + localhost stops", () => {
  const i = info({ ORBIT_ENVIRONMENT: "production", SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: "k" });
  assert.throws(() => assertStartupSafe(i), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "production_points_at_localhost");
});

test("production mode + missing configuration stops", () => {
  assert.throws(() => assertStartupSafe(info({ ORBIT_ENVIRONMENT: "production" })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "production_missing_config");
  assert.throws(() => assertStartupSafe(info({ ORBIT_ENVIRONMENT: "production", SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "production_missing_anon_key");
});

test("preview mode requires an explicitly approved project", () => {
  // Unapproved hosted project → refused.
  assert.throws(() => assertStartupSafe(info({ ORBIT_ENVIRONMENT: "preview", SUPABASE_URL: OTHER_HOSTED_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "preview_target_not_approved");
  // Production is never a valid preview target.
  assert.throws(() => assertStartupSafe(info({ ORBIT_ENVIRONMENT: "preview", SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "preview_target_not_approved");
  // Approved → allowed.
  const ok = info({ ORBIT_ENVIRONMENT: "preview", SUPABASE_URL: PREVIEW_URL, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF });
  assert.equal(assertStartupSafe(ok).databaseTarget, "preview");
});

test("an unrecognised ORBIT_ENVIRONMENT fails safely", () => {
  assert.throws(() => assertStartupSafe(info({ ORBIT_ENVIRONMENT: "staging", SUPABASE_URL: LOCAL_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "unknown_environment");
});

test("guard messages never contain secrets", () => {
  const secrets = {
    SUPABASE_URL: PROD_URL,
    SUPABASE_ANON_KEY: "anon-key-should-never-appear",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-should-never-appear",
    SUPABASE_ACCESS_TOKEN: "token-should-never-appear",
  };
  try {
    assertStartupSafe(info({ ORBIT_ENVIRONMENT: "local", ...secrets }));
    assert.fail("expected the guard to throw");
  } catch (e) {
    const text = `${e.message}\n${JSON.stringify(e.info)}`;
    assert.ok(!text.includes("anon-key-should-never-appear"), "no anon key in the error");
    assert.ok(!text.includes("service-role-should-never-appear"), "no service-role key in the error");
    assert.ok(!text.includes("token-should-never-appear"), "no access token in the error");
    assert.ok(!/eyJ[A-Za-z0-9_-]{10}/.test(text), "no JWT-shaped value in the error");
    assert.match(e.message, /npm run dev:local/, "tells the developer what to run instead");
  }
});

// ── Dangerous-operation guards ───────────────────────────────────────────────
test("migration guard allows local and rejects production", () => {
  assert.doesNotThrow(() => assertLocalDatabaseTarget("Applying migrations", info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: LOCAL_URL })));
  assert.throws(() => assertLocalDatabaseTarget("Applying migrations", info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "requires_local_target");
});

test("migration guard also rejects an unknown hosted target", () => {
  assert.throws(() => assertLocalDatabaseTarget("Applying migrations", info({ SUPABASE_URL: OTHER_HOSTED_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "requires_local_target");
});

test("seed / vault-push style guard rejects production", () => {
  assert.throws(() => assertNonProductionTarget("Seeding data", info({ SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError && e.code === "production_target_forbidden");
  assert.doesNotThrow(() => assertNonProductionTarget("Seeding data", info({ SUPABASE_URL: LOCAL_URL })));
});

test("disposable-user guard rejects production and non-local targets", () => {
  assert.throws(() => assertDisposableUserOperationsAllowed("Disposable users", info({ SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError);
  assert.throws(() => assertDisposableUserOperationsAllowed("Disposable users",
    info({ ORBIT_ENVIRONMENT: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: "k" })), (e) =>
    e instanceof EnvironmentSafetyError);
  assert.doesNotThrow(() => assertDisposableUserOperationsAllowed("Disposable users",
    info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: LOCAL_URL })));
});

test("service-role guard rejects production use", () => {
  assert.throws(() => assertServiceRoleAllowed("Service-role access", info({ SUPABASE_URL: PROD_URL })), (e) =>
    e instanceof EnvironmentSafetyError);
});

// ── The rule this whole update exists to enforce ─────────────────────────────
test("the production project reference can never be a permitted local or test target", () => {
  for (const environment of ["local", "test"]) {
    const i = info({ ORBIT_ENVIRONMENT: environment, SUPABASE_URL: PROD_URL });
    assert.equal(i.databaseTarget, "production");
    assert.throws(() => assertStartupSafe(i), EnvironmentSafetyError, `${environment} must refuse production`);
    assert.throws(() => assertLocalDatabaseTarget("op", i), EnvironmentSafetyError);
    assert.throws(() => assertNonProductionTarget("op", i), EnvironmentSafetyError);
    assert.throws(() => assertDisposableUserOperationsAllowed("op", i), EnvironmentSafetyError);
  }
  // And it is not in the approved preview list.
  assert.equal(classifyDatabaseTarget(PROD_URL, { ORBIT_PREVIEW_PROJECT_REFS: PRODUCTION_PROJECT_REF }).target,
    "production", "production can never be reclassified as an approved preview target");
});

// ── Local defaults come from tracked configuration ───────────────────────────
test("local Supabase URL is derived from the tracked supabase/config.toml port", () => {
  const port = localSupabasePort();
  assert.ok(Number.isInteger(port) && port > 0);
  assert.equal(localSupabaseUrl(), `http://127.0.0.1:${port}`);
  assert.equal(classifyDatabaseTarget(localSupabaseUrl()).target, "local");
  assert.match(LOCAL_ANON_KEY, /^eyJ/, "the published local demo key, valid only against a local stack");
});

// ── Status output ────────────────────────────────────────────────────────────
test("status lines name the target in words, not colour alone", () => {
  const lines = environmentStatusLines(info({ ORBIT_ENVIRONMENT: "local", SUPABASE_URL: LOCAL_URL }), { ollama: "available" });
  const text = lines.join("\n");
  assert.match(text, /Environment: local/);
  assert.match(text, /Database: local Supabase/);
  assert.match(text, /Ask history: persistent/);
  assert.ok(!/\[/.test(text), "no ANSI colour codes carrying meaning");
});

test("status output warns in words when connected to production", () => {
  const lines = environmentStatusLines(info({ ORBIT_ENVIRONMENT: "preview", SUPABASE_URL: PROD_URL }));
  assert.match(lines.join("\n"), /WARNING: this session is connected to the PRODUCTION database/);
});

test("describeTarget never leaks a full URL or key", () => {
  const text = describeTarget(info({ SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: "should-not-appear" }));
  assert.ok(!text.includes("should-not-appear"));
  assert.ok(!text.includes("https://"), "hostnames only, never a full URL");
});
