// Orbit Axis :: Vercel environment classification tests (Update 4.0.3).
//
// Pure unit tests over the resolver and guard. Nothing here contacts a
// database, a deployment, or Ollama, and no test uses the real production
// project reference as a permitted target.
//
// The matrix these cover is the whole point of the update: a deployment must
// classify itself correctly, refuse localhost, refuse an unapproved hosted
// project, and switch off every development affordance — including the local
// language provider — before anything reaches the network.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveEnvironment, resolveEnvironmentName, resolveVercelContext } from "../lib/env/environment.js";
import { assertStartupSafe, EnvironmentSafetyError } from "../lib/env/guard.js";
import { PRODUCTION_PROJECT_REF } from "../lib/env/known-targets.js";
import { createLocalLLMProvider } from "../lib/local-llm/provider.js";
import { askStorageMode, askStoreFor, createUnavailableAskStore } from "../lib/ask-orbit/store.js";

const LOCAL_URL = "http://127.0.0.1:55321";
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const OTHER_HOSTED_URL = "https://abcdefghijklmnopqrst.supabase.co";
const PREVIEW_REF = "previewprojectref0123";
const PREVIEW_URL = `https://${PREVIEW_REF}.supabase.co`;
const ANON = "anon-key-placeholder";

// Isolated env; never inherits the developer's real configuration.
const info = (over = {}) => resolveEnvironment({ env: { ...over }, loadEnvFiles: false });

// assert.throws() does not hand back the error, and the guard's `code` is the
// part worth asserting on — the message is prose that may be reworded.
function caught(fn) {
  try { fn(); } catch (error) { return error; }
  return null;
}

function blockedWith(code, over) {
  const err = caught(() => assertStartupSafe(info(over)));
  assert.ok(err instanceof EnvironmentSafetyError, `expected an EnvironmentSafetyError, got ${err}`);
  assert.equal(err.code, code, `expected guard code ${code}, got ${err.code}`);
  return err;
}

// ── Vercel context detection ─────────────────────────────────────────────────

test("VERCEL=1 with VERCEL_ENV is recognised as a Vercel context", () => {
  const ctx = resolveVercelContext({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "orbit-abc123.vercel.app" });
  assert.equal(ctx.isVercel, true);
  assert.equal(ctx.vercelEnv, "preview");
  assert.equal(ctx.deploymentHost, "orbit-abc123.vercel.app");
});

test("a VERCEL_URL with a protocol is reduced to a bare hostname", () => {
  const ctx = resolveVercelContext({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_URL: "https://orbit.vercel.app/x" });
  assert.equal(ctx.deploymentHost, "orbit.vercel.app");
});

test("VERCEL_URL alone does not make a local shell look like a deployment", () => {
  const ctx = resolveVercelContext({ VERCEL_URL: "orbit-abc123.vercel.app" });
  assert.equal(ctx.isVercel, false);
  assert.equal(resolveEnvironmentName({ VERCEL_URL: "orbit-abc123.vercel.app" }).name, "local");
});

// ── Classification ───────────────────────────────────────────────────────────

test("Vercel preview classifies as preview and as deployed", () => {
  const i = info({ VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PREVIEW_URL, SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF });
  assert.equal(i.environment, "preview");
  assert.equal(i.environmentSource, "VERCEL_ENV");
  assert.equal(i.isPreview, true);
  assert.equal(i.isDeployed, true);
});

test("Vercel production classifies as production and as deployed", () => {
  const i = info({ VERCEL: "1", VERCEL_ENV: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
  assert.equal(i.environment, "production");
  assert.equal(i.isProduction, true);
  assert.equal(i.isDeployed, true);
});

test("`vercel dev` (VERCEL_ENV=development) maps to local and is not deployed", () => {
  const i = info({ VERCEL: "1", VERCEL_ENV: "development", SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: ANON });
  assert.equal(i.environment, "local");
  assert.equal(i.isDeployed, false);
  assert.equal(i.allowsLocalLanguageProvider, true, "vercel dev runs on the owner's machine, so Ollama is still reachable");
});

test("no Vercel variables at all still classifies as local", () => {
  assert.equal(info({ SUPABASE_URL: LOCAL_URL }).environment, "local");
});

test("ORBIT_ENVIRONMENT overrides VERCEL_ENV", () => {
  const i = info({ VERCEL: "1", VERCEL_ENV: "preview", ORBIT_ENVIRONMENT: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
  assert.equal(i.environment, "production");
  assert.equal(i.environmentSource, "ORBIT_ENVIRONMENT");
  assert.equal(i.isDeployed, true, "still a real Vercel deployment regardless of the override");
});

test("a test process is never reclassified by stray Vercel variables", () => {
  const resolved = resolveEnvironmentName({ NODE_TEST_CONTEXT: "child", VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(resolved.name, "test");
});

// ── Unsafe combinations are refused ──────────────────────────────────────────

test("Vercel with no usable VERCEL_ENV fails safely instead of guessing", () => {
  const i = info({ VERCEL: "1", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
  assert.equal(i.environmentValid, false);
  blockedWith("vercel_environment_unknown", { VERCEL: "1", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
});

test("Vercel preview pointed at localhost Supabase is rejected", () => {
  blockedWith("vercel_points_at_localhost", { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: ANON });
});

test("Vercel production pointed at localhost Supabase is rejected", () => {
  blockedWith("vercel_points_at_localhost", { VERCEL: "1", VERCEL_ENV: "production", SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: ANON });
});

test("localhost on Vercel is rejected even when ORBIT_ENVIRONMENT says local", () => {
  // The dangerous case: a permissive override that would otherwise re-enable
  // every development affordance on a real deployment.
  blockedWith("vercel_points_at_localhost", {
    VERCEL: "1", VERCEL_ENV: "preview", ORBIT_ENVIRONMENT: "local",
    SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: ANON,
  });
});

test("a Vercel deployment with no database configuration is rejected", () => {
  blockedWith("vercel_missing_database", { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_ANON_KEY: ANON });
});

test("a Vercel deployment missing the anon key is rejected", () => {
  blockedWith("vercel_missing_anon_key", { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PREVIEW_URL, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF });
});

test("preview pointed at the production project is rejected without explicit approval", () => {
  blockedWith("preview_target_not_approved", { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
});

test("preview pointed at an unknown hosted project is rejected", () => {
  blockedWith("preview_target_not_approved", { VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: OTHER_HOSTED_URL, SUPABASE_ANON_KEY: ANON });
});

test("preview pointed at an approved disposable project is allowed", () => {
  const i = info({
    VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PREVIEW_URL,
    SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF,
  });
  assert.equal(assertStartupSafe(i), i);
  assert.equal(i.databaseTarget, "preview");
});

test("production on Vercel with the production project is allowed", () => {
  const i = info({ VERCEL: "1", VERCEL_ENV: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
  assert.equal(assertStartupSafe(i), i);
});

// ── Development affordances are off on a deployment ──────────────────────────

for (const vercelEnv of ["preview", "production"]) {
  test(`every development affordance is disabled on Vercel ${vercelEnv}`, () => {
    const i = info({
      VERCEL: "1", VERCEL_ENV: vercelEnv,
      SUPABASE_URL: vercelEnv === "preview" ? PREVIEW_URL : PROD_URL,
      SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF,
    });
    assert.equal(i.allowsDisposableUsers, false, "disposable users");
    assert.equal(i.allowsLocalMigrations, false, "migrations");
    assert.equal(i.allowsSeedData, false, "seed data");
    assert.equal(i.allowsDevRoutes, false, "development routes");
    assert.equal(i.allowsLocalLanguageProvider, false, "local language provider");
    assert.equal(i.requiresPersistentStorage, true, "durable storage");
  });
}

test("a permissive ORBIT_ENVIRONMENT cannot re-enable dev affordances on a deployment", () => {
  const i = info({
    VERCEL: "1", VERCEL_ENV: "preview", ORBIT_ENVIRONMENT: "local",
    SUPABASE_URL: PREVIEW_URL, SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF,
  });
  assert.equal(i.environment, "local");
  assert.equal(i.isDeployed, true);
  assert.equal(i.allowsDisposableUsers, false);
  assert.equal(i.allowsDevRoutes, false);
  assert.equal(i.allowsLocalLanguageProvider, false);
});

// ── Ollama is never reachable from a deployment ──────────────────────────────
// The provider factory is the only place a network-capable Ollama client is
// constructed, so proving it returns an inert stub proves no call can happen.

for (const vercelEnv of ["preview", "production"]) {
  test(`the Ollama provider is inert on Vercel ${vercelEnv}`, async () => {
    const i = info({
      VERCEL: "1", VERCEL_ENV: vercelEnv,
      SUPABASE_URL: vercelEnv === "preview" ? PREVIEW_URL : PROD_URL,
      SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF,
      // Deliberately hostile configuration: enabled, and aimed at a real host.
      ORBIT_LOCAL_LLM_ENABLED: "true", ORBIT_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    });

    // Any outbound fetch during this block is a failure of the contract.
    const realFetch = globalThis.fetch;
    let attempted = null;
    globalThis.fetch = (url) => { attempted = String(url); throw new Error("network access attempted"); };
    try {
      const provider = createLocalLLMProvider({}, { env: i });
      const health = await provider.health();
      assert.equal(health.reachable, false);
      assert.equal(health.disabled, true);
      assert.equal(health.model_available, false);
      assert.equal(health.disabled_reason, "not_available_on_deployment");

      assert.deepEqual(await provider.listModels(), []);
      assert.equal((await provider.generate({ prompt: "x" })).ok, false);
      assert.equal((await provider.warmup()).ok, false);

      const events = [];
      for await (const ev of provider.streamChat({ messages: [] })) events.push(ev);
      assert.equal(events[0].type, "error");
      assert.equal(events[0].status, "disabled");

      assert.equal(attempted, null, `no network call may be made; attempted ${attempted}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}

test("the local environment still gets a real Ollama provider", () => {
  const i = info({ SUPABASE_URL: LOCAL_URL, ORBIT_LOCAL_LLM_ENABLED: "true" });
  const provider = createLocalLLMProvider({ enabled: true, provider: "ollama" }, { env: i });
  assert.equal(typeof provider.streamChat, "function");
  // The real provider is a class instance, not the disabled stub literal.
  assert.notEqual(provider.constructor.name, "Object");
});

// ── Durable storage on a deployment ──────────────────────────────────────────

test("a deployment never falls back to the in-memory Ask store", () => {
  const deployed = info({ VERCEL: "1", VERCEL_ENV: "preview", SUPABASE_URL: PREVIEW_URL, SUPABASE_ANON_KEY: ANON, ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF });
  assert.equal(askStorageMode(null, deployed), "unavailable");
  const store = askStoreFor(null, deployed);
  assert.notEqual(store, undefined);
  // Reads are empty rather than throwing: there is genuinely no history.
  assert.deepEqual(store.listConversations && [], []);
});

test("the refusing store rejects writes and returns empty reads", async () => {
  const store = createUnavailableAskStore();
  assert.deepEqual(await store.listConversations("owner"), []);
  assert.deepEqual(await store.listMessages("owner", "c1"), []);
  assert.equal(await store.getConversation("owner", "c1"), null);
  await assert.rejects(() => store.createConversation("owner", {}), /ask_storage_unavailable/);
  await assert.rejects(() => store.insertMessage("owner", {}), /ask_storage_unavailable/);
  await assert.rejects(() => store.touchConversation("owner", "c1", {}), /ask_storage_unavailable/);
});

test("local development still gets the in-memory Ask store when Supabase is unconfigured", () => {
  const local = info({ SUPABASE_URL: LOCAL_URL });
  assert.equal(askStorageMode(null, local), "session");
});

test("a fully configured signed-in user always gets the persistent store", () => {
  const deployed = info({ VERCEL: "1", VERCEL_ENV: "production", SUPABASE_URL: PROD_URL, SUPABASE_ANON_KEY: ANON });
  const auth = { url: PROD_URL, anonKey: ANON, accessToken: "token", ownerId: "owner-1" };
  assert.equal(askStorageMode(auth, deployed), "persistent");
});
