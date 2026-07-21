// Orbit Axis API v1 :: version reporting.
//
// Read from package.json rather than hardcoded, so a released build cannot
// report a version it is not. Git metadata is optional: Vercel provides commit
// information through environment variables, and a plain checkout provides
// none. The endpoint must work either way, so everything here degrades to null
// rather than throwing.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../../local-llm/config.js";

let cached = null;

export function applicationVersion() {
  if (cached) return cached;
  try { cached = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).version; }
  catch { cached = "0.0.0-unknown"; }
  return cached;
}

/**
 * Non-secret build identity. Vercel exposes the commit SHA and branch as
 * environment variables; both are public facts about a public repository.
 * Truncated to 12 characters — enough to identify a commit, and it signals
 * that this is for humans reading a version page.
 */
export function buildIdentity(env = process.env) {
  const sha = String(env.VERCEL_GIT_COMMIT_SHA || "").trim();
  const ref = String(env.VERCEL_GIT_COMMIT_REF || "").trim();
  return {
    commit: sha ? sha.slice(0, 12) : null,
    branch: ref || null,
    buildId: String(env.VERCEL_DEPLOYMENT_ID || "").trim() || null,
    builtAt: String(env.VERCEL_BUILD_TIME || "").trim() || null,
  };
}
