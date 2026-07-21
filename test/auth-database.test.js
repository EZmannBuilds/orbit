// Orbit Axis :: authentication lifecycle and database readiness.
//
// These tests never touch the hosted database. Anything requiring a real
// Supabase project — RLS, cross-user denial, live sign-in — belongs to
// scripts/rls-check.js, which runs against the real thing on demand and refuses
// to run without the project being named.
//
// What is covered here is the logic Orbit owns: how it decides, what it says,
// and what it must never say.

import { test } from "node:test";
import assert from "node:assert/strict";

import { checkReadiness, resetReadinessCache } from "../lib/api/readiness.js";
import { health } from "../lib/api/v1/handlers/platform.js";
import {
  sessionCookie, clearSessionCookie, SESSION_COOKIE, isSecureRequest,
} from "../lib/auth/supabase-auth.js";

const SESSION = Object.freeze({
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});

// ── Session cookies ─────────────────────────────────────────────────────────

test("the session cookie is not readable by scripts", () => {
  const cookie = sessionCookie(SESSION, {});
  assert.match(cookie, /HttpOnly/, "a session cookie readable by JavaScript is one XSS away from stolen");
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
});

test("the cookie is marked Secure on a deployment and not on plain local http", () => {
  const deployed = sessionCookie(SESSION, { req: {}, env: { isDeployed: true } });
  assert.match(deployed, /Secure/, "a deployed session cookie must not travel over http");

  const local = sessionCookie(SESSION, { req: { headers: {} }, env: { isDeployed: false } });
  assert.doesNotMatch(local, /Secure/,
    "marking it Secure on plain local http would stop the cookie being stored at all");
});

test("only a verified deployment may be believed about the original scheme", () => {
  const spoofed = { headers: { "x-forwarded-proto": "https" }, socket: {} };
  assert.equal(isSecureRequest(spoofed, { isDeployed: false, isVercel: false }), false,
    "anyone can send x-forwarded-proto to a local server");
  assert.equal(isSecureRequest(spoofed, { isDeployed: false, isVercel: true }), true);
});

test("signing out expires the cookie rather than merely blanking it", () => {
  const cleared = clearSessionCookie({});
  assert.match(cleared, /Max-Age=0/, "without Max-Age=0 the browser keeps the cookie");
  assert.match(cleared, /HttpOnly/);
});

// ── Readiness ───────────────────────────────────────────────────────────────

test("an unconfigured database reports 'not looked' rather than 'down'", async () => {
  resetReadinessCache();
  try {
    // Injected rather than achieved by deleting environment variables:
    // supabaseConfig() reloads .env.local from disk, so clearing the variables
    // does nothing. This was found by this test failing against the real thing.
    const state = await checkReadiness({
      force: true,
      config: { url: "", anonKey: "" },
      fetchImpl: () => { throw new Error("must not probe when nothing is configured"); },
    });
    assert.equal(state.database.configured, false);
    // null, not false: "no database configured" and "the database is down" are
    // different problems with different fixes, and collapsing them into one
    // boolean sends someone chasing an outage that is really a missing setting.
    assert.equal(state.database.reachable, null);
    assert.equal(state.authentication.reachable, null);
  } finally { resetReadinessCache(); }
});

test("a 401 from the database still counts as reachable", async () => {
  resetReadinessCache();
  const config = { url: "https://exampleprojectref000.supabase.co", anonKey: "test-anon-key" };
  try {
    // 401 is what a correctly secured PostgREST returns to an anonymous read.
    // Reporting that as unreachable would flag a healthy, well-defended
    // database as broken.
    const state = await checkReadiness({ force: true, config, fetchImpl: async () => ({ status: 401 }) });
    assert.equal(state.database.reachable, true);
  } finally { resetReadinessCache(); }
});

test("a network failure reports unreachable instead of throwing", async () => {
  resetReadinessCache();
  const config = { url: "https://exampleprojectref000.supabase.co", anonKey: "test-anon-key" };
  try {
    const state = await checkReadiness({ force: true, config, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
    assert.equal(state.database.reachable, false);
    assert.equal(state.authentication.reachable, false);
  } finally { resetReadinessCache(); }
});

test("a 500 from the database is not reported as reachable", async () => {
  resetReadinessCache();
  const config = { url: "https://exampleprojectref000.supabase.co", anonKey: "test-anon-key" };
  try {
    const state = await checkReadiness({ force: true, config, fetchImpl: async () => ({ status: 503 }) });
    assert.equal(state.database.reachable, false);
  } finally { resetReadinessCache(); }
});

// ── Health disclosure ───────────────────────────────────────────────────────

test("health reports database capability without disclosing the project", async () => {
  const body = await health({
    readiness: async () => ({
      database: { configured: true, reachable: true },
      authentication: { configured: true, reachable: true },
    }),
  });
  assert.equal(body.database.reachable, true);
  assert.equal(body.authentication.reachable, true);

  const serialised = JSON.stringify(body);
  for (const forbidden of ["supabase.co", "SUPABASE_", "eyJ", "sb_secret", "sb_publishable",
                           "service_role", "postgres://", "/Users/"]) {
    assert.ok(!serialised.includes(forbidden),
      `health must not disclose ${forbidden} — it is public and unauthenticated`);
  }
});

test("a database outage does not make the calculation API look broken", async () => {
  // The calculation endpoints are stateless and keep working with no database
  // at all. Reporting "degraded" here would page someone about charts that are
  // computing perfectly well.
  const body = await health({
    readiness: async () => ({
      database: { configured: true, reachable: false },
      authentication: { configured: true, reachable: false },
    }),
  });
  assert.equal(body.status, "ok", "engine capability, not database state, decides this field");
  assert.equal(body.database.reachable, false, "but the outage is still reported honestly");
});

// ── Password reset ──────────────────────────────────────────────────────────

test("the password reset module exposes the whole flow", async () => {
  const auth = await import("../lib/auth/supabase-auth.js");
  for (const fn of ["requestPasswordReset", "updatePassword", "verifyRecoveryToken"]) {
    assert.equal(typeof auth[fn], "function", `${fn} is required for the reset lifecycle`);
  }
});

test("updating a password without a token is refused before any request", async () => {
  const { updatePassword } = await import("../lib/auth/supabase-auth.js");
  const result = await updatePassword({ accessToken: "", password: "a-good-password" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("verifying an empty recovery token is refused before any request", async () => {
  const { verifyRecoveryToken } = await import("../lib/auth/supabase-auth.js");
  const result = await verifyRecoveryToken({ tokenHash: "" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("the reset page ships and never reveals the token", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../public/reset-password.html", import.meta.url), "utf8");

  assert.match(page, /noindex/, "a recovery page must not be indexed");
  assert.match(page, /no-referrer/, "the token must not leak through a referrer header");
  assert.match(page, /history\.replaceState/,
    "the token must be stripped from the address bar, or it lives on in browser history");
  assert.match(page, /submitting/, "a duplicate submission must be impossible");
  assert.doesNotMatch(page, /localStorage|sessionStorage/,
    "a recovery token must never be persisted to storage");
});

// ── The RLS script's safety gate ────────────────────────────────────────────

test("the RLS script refuses to write to a hosted project unnamed", async () => {
  const { readFileSync } = await import("node:fs");
  const script = readFileSync(new URL("../scripts/rls-check.js", import.meta.url), "utf8");

  assert.match(script, /confirm-project/,
    "a script that writes to the production database must make the caller name it");
  assert.match(script, /confirmed !== projectRef/, "the confirmation must actually be compared");
  assert.match(script, /example\.com/, "test users must use an obviously synthetic domain");
  assert.doesNotMatch(script, /console\.log\([^)]*password/i, "a generated password must never be printed");
});

test("no real birth data is hardcoded into the RLS fixtures", async () => {
  const { readFileSync } = await import("node:fs");
  const script = readFileSync(new URL("../scripts/rls-check.js", import.meta.url), "utf8");
  // The fixture is the same synthetic Chicago 1990 chart used across the API
  // tests. Test data that is really someone's birth record ends up in a public
  // repository the day the repository is published.
  assert.match(script, /1990-06-15/);
  assert.match(script, /Test City/);
});
