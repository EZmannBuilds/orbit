// Orbit :: real `vercel build` output inspection (Update 4.0.4.2).
//
// These assert against an ACTUAL build, not a model. That distinction is the
// reason this file exists: lib/deploy/bundle.js modelled the upload from
// .vercelignore and concluded the macOS executable was excluded, while the real
// build packaged it into the function anyway. Vercel assembles a function from
// file tracing plus `includeFiles`; neither consults .vercelignore, and only
// `excludeFiles` removes a traced file.
//
// Tests that need a build skip cleanly when none exists, so a fresh clone and
// CI stay green. They do NOT silently pass — a skip is visible, and
// `npm run deploy:check` reports the missing build separately.

import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  inspectVercelOutput, outputExists, architectureWarning,
  REQUIRED_IN_FUNCTION, FORBIDDEN_IN_FUNCTION, FUNCTION_DIR,
} from "../lib/deploy/vercel-output.js";
import { runtimeManifest } from "../lib/astro/runtime/resolve.js";
import { readVercelConfig } from "../lib/deploy/bundle.js";
import { REPO_ROOT } from "../lib/local-llm/config.js";

const built = outputExists(REPO_ROOT);
const inspection = inspectVercelOutput(REPO_ROOT);
const NEEDS_BUILD = "requires `npx vercel build` output; run it to exercise this test";

// ── configuration that makes a correct bundle possible ──────────────────────
// These run with or without a build, because they are about intent.

test("vercel.json force-includes the runtime and ephemeris data", () => {
  const fn = readVercelConfig(REPO_ROOT).functions["api/index.js"];
  assert.ok(fn.includeFiles, "includeFiles is required — these files are opened by path, not imported");
  for (const needle of ["ephemeris", "src", "bin/linux-x64"]) {
    assert.ok(fn.includeFiles.includes(needle), `includeFiles should cover ${needle}`);
  }
});

test("vercel.json excludes the macOS executable from the function", () => {
  const fn = readVercelConfig(REPO_ROOT).functions["api/index.js"];
  assert.ok(fn.excludeFiles, "excludeFiles is required: .vercelignore does NOT affect function contents");
  assert.match(fn.excludeFiles, /darwin-arm64/,
    "the macOS binary is reachable by file tracing and must be excluded explicitly");
});

test("includeFiles does not sweep in the macOS binary", () => {
  const fn = readVercelConfig(REPO_ROOT).functions["api/index.js"];
  assert.doesNotMatch(fn.includeFiles, /^vendor\/orbit-axis-engine\/\*\*$/,
    "a blanket vendor/** would force-include the macOS executable");
});

test("the required-file list covers the whole runtime, not just the executable", () => {
  // A function with the binary but no .se1 data would fail on first calculation,
  // and a function without manifest.json cannot even resolve a runtime.
  for (const required of [
    "vendor/orbit-axis-engine/bin/linux-x64/swetest",
    "vendor/orbit-axis-engine/src/adapters/swiss-ephemeris/manifest.json",
    "vendor/orbit-axis-engine/ephemeris/seas_18.se1",
    "vendor/orbit-axis-engine/ephemeris/semo_18.se1",
    "vendor/orbit-axis-engine/ephemeris/sepl_18.se1",
  ]) {
    assert.ok(REQUIRED_IN_FUNCTION.includes(required), `${required} must be required in the function`);
  }
});

test("the forbidden-file list covers project metadata and the macOS binary", () => {
  const cases = [
    ".vercel/project.json",
    "vendor/orbit-axis-engine/bin/darwin-arm64/swetest",
    ".env.local",
    "07 Orbit App/Updates/Something.md",
    "supabase/config.toml",
    "test/astro.test.js",
  ];
  for (const path of cases) {
    assert.ok(FORBIDDEN_IN_FUNCTION.some((r) => r.pattern.test(path)),
      `${path} should be forbidden inside a function bundle`);
  }
});

// ── the real build ──────────────────────────────────────────────────────────

test("a real Vercel build output exists", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.equal(inspection.built, true);
  assert.ok(existsSync(join(REPO_ROOT, FUNCTION_DIR)), "the api/index.func function should exist");
});

test("the built function reaches every required runtime file", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.deepEqual(inspection.missing, [],
    "these files are opened by path and are invisible to import tracing — check includeFiles");
});

test("the built function contains nothing forbidden", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.deepEqual(inspection.forbidden, []);
});

test("the macOS executable is not in the built function", { skip: built ? false : NEEDS_BUILD }, () => {
  // The exact regression: it WAS present until excludeFiles was added.
  const macBinary = join(REPO_ROOT, FUNCTION_DIR, "vendor/orbit-axis-engine/bin/darwin-arm64/swetest");
  assert.equal(existsSync(macBinary), false,
    "a Mach-O executable cannot run on a Linux function and must not ship");
});

test("the linux-x64 executable in the built function matches its recorded checksum",
  { skip: built ? false : NEEDS_BUILD }, async () => {
    const { createHash } = await import("node:crypto");
    const path = join(REPO_ROOT, FUNCTION_DIR, "vendor/orbit-axis-engine/bin/linux-x64/swetest");
    assert.ok(existsSync(path), "the Linux executable must be physically present in the function");
    const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
    assert.equal(digest, runtimeManifest().runtimes["linux-x64"].sha256,
      "the bundled executable must be the artifact recorded in the manifest");
  });

test("the built function targets a Node runtime Orbit supports", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.match(String(inspection.runtime), /^nodejs22\./,
    "package.json pins engines.node to 22.x, which must win over any dashboard setting");
});

test("static output is present and complete", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.ok(inspection.staticCount > 0, "static files must be emitted");
  const html = join(REPO_ROOT, ".vercel/output/static/index.html");
  assert.ok(existsSync(html), "the frontend document must be in static output");
  // Byte-identical to source: Orbit has no bundler, so the build must not
  // transform the frontend.
  assert.equal(
    readFileSync(html, "utf8"),
    readFileSync(join(REPO_ROOT, "public/index.html"), "utf8"),
    "static output should be a faithful copy of public/",
  );
});

test("no source map is emitted into the output", { skip: built ? false : NEEDS_BUILD }, () => {
  assert.ok(!inspection.forbidden.some((f) => f.path.endsWith(".map")));
});

// ── architecture guard ──────────────────────────────────────────────────────

test("a non-x86_64 build output is flagged as unsafe to deploy prebuilt", () => {
  // Building on Apple Silicon records architecture arm64. That output must
  // never ship with --prebuilt alongside a linux-x64 executable.
  const warning = architectureWarning({ built: true, architecture: "arm64" });
  assert.ok(warning, "an arm64 build should produce a warning");
  assert.match(warning, /--prebuilt/);
  assert.equal(architectureWarning({ built: true, architecture: "x86_64" }), null,
    "an x86_64 build needs no warning");
  assert.equal(architectureWarning({ built: false }), null, "no build, no warning");
});

// ── the model's known limitation is documented, not silently wrong ──────────

test("the bundle model documents that it does not govern function contents", () => {
  const source = readFileSync(join(REPO_ROOT, "lib/deploy/bundle.js"), "utf8");
  assert.match(source, /does NOT model what ends up inside the function bundle|LIMITATION/i,
    "the model must state that .vercelignore does not control function contents");
  assert.match(source, /vercel-output\.js/,
    "the model should point at the module that reads the real build");
});
