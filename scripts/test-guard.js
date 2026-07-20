#!/usr/bin/env node
// Orbit Axis :: test-run safety gate (Update 4.0.2).
//
// Runs as `pretest`, before any test process starts. Refuses to let the suite
// run while the configuration points at the hosted production database, so a
// stray test can never write to production. Read-only; contacts nothing.

import { resolveEnvironment, describeTarget } from "../lib/env/environment.js";
import { assertNonProductionTarget, EnvironmentSafetyError } from "../lib/env/guard.js";

const info = resolveEnvironment({ overrides: { ORBIT_ENVIRONMENT: "test" } });
try {
  assertNonProductionTarget("The test suite", info);
} catch (error) {
  if (error instanceof EnvironmentSafetyError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
if (process.env.ORBIT_ENV_CHECK_VERBOSE === "true") {
  console.log(`[test-guard] target: ${describeTarget(info)}`);
}
