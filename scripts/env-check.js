#!/usr/bin/env node
// Orbit Axis :: environment check (Update 4.0.2).
//
// Read-only. Reports which environment Orbit thinks it is in and which database
// it would use, then applies the same startup guard the server does — without
// binding a port, contacting a database, or printing any secret.
//
//   node scripts/env-check.js               # check the current configuration
//   node scripts/env-check.js --production  # check production readiness
//
// Exit code 0 = safe to start. Exit code 1 = a genuine blocker.

import { resolveEnvironment, describeTarget } from "../lib/env/environment.js";
import { envFileStatus } from "../lib/local-llm/config.js";
import { assertStartupSafe, EnvironmentSafetyError } from "../lib/env/guard.js";

const wantProduction = process.argv.includes("--production");
// --strict turns "nothing is configured" into a failure. Useful in CI and in a
// fresh worktree, where silence would otherwise read as approval.
const strict = process.argv.includes("--strict");
const info = resolveEnvironment({ overrides: wantProduction ? { ORBIT_ENVIRONMENT: "production" } : null });
const envFiles = envFileStatus();

console.log("Orbit Axis environment check");
console.log("");
// Which checkout this is and what it found. Update 4.0.3 saw this command
// disagree between the main checkout and a worktree and could not explain why;
// the answer is right here — a worktree has no untracked .env.local, so it has
// no configuration at all, which is a different state from "configured safely".
console.log(`  Checkout root:    ${envFiles.root}`);
console.log(`  Env files loaded: ${envFiles.loaded.length ? envFiles.loaded.join(", ") : `none (looked for ${envFiles.searched.join(", ")})`}`);
console.log(`  Environment:      ${info.environment}${info.environmentSource === "default" ? " (default)" : ` (from ${info.environmentSource})`}`);
console.log(`  Database target:  ${describeTarget(info)}`);
console.log(`  Anon key:         ${info.hasAnonKey ? "present" : "missing"}`);
console.log(`  Service-role key: ${info.hasServiceRoleKey ? "present (server-only)" : "not set"}`);
console.log("");
console.log("  Development operations permitted:");
console.log(`    disposable users:  ${info.allowsDisposableUsers ? "yes" : "no"}`);
console.log(`    local migrations:  ${info.allowsLocalMigrations ? "yes" : "no"}`);
console.log(`    seed data:         ${info.allowsSeedData ? "yes" : "no"}`);
console.log(`    persistent storage required: ${info.requiresPersistentStorage ? "yes" : "no"}`);
console.log("");

try {
  assertStartupSafe(info);
} catch (error) {
  if (error instanceof EnvironmentSafetyError) {
    console.error("BLOCKED");
    console.error("");
    console.error(error.message);
    console.error("");
    process.exit(1);
  }
  throw error;
}

if (wantProduction && !info.hasServiceRoleKey) {
  console.log("Note: no service-role key is set. That is correct unless a server-side");
  console.log("operation genuinely requires bypassing row-level security.");
  console.log("");
}

// ── "safe" is not the same as "configured" (Update 4.0.4) ───────────────────
// The guard's job is to prevent damage, and no configuration cannot damage
// anything — so assertStartupSafe() passes. But reporting that as a plain
// "safe to start" told a reader in a fresh worktree that everything was fine
// when in fact nothing was set up. These two states are now named separately.
const unconfigured = info.databaseTarget === "missing" || info.databaseTarget === "invalid";

if (unconfigured && !wantProduction) {
  console.log("NOT CONFIGURED");
  console.log("");
  console.log("  Nothing unsafe was found — but no database is configured in this checkout,");
  console.log("  so this is not a working setup either.");
  console.log("");
  if (!envFiles.loaded.length) {
    console.log("  No .env.local was found here. If this is a git worktree, that is expected:");
    console.log("  .env.local is untracked and does not travel between checkouts.");
    console.log("");
  }
  console.log("  Sign-in, saved charts, and Ask Orbit history will not work until a database");
  console.log("  is configured. Astronomy calculations do not need one.");
  console.log("");
  console.log("  Start the local database and run Orbit against it:");
  console.log("");
  console.log("    supabase start");
  console.log("    npm run dev:local");
  console.log("");
  console.log("  dev:local pins the local Supabase stack itself, so it works without .env.local.");
  console.log("");
  process.exit(strict ? 1 : 0);
}

if (unconfigured && wantProduction) {
  // Never reached in practice — the guard blocks production with no database —
  // but stated explicitly so the intent is not left to inference.
  console.error("BLOCKED — production mode requires an explicitly configured database.");
  process.exit(1);
}

console.log(`OK — this configuration is safe to start (${describeTarget(info)}).`);
