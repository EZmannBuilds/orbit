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
import { assertStartupSafe, EnvironmentSafetyError } from "../lib/env/guard.js";

const wantProduction = process.argv.includes("--production");
const info = resolveEnvironment({ overrides: wantProduction ? { ORBIT_ENVIRONMENT: "production" } : null });

console.log("Orbit Axis environment check");
console.log("");
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

console.log("OK — this configuration is safe to start.");
