// Orbit :: deployed-runtime behaviour (Update 4.0.4).
//
// Simulated Vercel Preview and Production, focused on the questions Update
// 4.0.4 exists to answer:
//
//   - does a deployment resolve a runtime it can actually execute?
//   - does a calculation failure ever turn into invented astrology?
//   - does Ask Orbit still refuse to produce evidence it did not calculate?
//
// Update 4.0.3 already proved that a deployment never calls Ollama and never
// accepts a localhost database; those properties are re-asserted here because
// they are load-bearing for everything below, and a regression in either would
// invalidate the rest.
//
// Nothing here contacts a network, a database, or a model.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveEnvironment } from "../lib/env/environment.js";
import { assertStartupSafe, EnvironmentSafetyError } from "../lib/env/guard.js";
import { PRODUCTION_PROJECT_REF } from "../lib/env/known-targets.js";
import { createLocalLLMProvider } from "../lib/local-llm/provider.js";
import { resolveRuntime, runtimeManifest, OrbitRuntimeError } from "../lib/astro/runtime/resolve.js";
import { customerSafeMessage, OrbitCalculationError } from "../lib/astro/runtime/exec.js";
import { buildAskContext } from "../lib/ask-orbit/context-engine.js";
import { presentAnswer } from "../lib/ask-orbit/presenter.js";

const LOCAL_URL = "http://127.0.0.1:55321";
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const PREVIEW_REF = "previewprojectref0123";
const PREVIEW_URL = `https://${PREVIEW_REF}.supabase.co`;
const ANON = "anon-key-placeholder";

const info = (over = {}) => resolveEnvironment({ env: { ...over }, loadEnvFiles: false });

const deployed = (vercelEnv) => info({
  VERCEL: "1", VERCEL_ENV: vercelEnv,
  SUPABASE_URL: vercelEnv === "preview" ? PREVIEW_URL : PROD_URL,
  SUPABASE_ANON_KEY: ANON,
  ORBIT_PREVIEW_PROJECT_REFS: PREVIEW_REF,
});

function caught(fn) {
  try { fn(); } catch (error) { return error; }
  return null;
}

// ── the runtime a deployment would use ──────────────────────────────────────

for (const vercelEnv of ["preview", "production"]) {
  test(`simulated Vercel ${vercelEnv} resolves a Linux-compatible runtime`, () => {
    const env = deployed(vercelEnv);
    assert.equal(env.isDeployed, true);

    // Vercel functions are Linux x64. Resolve for that target explicitly rather
    // than for whatever host happens to run this test.
    const runtime = resolveRuntime({ platform: "linux", arch: "x64", verifyChecksum: true });
    assert.equal(runtime.ok, true, runtime.detail);
    assert.equal(runtime.key, "linux-x64");
    assert.match(runtime.executable, /bin\/linux-x64\/swetest$/);
    assert.equal(runtime.checksumVerified, true);
  });

  test(`simulated Vercel ${vercelEnv} would never select the macOS executable`, () => {
    const runtime = resolveRuntime({ platform: "linux", arch: "x64" });
    assert.doesNotMatch(runtime.executable, /darwin/, "a Linux function must not be handed a macOS binary");
  });

  test(`simulated Vercel ${vercelEnv} does not call local Ollama`, async () => {
    const env = deployed(vercelEnv);
    const realFetch = globalThis.fetch;
    let attempted = null;
    globalThis.fetch = (url) => { attempted = String(url); throw new Error("network attempted"); };
    try {
      const provider = createLocalLLMProvider({ enabled: true }, { env });
      const health = await provider.health();
      assert.equal(health.reachable, false);
      assert.equal(health.disabled, true);
      assert.equal(attempted, null, `no network call may be attempted; tried ${attempted}`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test(`simulated Vercel ${vercelEnv} rejects a localhost Supabase URL`, () => {
    const env = info({ VERCEL: "1", VERCEL_ENV: vercelEnv, SUPABASE_URL: LOCAL_URL, SUPABASE_ANON_KEY: ANON });
    const err = caught(() => assertStartupSafe(env));
    assert.ok(err instanceof EnvironmentSafetyError);
    assert.equal(err.code, "vercel_points_at_localhost");
  });
}

test("the linux-x64 runtime declared for deployment is statically linked", () => {
  // A dynamically linked binary could fail on a host with a different glibc.
  // Static linkage is why this one ran on busybox, which ships no glibc at all.
  assert.equal(runtimeManifest().runtimes["linux-x64"].linkage, "static");
});

// ── a failed calculation must never become invented astrology ───────────────

test("an unavailable runtime yields an error, never an empty-but-plausible chart", () => {
  const r = resolveRuntime({ platform: "linux", arch: "x64", manifest: { ...runtimeManifest(), runtimes: {} } });
  assert.equal(r.ok, false);
  assert.equal(r.executable, null, "no executable may be offered when none is supported");
  assert.equal(r.code, "unsupported_platform");
});

test("a calculation failure produces a customer-safe message with no fabricated data", () => {
  for (const code of ["runtime_missing", "runtime_wrong_platform", "timeout", "invalid_output", "nonzero_exit"]) {
    const message = customerSafeMessage({ code });
    // It must read as a failure, not as a reading.
    assert.doesNotMatch(message, /sun|moon|rising|ascendant|degree|sign|house|transit/i,
      `${code} message must not resemble astrology: ${message}`);
    assert.doesNotMatch(message, /\//, `${code} message must not contain a path`);
  }
});

test("Ask Orbit produces no evidence when there is no chart to calculate from", () => {
  // The failure mode that matters: a chart that could not be computed must
  // leave Ask Orbit with nothing to assert, not with plausible filler.
  const ctx = buildAskContext({
    active: null,
    sky: null,
    detailMode: "Simple",
    question: "What should I pay attention to today?",
  });
  assert.deepEqual(ctx.evidence, [], "no chart means no evidence");
  assert.equal(ctx.activeChartId, null);
});

// An evidence row is either something Orbit CALCULATED, or a "limitation" row
// explaining what it could not use. The second kind is a disclosure, not a
// claim, and it is exactly what should appear when a calculation is missing.
// The invariant worth defending is therefore narrower and stronger than "no
// evidence at all": no ASTROLOGICAL evidence without a calculation behind it.
const isAstrologicalClaim = (item) => !String(item.type || "").startsWith("limitation:");

test("the presenter makes no astrological claim when nothing was calculated", () => {
  const ctx = buildAskContext({ active: null, sky: null, question: "How is my Venus?" });
  const rendered = presentAnswer(ctx, null);

  const claims = (rendered.evidence || []).filter(isAstrologicalClaim);
  assert.deepEqual(claims, [], "no placement, aspect, house, or transit may be asserted without a calculation");

  // It may still speak — but only to say it has nothing solid to stand on.
  assert.ok(typeof rendered.answer?.direct === "string" && rendered.answer.direct.length > 0);
  assert.doesNotMatch(rendered.answer.direct, /\b\d+°|\b\d+ degrees\b/,
    "an answer without a calculation must not quote degrees");
});

test("limitation rows are shown instead of claims, and are labelled as limitations", () => {
  const ctx = buildAskContext({ active: null, sky: null, question: "What is my rising sign?" });
  const rendered = presentAnswer(ctx, null);
  const rows = rendered.evidence || [];

  assert.ok(rows.length > 0, "the user should be told why there is nothing to show");
  for (const row of rows) {
    assert.match(row.type, /^limitation:/, `every row must be a limitation, got type "${row.type}"`);
    assert.equal(row.relevance, null, "a limitation carries no relevance score — it is not ranked evidence");
    assert.equal(row.interpretationKey, null, "a limitation maps to no interpretation");
  }
});

test("deterministic prose is a wording fallback, not a calculation fallback", () => {
  // Update 4.0.3 made the local model optional and the deterministic presenter
  // authoritative for WORDING. That must never be read as permission to
  // substitute prose for astronomy that failed to compute.
  const withoutChart = buildAskContext({ active: null, sky: null, question: "What is my rising sign?" });
  assert.equal(withoutChart.evidence.length, 0, "the context engine calculated nothing");
  const rendered = presentAnswer(withoutChart, null);
  assert.equal((rendered.evidence || []).filter(isAstrologicalClaim).length, 0,
    "prose generated without calculated evidence must not carry astrological evidence");
});

// ── runtime errors are distinguishable from calculation errors ──────────────

test("runtime unavailability and calculation failure are different error types", () => {
  const runtimeError = new OrbitRuntimeError("x", { code: "runtime_missing" });
  const calcError = new OrbitCalculationError("y", { code: "nonzero_exit" });
  assert.ok(runtimeError instanceof OrbitRuntimeError);
  assert.ok(calcError instanceof OrbitCalculationError);
  assert.ok(!(calcError instanceof OrbitRuntimeError),
    "these need different handling: one is a deployment defect, the other is usually bad input");
});
