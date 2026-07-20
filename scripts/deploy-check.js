#!/usr/bin/env node
// Orbit Axis :: deployment readiness check (Update 4.0.3).
//
//   npm run deploy:check
//
// Read-only and offline. It does not deploy, push, migrate, create users,
// write to any database, contact production, or print a secret value. It only
// reads local files, resolves configuration, and asks git what it already
// knows. Every finding names what to do about it.
//
// Findings are graded:
//   BLOCKER       — a Preview or Production deploy will not work until fixed.
//   WARNING       — it will deploy, but something important is unverified.
//   INFORMATIONAL — context worth stating, no action required.
//
// Exit code 1 when any BLOCKER is present, so this can gate a workflow.
//
// Deliberate limitation: hosted Supabase is NEVER contacted. Anything about
// the hosted project is therefore reported as unverified rather than guessed.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "../lib/local-llm/config.js";
import { resolveEnvironment, describeTarget } from "../lib/env/environment.js";
import { PRODUCTION_PROJECT_REF, APPROVED_PREVIEW_PROJECT_REFS, configuredPreviewRefs } from "../lib/env/known-targets.js";
import { ephemerisCapability } from "../lib/astro/ephemeris.js";

const findings = [];
const add = (level, area, message, action = null) => findings.push({ level, area, message, action });
const blocker = (...a) => add("BLOCKER", ...a);
const warn = (...a) => add("WARNING", ...a);
const info = (...a) => add("INFORMATIONAL", ...a);

function git(args) {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

// ── 1. Environment and database classification ──────────────────────────────
const env = resolveEnvironment();
info("environment", `Resolved environment: ${env.environment} (from ${env.environmentSource}).`);
info("environment", `Database target: ${describeTarget(env)}.`);
info("environment", env.isVercel
  ? `Running on Vercel (VERCEL_ENV=${env.vercelEnv || "unset"}).`
  : "Not running on Vercel — this is a local readiness check.");

if (!env.environmentValid) {
  blocker("environment", `Environment "${env.environment}" is not one Orbit recognises.`,
    "Set ORBIT_ENVIRONMENT to local, test, preview, or production.");
}

// Simulate the two deployed environments to prove how they would classify,
// without needing a deployment to exist. These are pure resolutions: nothing
// is contacted and no configuration is changed.
const simulated = {
  preview: resolveEnvironment({ overrides: { ORBIT_ENVIRONMENT: "preview", VERCEL: "1", VERCEL_ENV: "preview" } }),
  production: resolveEnvironment({ overrides: { ORBIT_ENVIRONMENT: "production", VERCEL: "1", VERCEL_ENV: "production" } }),
};
for (const [name, sim] of Object.entries(simulated)) {
  if (sim.allowsLocalLanguageProvider) {
    blocker("ollama", `Simulated ${name} still permits the local language provider.`,
      "This is an Orbit bug — a deployment must never be allowed to call Ollama.");
  }
  if (sim.allowsDisposableUsers || sim.allowsDevRoutes || sim.allowsSeedData || sim.allowsLocalMigrations) {
    blocker("safety", `Simulated ${name} still permits a development-only operation.`,
      "This is an Orbit bug — disposable users, seeds, migrations, and dev routes must be off on a deployment.");
  }
  if (!sim.requiresPersistentStorage) {
    blocker("persistence", `Simulated ${name} does not require durable storage.`,
      "This is an Orbit bug — a serverless instance must never treat memory as storage.");
  }
}
info("ollama", "Simulated Preview and Production both disable the Ollama provider before any network call.");
info("persistence", "Simulated Preview and Production both require durable Supabase storage.");

// ── 2. Preview Supabase project ─────────────────────────────────────────────
const approvedPreview = [...APPROVED_PREVIEW_PROJECT_REFS, ...configuredPreviewRefs()];
if (approvedPreview.length === 0) {
  blocker("supabase", "No approved Preview Supabase project exists.",
    "Create a separate, disposable Supabase project for Preview, then add its project reference to "
    + "ORBIT_PREVIEW_PROJECT_REFS (or to APPROVED_PREVIEW_PROJECT_REFS in lib/env/known-targets.js). "
    + "Preview must not share the production database unless you explicitly decide otherwise.");
} else {
  info("supabase", `Approved Preview project reference(s): ${approvedPreview.join(", ")}.`);
}
info("supabase", `Known production project reference: ${PRODUCTION_PROJECT_REF} (public identifier, not a secret).`);

// ── 3. Hosted migration status ──────────────────────────────────────────────
// The hosted project is never contacted, so this reports what exists locally
// and states plainly that the remote side is unverified.
const migrationsDir = join(REPO_ROOT, "supabase", "migrations");
const migrations = existsSync(migrationsDir)
  ? readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
  : [];
info("supabase", `${migrations.length} local migration file(s) found.`);
const askMigration = migrations.find((m) => m.includes("ask_orbit"));
if (askMigration) {
  blocker("supabase", `The Ask Orbit migration (${askMigration}) is not known to be applied to hosted Supabase.`,
    "Ask Orbit conversation history depends on the ask_conversations and ask_messages tables. "
    + "Until the owner applies this migration to the hosted project, Ask Orbit answers will generate "
    + "but will not save. Review docs/deployment/hosted-migration-checklist.md and apply it with explicit approval.");
}
warn("supabase", "Hosted Supabase schema, RLS policies, indexes, and grants are UNVERIFIED.",
  "This check never contacts the hosted project. Verify them from the Supabase dashboard before Production.");

// ── 4. Environment variable names (names only — never values) ───────────────
const REQUIRED_ON_VERCEL = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "ORBIT_ENVIRONMENT"];
const OPTIONAL_ON_VERCEL = ["GEOAPIFY_API_KEY", "ORBIT_PREVIEW_PROJECT_REFS", "ORBIT_ASK_USE_MODEL"];
const LOCAL_ONLY = ["SUPABASE_SERVICE_ROLE_KEY", "ORBIT_OLLAMA_BASE_URL", "ORBIT_LOCAL_MODEL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_OWNER_ID"];

if (env.isVercel) {
  for (const name of REQUIRED_ON_VERCEL) {
    if (!process.env[name]) {
      blocker("environment", `${name} is not set in this Vercel environment.`, `Add ${name} in the Vercel project's Environment Variables.`);
    }
  }
} else {
  const present = REQUIRED_ON_VERCEL.filter((n) => process.env[n]);
  info("environment", `Locally present of the Vercel-required names: ${present.length ? present.join(", ") : "none"}.`);
  warn("environment", `Vercel Preview and Production must each define: ${REQUIRED_ON_VERCEL.join(", ")}.`,
    "Set them per-environment in the Vercel dashboard. This check cannot see the Vercel dashboard.");
}
info("environment", `Never set on Vercel unless a specific server-side need is documented: ${LOCAL_ONLY.join(", ")}.`);
info("environment", `Optional on Vercel: ${OPTIONAL_ON_VERCEL.join(", ")}.`);

if (env.isDeployed && env.hasServiceRoleKey) {
  blocker("security", "A service-role key is present in a deployed environment.",
    "Orbit's request paths use the signed-in user's own token and rely on row-level security. "
    + "Remove SUPABASE_SERVICE_ROLE_KEY from this Vercel environment unless a documented server-side "
    + "operation genuinely requires bypassing RLS.");
}

// ── 5. Vercel wiring: config, handler, static assets ────────────────────────
for (const [file, why] of [
  ["vercel.json", "Vercel routing configuration"],
  ["api/index.js", "the Vercel function entry point"],
  ["lib/server/create-app.js", "the shared request handler"],
  [".vercelignore", "the upload exclusion list"],
  ["public/index.html", "the frontend document"],
]) {
  if (!existsSync(join(REPO_ROOT, file))) {
    blocker("vercel", `${file} is missing — ${why}.`, `Restore ${file}.`);
  }
}

if (existsSync(join(REPO_ROOT, "vercel.json"))) {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));
    if (cfg.framework !== null) warn("vercel", `vercel.json sets framework=${JSON.stringify(cfg.framework)}; Orbit expects null ("Other").`);
    if (cfg.outputDirectory !== "public") warn("vercel", `vercel.json outputDirectory is ${JSON.stringify(cfg.outputDirectory)}; Orbit serves static files from "public".`);
    const raw = readFileSync(join(REPO_ROOT, "vercel.json"), "utf8");
    if (/https?:\/\/(?!openapi\.vercel\.sh)/.test(raw)) {
      warn("vercel", "vercel.json appears to contain a hardcoded URL.", "Deployment URLs must not be hardcoded.");
    } else {
      info("vercel", "vercel.json contains no hardcoded deployment URL and no secret.");
    }
  } catch {
    blocker("vercel", "vercel.json is not valid JSON.", "Fix the syntax.");
  }
}

// The handler must be importable without side effects. Importing it here is
// itself the check: if importing bound a port or contacted a database, this
// script would hang or fail.
try {
  await import("../lib/server/create-app.js");
  info("vercel", "The Vercel handler module imports cleanly with no side effects.");
} catch (error) {
  blocker("vercel", `The Vercel handler module failed to import: ${error.message}`, "Fix the import error before deploying.");
}

// ── 6. Swiss Ephemeris: platform and licensing ──────────────────────────────
const ephe = ephemerisCapability();
if (ephe.ok) {
  info("ephemeris", `Astronomy engine: ${ephe.detail}`);
} else {
  blocker("ephemeris", `Astronomy engine unavailable: ${ephe.detail}`,
    "Every chart, current-sky, fortune, and Ask Orbit answer depends on it.");
}
const swetest = join(REPO_ROOT, "lib", "astro", "bin", "swetest");
if (existsSync(swetest)) {
  const fileType = spawnSync("file", ["-b", swetest], { encoding: "utf8" });
  const desc = fileType.status === 0 ? String(fileType.stdout).trim() : "unknown";
  info("ephemeris", `Bundled binary: ${desc}`);
  if (/Mach-O|arm64/i.test(desc)) {
    blocker("ephemeris", "The bundled swetest binary is built for macOS/arm64, but Vercel functions run Linux x86-64.",
      "It cannot execute on Vercel, so all astrology features would fail there. Options: build a "
      + "linux-x64 swetest and ship it alongside the macOS one, replace the subprocess with a "
      + "JavaScript/WASM ephemeris, or run the calculation in a separate service. This is an owner decision.");
  }
}
warn("legal", "Swiss Ephemeris licensing is UNRESOLVED and undocumented in this repository.",
  "Swiss Ephemeris is dual-licensed (AGPL or a paid commercial licence). Deploying it in a publicly "
  + "reachable app has obligations under either choice. Resolve and document the licence before any "
  + "public Production launch. This check cannot verify a licence.");

// ── 7. Git deployment state ─────────────────────────────────────────────────
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
info("git", `Current branch: ${branch || "unknown"}.`);
const dirty = git(["status", "--porcelain"]);
if (dirty) warn("git", "The working tree has uncommitted changes.", "Commit them before deploying — Vercel builds a commit, not your disk.");
else info("git", "The working tree is clean.");

const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
if (!upstream) {
  blocker("git", `Branch "${branch}" has not been pushed to a remote.`,
    `Vercel can only build a commit that exists on GitHub. Push it: git push -u origin ${branch}`);
} else {
  const counts = git(["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
  const [behind, ahead] = String(counts || "0\t0").split(/\s+/).map(Number);
  if (ahead > 0) {
    blocker("git", `Branch "${branch}" is ${ahead} commit(s) ahead of ${upstream}.`,
      `Vercel would build an older commit. Push first: git push origin ${branch}`);
  } else {
    info("git", `Branch "${branch}" is in sync with ${upstream} (behind ${behind}).`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const order = ["BLOCKER", "WARNING", "INFORMATIONAL"];
console.log("Orbit Axis deployment readiness");
console.log("");
console.log("Read-only. No deploy, no push, no migration, no database write, no secret printed.");
console.log("");

for (const level of order) {
  const items = findings.filter((f) => f.level === level);
  if (!items.length) continue;
  console.log(`${level} (${items.length})`);
  console.log("");
  for (const item of items) {
    console.log(`  [${item.area}] ${item.message}`);
    if (item.action) {
      for (const line of wrap(item.action, 88)) console.log(`      → ${line}`);
    }
  }
  console.log("");
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) { lines.push(line.trim()); line = word; }
    else line = `${line} ${word}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

const blockers = findings.filter((f) => f.level === "BLOCKER").length;
const warnings = findings.filter((f) => f.level === "WARNING").length;
console.log("─".repeat(72));
console.log(`${blockers} blocker(s), ${warnings} warning(s).`);
if (blockers) {
  console.log("");
  console.log("NOT READY to deploy. Resolve every blocker above first.");
  process.exit(1);
}
console.log("");
console.log("No blockers found. Review the warnings before Production.");
