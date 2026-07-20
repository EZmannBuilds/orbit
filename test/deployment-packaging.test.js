// Orbit :: deployment packaging (Update 4.0.4).
//
// Update 4.0.3 shipped a Vercel configuration that would have deployed an app
// whose astronomy engine was not in the bundle. Vercel's Node builder traces
// `import` statements, and the Swiss Ephemeris executable and `.se1` data are
// opened by PATH, not imported — so tracing misses them entirely and they only
// ship because vercel.json force-includes them.
//
// These tests hold that arrangement in place, and hold the other direction too:
// nothing private (env files, the vault mirror, local Supabase state, tests,
// the macOS binary) may reach a deployment.
//
// This asserts against lib/deploy/bundle.js, which models the upload from the
// real .vercelignore and vercel.json rather than guessing. It is not a
// substitute for `npx vercel build` — that remains unverified until the owner
// links the project — but it is checkable today and it fails loudly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  modelBundle, readVercelConfig, readVercelIgnore, isIgnored,
  includeMatcher, REQUIRED_IN_BUNDLE, FORBIDDEN_IN_BUNDLE,
} from "../lib/deploy/bundle.js";
import { runtimeManifest } from "../lib/astro/runtime/resolve.js";
import { REPO_ROOT } from "../lib/local-llm/config.js";

const bundle = modelBundle(REPO_ROOT);
const config = readVercelConfig(REPO_ROOT);
const shipped = new Set(bundle.uploaded.map((f) => f.path));

// ── what must be there ──────────────────────────────────────────────────────

test("the deployment bundle is valid: nothing required missing, nothing forbidden present", () => {
  assert.deepEqual(bundle.missing, [], "required files missing from the bundle");
  assert.deepEqual(bundle.leaked, [], "forbidden files would be uploaded");
  assert.equal(bundle.ok, true);
});

test("the linux-x64 Swiss Ephemeris executable ships", () => {
  const entry = runtimeManifest().runtimes["linux-x64"];
  const path = `lib/astro/${entry.executable}`;
  assert.ok(shipped.has(path), `${path} must be uploaded`);
  assert.ok(bundle.forceIncluded.includes(path),
    "it must be force-included by vercel.json — import tracing cannot see a file opened by path");
});

test("every ephemeris data file ships", () => {
  const manifest = runtimeManifest();
  for (const name of Object.keys(manifest.dataFiles)) {
    const path = `lib/astro/${manifest.dataDirectory}/${name}`;
    assert.ok(shipped.has(path), `${path} must be uploaded`);
    assert.ok(bundle.forceIncluded.includes(path), `${path} must be force-included`);
  }
});

test("the runtime manifest ships", () => {
  assert.ok(shipped.has("lib/astro/runtime/manifest.json"));
  assert.ok(bundle.forceIncluded.includes("lib/astro/runtime/manifest.json"),
    "the manifest is read with readFileSync, so tracing would miss it");
});

test("the resolver and execution modules ship", () => {
  for (const path of ["lib/astro/runtime/resolve.js", "lib/astro/runtime/exec.js", "lib/astro/ephemeris.js"]) {
    assert.ok(shipped.has(path), `${path} must be uploaded`);
  }
});

test("the function entry point and shared handler ship", () => {
  assert.ok(shipped.has("api/index.js"));
  assert.ok(shipped.has("lib/server/create-app.js"));
});

test("the static frontend ships", () => {
  assert.ok(shipped.has("public/index.html"));
  assert.ok(shipped.has("public/app.js"));
  const css = [...shipped].filter((p) => p.startsWith("public/styles/"));
  assert.ok(css.length > 0, "stylesheets must ship");
});

test("every file REQUIRED_IN_BUNDLE declares is genuinely present", () => {
  for (const path of REQUIRED_IN_BUNDLE) {
    assert.ok(shipped.has(path), `${path} is declared required but is not in the bundle`);
  }
});

// ── what must NOT be there ──────────────────────────────────────────────────

test("no environment file of any kind ships", () => {
  for (const path of shipped) {
    assert.doesNotMatch(path, /(^|\/)\.env($|\.)/, `${path} must not be uploaded`);
  }
});

test("the Obsidian vault mirror does not ship", () => {
  for (const path of shipped) {
    assert.ok(!path.startsWith("07 Orbit App/"), `${path} is private project documentation`);
  }
});

test("local Supabase config, migrations, and CLI state do not ship", () => {
  for (const path of shipped) {
    assert.ok(!path.startsWith("supabase/"), `${path} must not be uploaded`);
  }
});

test("tests and fixtures do not ship", () => {
  for (const path of shipped) {
    assert.ok(!path.startsWith("test/"), `${path} must not be uploaded`);
  }
});

test("the macOS executable does not ship to a Linux function", () => {
  for (const path of shipped) {
    assert.ok(!path.startsWith("lib/astro/bin/darwin-arm64/"),
      `${path} cannot run on Vercel and must not be uploaded`);
  }
});

test("no source archive or build debris ships", () => {
  for (const path of shipped) {
    assert.doesNotMatch(path, /\.(tar\.gz|tgz|zip|o|a|so|dylib)$/, `${path} looks like build debris`);
  }
});

test("no private local state ships", () => {
  for (const path of shipped) {
    for (const rule of FORBIDDEN_IN_BUNDLE) {
      assert.doesNotMatch(path, rule.pattern, `${path} — ${rule.why}`);
    }
  }
});

// ── browser assets carry no server-only values ──────────────────────────────

test("no server-only credential name or value appears in a browser asset", () => {
  const browserFiles = [...shipped].filter((p) => p.startsWith("public/"));
  assert.ok(browserFiles.length > 0);
  for (const rel of browserFiles) {
    const text = readFileSync(join(REPO_ROOT, rel), "utf8");
    for (const forbidden of [
      "SUPABASE_SERVICE_ROLE_KEY", "service_role", "sb_secret_",
      "SUPABASE_ACCESS_TOKEN", "GEOAPIFY_API_KEY", "ORBIT_PREVIEW_PROJECT_REFS",
    ]) {
      assert.ok(!text.includes(forbidden), `${rel} references the server-only name ${forbidden}`);
    }
    // A JWT-shaped literal in a browser asset would mean a key got inlined.
    assert.doesNotMatch(text, /eyJhbGciOi[A-Za-z0-9_-]{10,}/, `${rel} contains a JWT-shaped literal`);
  }
});

test("Orbit has no bundler, so no source map can leak server configuration", () => {
  for (const path of shipped) {
    assert.doesNotMatch(path, /\.map$/, `${path}: no source maps are expected in this project`);
  }
});

// ── the configuration that makes this work ──────────────────────────────────

test("vercel.json force-includes exactly the subtrees the function needs", () => {
  const matcher = includeMatcher(config);
  assert.ok(matcher.patterns.length > 0, "vercel.json must declare includeFiles");
  assert.ok(matcher.test("lib/astro/bin/linux-x64/swetest"), "the Linux executable must match includeFiles");
  assert.ok(matcher.test("lib/astro/ephe/sepl_18.se1"), "ephemeris data must match includeFiles");
  assert.ok(matcher.test("lib/astro/runtime/manifest.json"), "the runtime manifest must match includeFiles");
  // Update 4.0.4.2: a blanket lib/astro/** also force-included the macOS
  // executable, which then shipped inside the Linux function.
  assert.equal(matcher.test("lib/astro/bin/darwin-arm64/swetest"), false,
    "includeFiles must not force-include the macOS executable");
});

test("vercel.json still targets the Other preset with static output from public/", () => {
  assert.equal(config.framework, null, 'framework must be null ("Other")');
  assert.equal(config.outputDirectory, "public");
  assert.equal(config.installCommand, "npm ci");
});

test("vercel.json contains no hardcoded deployment URL and no secret", () => {
  const raw = readFileSync(join(REPO_ROOT, "vercel.json"), "utf8");
  assert.doesNotMatch(raw, /https?:\/\/(?!openapi\.vercel\.sh)/, "no hardcoded URL");
  assert.doesNotMatch(raw, /eyJhbGciOi|sb_secret_|service_role/, "no secret material");
});

test(".vercelignore excludes every private area", () => {
  const rules = readVercelIgnore(REPO_ROOT);
  for (const path of [
    "07 Orbit App/Updates/Anything.md",
    "supabase/config.toml",
    "test/astro.test.js",
    ".env.local",
    ".env.production.example",
    "lib/astro/bin/darwin-arm64/swetest",
    "docs/deployment/vercel.md",
    ".claude/settings.json",
  ]) {
    assert.ok(isIgnored(path, rules), `${path} should be excluded by .vercelignore`);
  }
});

test(".vercelignore does NOT exclude anything the function needs", () => {
  const rules = readVercelIgnore(REPO_ROOT);
  for (const path of REQUIRED_IN_BUNDLE) {
    assert.ok(!isIgnored(path, rules), `${path} must not be excluded — the function needs it`);
  }
});

test("the modelled bundle stays small enough to be worth reviewing", () => {
  // Not a platform limit — a tripwire. A sudden jump means something large and
  // probably private started shipping.
  const mb = bundle.uploadedBytes / 1048576;
  assert.ok(mb < 25, `the bundle models ${mb.toFixed(1)} MB, which is unexpectedly large`);
});
