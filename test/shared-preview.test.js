// Orbit Axis :: owner-approved shared-database Preview mode.
//
// The approval path is one test. Everything else here is a refusal, because the
// risk this mode carries is not "it fails to work" — it is "it works when it
// should not have". A Preview quietly pointed at real accounts is the failure
// worth spending tests on.

import { test } from "node:test";
import assert from "node:assert/strict";

import { sharedPreviewVerdict, SHARED_ORBIT_MODE, sharedPreviewWarnings }
  from "../lib/env/shared-preview.js";
import { resolveEnvironment } from "../lib/env/environment.js";
import { assertStartupSafe, EnvironmentSafetyError } from "../lib/env/guard.js";
import { PRODUCTION_PROJECT_REF } from "../lib/env/known-targets.js";

const ORBIT_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

/** A fully valid shared-Preview environment. Each test breaks one thing. */
const VALID = Object.freeze({
  ORBIT_ENVIRONMENT: "preview",
  ORBIT_PREVIEW_DATABASE_MODE: SHARED_ORBIT_MODE,
  ORBIT_PREVIEW_PROJECT_REFS: PRODUCTION_PROJECT_REF,
  SUPABASE_URL: ORBIT_URL,
  SUPABASE_ANON_KEY: "test-anon-key",
  VERCEL: "1",
  VERCEL_ENV: "preview",
});

const PREVIEW_CONTEXT = { environment: "preview", isVercel: true, vercelEnv: "preview" };
const verdict = (overrides = {}, context = PREVIEW_CONTEXT) =>
  sharedPreviewVerdict({ ...VALID, ...overrides }, context);

const resolve = (env) => resolveEnvironment({ env, loadEnvFiles: false });
const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

// ── The one approval path ───────────────────────────────────────────────────

test("a fully configured shared Preview is approved", () => {
  const v = verdict();
  assert.equal(v.approved, true, v.reason || "");
  assert.equal(v.projectRef, PRODUCTION_PROJECT_REF);
});

test("an approved shared Preview reclassifies the database target", () => {
  const info = resolve(VALID);
  assert.equal(info.databaseTarget, "approved-shared-preview");
  // The underlying classification is preserved, so nothing loses sight of the
  // fact that this really is the production project.
  assert.equal(info.rawDatabaseTarget, "production");
  assert.equal(info.isPreview, true);
});

test("an approved shared Preview starts, and does not throw", () => {
  assert.equal(caught(() => assertStartupSafe(resolve(VALID))), null);
});

// ── Every condition, broken one at a time ───────────────────────────────────

test("the mode must be requested at all", () => {
  const v = verdict({ ORBIT_PREVIEW_DATABASE_MODE: "" });
  assert.equal(v.approved, false);
  assert.equal(v.requested, false);
});

test("a misspelled mode is refused, not approximated", () => {
  // Close is not good enough. A value this consequential should be copied.
  for (const typo of ["shared_orbit", "Shared-Orbit", "SHARED-ORBIT", "shared orbit",
                      "sharedorbit", "orbit-shared", "true", "yes", "1"]) {
    const v = verdict({ ORBIT_PREVIEW_DATABASE_MODE: typo });
    assert.equal(v.approved, false, `"${typo}" must be refused`);
  }
});

test("surrounding whitespace is tolerated, because it is not a misspelling", () => {
  // A trailing space pasted into a dashboard field looks identical on screen.
  // Refusing it would produce a failure nobody can see, while the trimmed value
  // must still match exactly — so nothing is actually loosened.
  for (const padded of ["shared-orbit ", " shared-orbit", "  shared-orbit  ", "\tshared-orbit\n"]) {
    assert.equal(verdict({ ORBIT_PREVIEW_DATABASE_MODE: padded }).approved, true,
      `"${padded}" is the right value with whitespace around it`);
  }
});

test("the project reference allow-list must be set and must match", () => {
  assert.equal(verdict({ ORBIT_PREVIEW_PROJECT_REFS: "" }).approved, false);
  assert.equal(verdict({ ORBIT_PREVIEW_PROJECT_REFS: "someotherprojectref00" }).approved, false);
});

test("the URL and the allow-listed reference must agree", () => {
  // Two independently written values have to name the same project. Reading the
  // ref out of the URL and trusting it would make the check circular.
  const v = verdict({ SUPABASE_URL: "https://differentprojectref0.supabase.co" });
  assert.equal(v.approved, false);
  assert.match(v.reason, /not listed/i);
});

test("only the known Orbit project is ever approved", () => {
  // Even with a self-consistent configuration naming some other hosted project,
  // this mode must not become a general "any database in preview" hatch.
  const other = "someotherprojectref00";
  const v = verdict({
    SUPABASE_URL: `https://${other}.supabase.co`,
    ORBIT_PREVIEW_PROJECT_REFS: other,
  });
  assert.equal(v.approved, false);
});

test("localhost is refused — this mode is for the hosted project", () => {
  assert.equal(verdict({ SUPABASE_URL: "http://127.0.0.1:55321" }).approved, false);
  assert.equal(verdict({ SUPABASE_URL: "http://localhost:55321" }).approved, false);
});

test("a missing anon key is refused", () => {
  assert.equal(verdict({ SUPABASE_ANON_KEY: "" }).approved, false);
});

test("a service-role key disqualifies the Preview entirely", () => {
  // A Preview has no need for one, and its presence is one misconfiguration
  // away from a browser.
  const v = verdict({ SUPABASE_SERVICE_ROLE_KEY: "any-value-at-all" });
  assert.equal(v.approved, false);
  assert.match(v.reason, /service-role/i);
});

test("destructive and development helpers disqualify the Preview", () => {
  for (const flag of ["ORBIT_ALLOW_DISPOSABLE_USERS", "ORBIT_ALLOW_SEED_DATA",
                      "ORBIT_ALLOW_DB_RESET", "ORBIT_ALLOW_LOCAL_MIGRATIONS"]) {
    const v = verdict({ [flag]: "true" });
    assert.equal(v.approved, false, `${flag} must disqualify`);
    assert.match(v.reason, new RegExp(flag));
  }
});

// ── Production must never inherit this ──────────────────────────────────────

test("Production is refused even with a perfect shared-Preview configuration", () => {
  const v = verdict({ ORBIT_ENVIRONMENT: "production", VERCEL_ENV: "production" },
    { environment: "production", isVercel: true, vercelEnv: "production" });
  assert.equal(v.approved, false);
  assert.match(v.reason, /preview only/i);
});

test("an environment variable claiming preview cannot override what Vercel reports", () => {
  // ORBIT_ENVIRONMENT=preview on a Production deployment is the variable lying
  // about where it is running.
  const v = verdict({}, { environment: "preview", isVercel: true, vercelEnv: "production" });
  assert.equal(v.approved, false);
  assert.match(v.reason, /Vercel reports/i);
});

test("the Production guard is unchanged", () => {
  // Production against the Orbit project is normal and must still be allowed;
  // this mode neither helps nor hinders it.
  const info = resolve({
    ORBIT_ENVIRONMENT: "production", VERCEL: "1", VERCEL_ENV: "production",
    SUPABASE_URL: ORBIT_URL, SUPABASE_ANON_KEY: "k",
  });
  assert.equal(info.databaseTarget, "production");
  assert.equal(caught(() => assertStartupSafe(info)), null);
});

// ── Local and test must never reach it ──────────────────────────────────────

test("local mode cannot use the shared Preview target", () => {
  const info = resolve({ ...VALID, ORBIT_ENVIRONMENT: "local", VERCEL: "", VERCEL_ENV: "" });
  const error = caught(() => assertStartupSafe(info));
  assert.ok(error instanceof EnvironmentSafetyError, "local must not start against the shared target");
});

test("test mode cannot use the shared Preview target", () => {
  const info = resolve({ ...VALID, ORBIT_ENVIRONMENT: "test", VERCEL: "", VERCEL_ENV: "" });
  const error = caught(() => assertStartupSafe(info));
  assert.ok(error instanceof EnvironmentSafetyError, "a test suite must never reach it");
});

// ── Refusals explain themselves ─────────────────────────────────────────────

test("a refused-but-requested mode names the failing condition at startup", () => {
  // Otherwise someone hunts through four variables to find the one they mistyped.
  const info = resolve({ ...VALID, ORBIT_PREVIEW_DATABASE_MODE: "shared_orbit" });
  const error = caught(() => assertStartupSafe(info));
  assert.ok(error instanceof EnvironmentSafetyError);
  assert.match(error.message, /Shared-database mode was requested but refused/);
});

test("the startup error tells you exactly what to set", () => {
  const info = resolve({ ORBIT_ENVIRONMENT: "preview", SUPABASE_URL: ORBIT_URL, SUPABASE_ANON_KEY: "k" });
  const error = caught(() => assertStartupSafe(info));
  assert.ok(error instanceof EnvironmentSafetyError);
  for (const name of ["ORBIT_PREVIEW_DATABASE_MODE", "ORBIT_PREVIEW_PROJECT_REFS", "SUPABASE_URL"]) {
    assert.match(error.message, new RegExp(name));
  }
});

// ── Nothing is silent, and nothing leaks ────────────────────────────────────

test("the shared-data warning names what is actually shared", () => {
  const text = sharedPreviewWarnings().join(" ");
  for (const category of ["auth users", "profiles", "Ask Orbit", "saved charts"]) {
    assert.match(text, new RegExp(category, "i"));
  }
  assert.match(text, /real production data/i, "the warning must not be softened");
  assert.match(text, /staging/i, "it must say what the fix is");
});

test("a verdict never carries a key or a credential-bearing URL", () => {
  const body = JSON.stringify(verdict({ SUPABASE_ANON_KEY: "super-secret-anon-key" }));
  assert.ok(!body.includes("super-secret-anon-key"));
  assert.ok(!body.includes("SUPABASE_ANON_KEY"));
});

test("development affordances stay off in an approved shared Preview", () => {
  // The reclassification changes exactly one answer — whether the database may
  // be reached. It must not re-enable anything else.
  const info = resolve(VALID);
  assert.equal(info.allowsDisposableUsers, false);
  assert.equal(info.allowsSeedData, false);
  assert.equal(info.allowsLocalMigrations, false);
  assert.equal(info.allowsDevRoutes, false);
  assert.equal(info.allowsLocalLanguageProvider, false, "no Ollama on a deployed Preview");
  assert.equal(info.requiresPersistentStorage, true);
});

// ── Production shared-database approval (Update 5.1.2) ──────────────────────
//
// Production has its OWN variables. Approving a Preview must never silently
// approve Production: a Preview is seen by the owner, Production is seen by
// everyone, and the two decisions deserve to be made separately.

import { sharedProductionVerdict } from "../lib/env/shared-preview.js";

const PROD_VALID = Object.freeze({
  ORBIT_ENVIRONMENT: "production",
  ORBIT_PRODUCTION_DATABASE_MODE: SHARED_ORBIT_MODE,
  ORBIT_PRODUCTION_PROJECT_REFS: PRODUCTION_PROJECT_REF,
  SUPABASE_URL: ORBIT_URL,
  SUPABASE_ANON_KEY: "test-anon-key",
  VERCEL: "1",
  VERCEL_ENV: "production",
});
const PROD_CONTEXT = { environment: "production", isVercel: true, vercelEnv: "production" };
const prodVerdict = (overrides = {}, context = PROD_CONTEXT) =>
  sharedProductionVerdict({ ...PROD_VALID, ...overrides }, context);

test("a fully configured shared Production is approved", () => {
  const v = prodVerdict();
  assert.equal(v.approved, true, v.reason || "");
  assert.equal(v.target, "approved-shared-production");
});

test("an approved shared Production starts and is classified distinctly", () => {
  const info = resolve(PROD_VALID);
  assert.equal(info.databaseTarget, "approved-shared-production");
  assert.equal(info.rawDatabaseTarget, "production");
  assert.equal(caught(() => assertStartupSafe(info)), null);
});

test("Preview approval is not sufficient for Production", () => {
  // The exact trap this separation exists to prevent.
  const v = prodVerdict({
    ORBIT_PRODUCTION_DATABASE_MODE: undefined,
    ORBIT_PRODUCTION_PROJECT_REFS: undefined,
    ORBIT_PREVIEW_DATABASE_MODE: SHARED_ORBIT_MODE,
    ORBIT_PREVIEW_PROJECT_REFS: PRODUCTION_PROJECT_REF,
  });
  assert.equal(v.approved, false);
  assert.match(v.reason, /ORBIT_PRODUCTION_DATABASE_MODE is unset/);
});

test("Production approval is not sufficient for Preview", () => {
  const v = sharedPreviewVerdict(
    { ...PROD_VALID, ORBIT_ENVIRONMENT: "preview", VERCEL_ENV: "preview" },
    { environment: "preview", isVercel: true, vercelEnv: "preview" },
  );
  assert.equal(v.approved, false);
  assert.match(v.reason, /ORBIT_PREVIEW_DATABASE_MODE is unset/);
});

test("every Production condition fails closed", () => {
  const cases = [
    ["mode unset", { ORBIT_PRODUCTION_DATABASE_MODE: "" }],
    ["mode misspelled", { ORBIT_PRODUCTION_DATABASE_MODE: "shared_orbit" }],
    ["refs unset", { ORBIT_PRODUCTION_PROJECT_REFS: "" }],
    ["refs wrong", { ORBIT_PRODUCTION_PROJECT_REFS: "someotherprojectref00" }],
    ["url disagrees with refs", { SUPABASE_URL: "https://differentprojectref0.supabase.co" }],
    ["localhost", { SUPABASE_URL: "http://127.0.0.1:55321" }],
    ["anon key missing", { SUPABASE_ANON_KEY: "" }],
    ["service-role present", { SUPABASE_SERVICE_ROLE_KEY: "x" }],
    ["db password present", { SUPABASE_DB_PASSWORD: "x" }],
    ["disposable users", { ORBIT_ALLOW_DISPOSABLE_USERS: "true" }],
    ["seed data", { ORBIT_ALLOW_SEED_DATA: "true" }],
    ["db reset", { ORBIT_ALLOW_DB_RESET: "true" }],
    ["local migrations", { ORBIT_ALLOW_LOCAL_MIGRATIONS: "true" }],
  ];
  for (const [label, overrides] of cases) {
    assert.equal(prodVerdict(overrides).approved, false, `${label} must be refused`);
  }
});

test("a non-Orbit project is refused even when self-consistent", () => {
  const other = "someotherprojectref00";
  const v = prodVerdict({
    SUPABASE_URL: `https://${other}.supabase.co`,
    ORBIT_PRODUCTION_PROJECT_REFS: other,
  });
  assert.equal(v.approved, false);
});

test("Vercel Production cannot be overridden by ORBIT_ENVIRONMENT=preview", () => {
  const v = sharedPreviewVerdict(
    { ...PROD_VALID, ORBIT_ENVIRONMENT: "preview",
      ORBIT_PREVIEW_DATABASE_MODE: SHARED_ORBIT_MODE, ORBIT_PREVIEW_PROJECT_REFS: PRODUCTION_PROJECT_REF },
    { environment: "preview", isVercel: true, vercelEnv: "production" },
  );
  assert.equal(v.approved, false);
  assert.match(v.reason, /Vercel reports "production"/);
});

test("Vercel Preview cannot be overridden by ORBIT_ENVIRONMENT=production", () => {
  const v = prodVerdict({}, { environment: "production", isVercel: true, vercelEnv: "preview" });
  assert.equal(v.approved, false);
  assert.match(v.reason, /Vercel reports "preview"/);
});

test("local and test never reach the Production shared target", () => {
  for (const environment of ["local", "test"]) {
    const info = resolve({ ...PROD_VALID, ORBIT_ENVIRONMENT: environment, VERCEL: "", VERCEL_ENV: "" });
    assert.ok(caught(() => assertStartupSafe(info)) instanceof EnvironmentSafetyError,
      `${environment} must not start against the shared Production target`);
  }
});

test("a requested-but-refused Production mode fails startup with the reason", () => {
  const info = resolve({ ...PROD_VALID, ORBIT_PRODUCTION_PROJECT_REFS: "" });
  const error = caught(() => assertStartupSafe(info));
  assert.ok(error instanceof EnvironmentSafetyError);
  assert.equal(error.code, "production_shared_not_approved");
  assert.match(error.message, /ORBIT_PRODUCTION_PROJECT_REFS/);
});

test("development affordances stay off in an approved shared Production", () => {
  const info = resolve(PROD_VALID);
  for (const key of ["allowsDisposableUsers", "allowsSeedData", "allowsLocalMigrations",
                     "allowsDevRoutes", "allowsLocalLanguageProvider"]) {
    assert.equal(info[key], false, `${key} must stay off`);
  }
  assert.equal(info.requiresPersistentStorage, true);
});
