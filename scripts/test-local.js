#!/usr/bin/env node
// Orbit Axis :: safe test runner (Update 4.0.2).
//
// Pins the test run to the LOCAL Supabase stack before any test process starts,
// so `.env.local` (which holds the hosted project URL) can never pull the suite
// onto production. Unit tests need no database at all; the integration tests
// pick up the same local URL and skip when the stack isn't running.

import { spawnSync } from "node:child_process";
import { localSupabaseUrl, LOCAL_ANON_KEY, resolveEnvironment } from "../lib/env/environment.js";
import { assertNonProductionTarget, EnvironmentSafetyError } from "../lib/env/guard.js";

const localUrl = localSupabaseUrl();
const env = {
  ...process.env,
  ORBIT_ENVIRONMENT: "test",
  SUPABASE_URL: localUrl,
  SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
  ORBIT_TEST_SUPABASE_URL: process.env.ORBIT_TEST_SUPABASE_URL || localUrl,
};
// A service-role key is never needed by the suite.
delete env.SUPABASE_SERVICE_ROLE_KEY;

try {
  assertNonProductionTarget("The test suite", resolveEnvironment({ env, loadEnvFiles: false }));
} catch (error) {
  if (error instanceof EnvironmentSafetyError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ["--test", ...args], { stdio: "inherit", env });
process.exit(result.status ?? 1);
