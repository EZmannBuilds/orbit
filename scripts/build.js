#!/usr/bin/env node
// Orbit Axis :: production build (Update 4.0.3).
//
// Orbit ships no bundler: the frontend is hand-written ES modules and CSS that
// browsers load directly, and the backend is zero-dependency Node. So "build"
// here means VERIFY, not TRANSFORM — there is nothing to compile, and inventing
// a compile step would add a failure mode without adding a capability.
//
// This runs on Vercel as the Build Command, which means it must be safe in an
// environment with no Docker, no local Supabase, no Ollama, and no secrets:
//
//   - it contacts no database and makes no network request
//   - it runs no migration and creates no user
//   - it starts no server and binds no port
//   - it reads no .env.local value (only checks presence for the local report)
//
// It fails loudly when something genuinely required to serve the app is
// missing, so a broken deploy is caught at build time rather than by a visitor.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../lib/local-llm/config.js";
import { runtimeManifest, checkEphemerisData, sha256File, ENGINE_ROOT } from "../lib/astro/runtime/resolve.js";
import { modelBundle } from "../lib/deploy/bundle.js";

const problems = [];
const notes = [];

function requireFile(relative, why) {
  const full = join(REPO_ROOT, relative);
  if (!existsSync(full) || !statSync(full).isFile()) {
    problems.push(`Missing ${relative} — ${why}`);
    return null;
  }
  return full;
}

console.log("Orbit Axis production build");
console.log("");

// ── 1. Backend entry points ─────────────────────────────────────────────────
requireFile("server.js", "the local development entry point.");
requireFile("api/index.js", "the Vercel function entry point.");
requireFile("lib/server/create-app.js", "the shared request handler.");
requireFile("vercel.json", "Vercel routing configuration.");

// ── 2. Frontend document and every asset it references ──────────────────────
// The frontend is served straight from public/, so a stylesheet or module that
// the document references but that does not exist is a real, user-visible break
// (a 404 on a <script type="module"> silently disables part of the app). The
// build resolves every same-origin src/href in index.html against public/.
const indexPath = requireFile("public/index.html", "the frontend document.");
let assetCount = 0;
if (indexPath) {
  const html = readFileSync(indexPath, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const localRefs = refs.filter((ref) =>
    ref.startsWith("/") && !ref.startsWith("//"));
  for (const ref of new Set(localRefs)) {
    const clean = ref.split("?")[0].split("#")[0];
    const full = join(REPO_ROOT, "public", clean);
    // vercel.json sets cleanUrls, so /privacy is served by public/privacy.html
    // and the local static server resolves it the same way. A reference without
    // an extension is satisfied by the .html file behind it — otherwise this
    // check would reject the public URLs it is meant to protect.
    const resolved = (existsSync(full) && statSync(full).isFile())
      ? full
      : (existsSync(`${full}.html`) && statSync(`${full}.html`).isFile() ? `${full}.html` : null);
    if (!resolved) {
      problems.push(`public/index.html references ${clean}, which does not exist in public/.`);
    } else {
      assetCount += 1;
    }
  }
  notes.push(`${assetCount} referenced static asset(s) resolved from public/.`);
}

// ── 3. The astronomy runtime this build will ship ───────────────────────────
// Added in 4.0.4. A build that omits the Linux executable or the .se1 data
// would deploy an app whose every astrology feature fails at runtime, so it is
// a build failure, not a warning. Checked without executing anything: the
// binary for the deployment target is not runnable on the build machine.
const runtime = runtimeManifest();
notes.push(`Swiss Ephemeris ${runtime.swissEphemerisVersion}; declared runtimes: ${Object.keys(runtime.runtimes).join(", ")}.`);
// The runtime that will actually SHIP is the only one whose absence breaks a
// deployment. On Vercel's Linux builders the macOS binary is deliberately not
// uploaded (.vercelignore excludes it), so requiring every declared runtime to
// be present made a correct exclusion look like a broken build — which is
// exactly how this failed the first real Preview deploy. Local builds still
// require the binary for the machine they are running on, because there its
// absence really does mean astrology is broken.
const DEPLOY_TARGET_RUNTIME = "linux-x64";
const buildPlatformRuntime = `${process.platform}-${process.arch}`;

for (const [key, entry] of Object.entries(runtime.runtimes)) {
  if (!entry.supported) continue;
  // Update 5.0: the runtime lives in the vendored Orbit Axis Engine, so paths
  // resolve from the engine root rather than the application's lib/astro.
  const path = join(ENGINE_ROOT, entry.executable);
  const required = key === DEPLOY_TARGET_RUNTIME || key === buildPlatformRuntime;
  if (!existsSync(path) && !required) {
    notes.push(`${key} Swiss Ephemeris executable is not present on this build machine — expected when building for another platform.`);
    continue;
  }
  if (!existsSync(path)) {
    problems.push(`The ${key} Swiss Ephemeris executable (${entry.executable}) is missing in the vendored engine.`);
  } else if (sha256File(path) !== entry.sha256) {
    problems.push(`The ${key} Swiss Ephemeris executable does not match its recorded checksum.`);
  }
}
const data = checkEphemerisData(runtime, { verifyChecksums: true });
if (!data.ok) problems.push(`Ephemeris data problem: ${data.detail}`);
else notes.push(`${Object.keys(runtime.dataFiles).length} ephemeris data file(s) present and matching their checksums.`);

// ── 4. What would actually ship, and what must never ship ───────────────────
// Modelled from .vercelignore + vercel.json rather than guessed. See
// lib/deploy/bundle.js for why this is a model and what it does not cover.
const bundle = modelBundle(REPO_ROOT);
if (!existsSync(join(REPO_ROOT, ".vercelignore"))) {
  problems.push("Missing .vercelignore — private notes and local Supabase state could be uploaded.");
}
for (const missing of bundle.missing) {
  problems.push(`${missing} would NOT be included in the deployed function.`);
}
for (const leak of bundle.leaked) {
  problems.push(`${leak.path} would be uploaded to Vercel — ${leak.why}.`);
}
if (bundle.ok) {
  notes.push(`Deployment bundle models ${bundle.uploadedCount} file(s), ${(bundle.uploadedBytes / 1048576).toFixed(1)} MB; every required runtime file is included and nothing forbidden leaks.`);
  notes.push(`Force-included by vercel.json includeFiles (${bundle.includePatterns.join(", ")}): ${bundle.forceIncluded.length} file(s), including the linux-x64 executable and the .se1 data.`);
}

// ── 4. Syntax check every shipped module ────────────────────────────────────
// `npm run lint` is `node --check` over the whole codebase. Running it from
// here keeps one build entry point rather than a chain of npm scripts.
const { spawnSync } = await import("node:child_process");
const lint = spawnSync("npm", ["run", "--silent", "lint"], { stdio: "inherit", cwd: REPO_ROOT });
if (lint.status !== 0) problems.push("Syntax check failed (npm run lint).");
else notes.push("Syntax check passed for every shipped module.");

// ── Report ──────────────────────────────────────────────────────────────────
for (const note of notes) console.log(`  ok    ${note}`);
if (problems.length) {
  console.error("");
  console.error("BUILD FAILED");
  console.error("");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}
console.log("");
console.log("Build OK — Orbit is ready to be served as static files plus one Node function.");
