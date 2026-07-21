// Orbit :: inspection of a real `vercel build` output (Update 4.0.4.2).
//
// lib/deploy/bundle.js MODELS what would ship, from .vercelignore and
// vercel.json. This module reads what a build ACTUALLY produced. Both exist
// because the first one was wrong in a way only the second could reveal:
//
//   The model applied .vercelignore and concluded the macOS executable was
//   excluded. The real build included it anyway — Vercel's function bundle is
//   assembled by file tracing plus `includeFiles`, and NEITHER consults
//   .vercelignore. A 836 KB Mach-O binary was being packaged into a Linux
//   function. Only `excludeFiles` removed it.
//
// So: .vercelignore governs what is UPLOADED; includeFiles/excludeFiles and
// tracing govern what lands INSIDE the function. Those are different questions
// and this module answers the second one from evidence.
//
// Everything here is read-only and reads only non-secret fields.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { REPO_ROOT } from "../local-llm/config.js";

export const OUTPUT_DIR = ".vercel/output";
export const FUNCTION_DIR = ".vercel/output/functions/api/index.func";

// Must be reachable by the deployed function, either physically present in the
// bundle or resolved through the config's filePathMap.
export const REQUIRED_IN_FUNCTION = Object.freeze([
  "api/index.js",
  "lib/server/create-app.js",
  "lib/astro/ephemeris.js",
  "vendor/orbit-axis-engine/src/index.js",
  "vendor/orbit-axis-engine/src/adapters/swiss-ephemeris/paths.js",
  "vendor/orbit-axis-engine/src/adapters/swiss-ephemeris/exec.js",
  "vendor/orbit-axis-engine/src/adapters/swiss-ephemeris/manifest.json",
  "vendor/orbit-axis-engine/bin/linux-x64/swetest",
  "vendor/orbit-axis-engine/ephemeris/seas_18.se1",
  "vendor/orbit-axis-engine/ephemeris/semo_18.se1",
  "vendor/orbit-axis-engine/ephemeris/sepl_18.se1",
]);

// Must never be inside a deployed function.
export const FORBIDDEN_IN_FUNCTION = Object.freeze([
  { pattern: /(^|\/)\.env($|\.)/, why: "an environment file" },
  { pattern: /(^|\/)project\.json$/, why: "Vercel project link metadata (account-private ids)" },
  { pattern: /bin\/darwin-arm64\//, why: "a macOS executable cannot run on a Linux function" },
  { pattern: /^07 Orbit App\//, why: "private Obsidian vault notes" },
  { pattern: /^supabase\//, why: "local Supabase config and migrations" },
  { pattern: /^test\//, why: "tests and fixtures" },
  { pattern: /^docs\//, why: "internal documentation" },
  { pattern: /(^|\/)\.git(\/|$)/, why: "git metadata" },
  { pattern: /\.map$/, why: "a source map" },
]);

function walk(dir, base, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push({ path: relative(base, full).split(sep).join("/"), bytes: st.size });
  }
  return out;
}

export function outputExists(root = REPO_ROOT) {
  return existsSync(join(root, OUTPUT_DIR, "config.json"));
}

// Inspect a real build output. Returns { ok: false, reason } when none exists,
// so callers can distinguish "no build yet" from "a bad build".
export function inspectVercelOutput(root = REPO_ROOT) {
  const outputRoot = join(root, OUTPUT_DIR);
  if (!outputExists(root)) {
    return { ok: false, built: false, reason: "no_build_output", detail: "No `vercel build` output exists yet." };
  }

  const funcRoot = join(root, FUNCTION_DIR);
  if (!existsSync(funcRoot)) {
    return { ok: false, built: true, reason: "no_function", detail: "The build produced no api/index.func function." };
  }

  const configPath = join(funcRoot, ".vc-config.json");
  let vcConfig = {};
  try { vcConfig = JSON.parse(readFileSync(configPath, "utf8")); } catch { /* tolerated below */ }

  // Files physically in the bundle, plus files the config promises the deploy
  // step will place there. Both count as "reachable by the function".
  const physical = walk(funcRoot, funcRoot).filter((f) => !f.path.startsWith(".vc-config"));
  const mapped = Object.keys(vcConfig.filePathMap || {});
  const reachable = new Set([...physical.map((f) => f.path), ...mapped]);

  const missing = REQUIRED_IN_FUNCTION.filter((p) => !reachable.has(p));
  const forbidden = [];
  for (const p of reachable) {
    for (const rule of FORBIDDEN_IN_FUNCTION) {
      if (rule.pattern.test(p)) forbidden.push({ path: p, why: rule.why });
    }
  }

  const staticFiles = walk(join(outputRoot, "static"), join(outputRoot, "static"));

  return {
    ok: missing.length === 0 && forbidden.length === 0,
    built: true,
    functionBytes: physical.reduce((n, f) => n + f.bytes, 0),
    physicalCount: physical.length,
    mappedCount: mapped.length,
    staticCount: staticFiles.length,
    missing,
    forbidden,
    // Non-secret build facts worth reporting.
    runtime: vcConfig.runtime ?? null,
    architecture: vcConfig.architecture ?? null,
    maxDuration: vcConfig.maxDuration ?? null,
    handler: vcConfig.handler ?? null,
  };
}

// The built function records the architecture of the machine that built it.
// A locally built arm64 function would only ever ship via `vercel deploy
// --prebuilt`, which Orbit does not use — a normal deploy rebuilds on Vercel's
// own Linux builders. Surfaced because shipping an arm64 function together with
// a linux-x64 executable would fail at runtime, and the mismatch is invisible
// unless something looks for it.
export function architectureWarning(inspection) {
  if (!inspection?.built || !inspection.architecture) return null;
  if (inspection.architecture === "x86_64") return null;
  return `The local build recorded architecture "${inspection.architecture}" because it ran on this machine. `
    + "Orbit ships a linux-x64 Swiss Ephemeris executable, so this output must NOT be deployed with "
    + "`vercel deploy --prebuilt`. A normal deploy rebuilds on Vercel's Linux builders and is unaffected.";
}
