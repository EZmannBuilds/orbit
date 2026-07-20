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
    if (!existsSync(full) || !statSync(full).isFile()) {
      problems.push(`public/index.html references ${clean}, which does not exist in public/.`);
    } else {
      assetCount += 1;
    }
  }
  notes.push(`${assetCount} referenced static asset(s) resolved from public/.`);
}

// ── 3. Things that must NOT be shipped ──────────────────────────────────────
// .env.local is excluded by .gitignore and .vercelignore. This is a last check
// that the exclusion is actually configured, not a check of the upload itself.
const vercelIgnore = join(REPO_ROOT, ".vercelignore");
if (!existsSync(vercelIgnore)) {
  problems.push("Missing .vercelignore — private notes and local Supabase state could be uploaded.");
} else {
  const ignored = readFileSync(vercelIgnore, "utf8");
  for (const required of ["07 Orbit App/", "supabase/", "test/", ".env.local"]) {
    if (!ignored.split("\n").some((line) => line.trim() === required)) {
      problems.push(`.vercelignore does not exclude ${required}`);
    }
  }
  notes.push(".vercelignore excludes the vault, local Supabase state, tests, and env files.");
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
