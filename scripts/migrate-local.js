#!/usr/bin/env node
// Orbit Axis :: local migration runner (Update 4.0.2).
//
// Applies pending migrations to the LOCAL database only. Refuses any hosted
// target, so `supabase db push`-style accidents cannot happen through this
// command. Non-destructive: it never resets or repairs.

import { spawnSync } from "node:child_process";
import { localSupabaseUrl, LOCAL_ANON_KEY, resolveEnvironment } from "../lib/env/environment.js";
import { assertLocalDatabaseTarget, EnvironmentSafetyError } from "../lib/env/guard.js";

process.env.ORBIT_ENVIRONMENT = "local";
process.env.SUPABASE_URL ||= localSupabaseUrl();
process.env.SUPABASE_ANON_KEY ||= LOCAL_ANON_KEY;

try {
  assertLocalDatabaseTarget("Applying migrations", resolveEnvironment());
} catch (error) {
  if (error instanceof EnvironmentSafetyError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

console.log("Applying pending migrations to the LOCAL database…\n");
const result = spawnSync("supabase", ["migration", "up", "--local"], { stdio: "inherit" });
process.exit(result.status ?? 1);
