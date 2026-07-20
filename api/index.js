// Orbit Axis :: Vercel Node Function entry point (Update 4.0.3).
//
// Vercel routes every /api/* request here (see vercel.json) and invokes the
// default export with Node's own (req, res). Orbit's handler is a plain
// http.RequestListener, so no adapter is needed — this file is a seam, not a
// second implementation. Static files never reach this function; Vercel's CDN
// serves them from `public/` directly.
//
// The handler is created once per instance and reused across invocations on a
// warm instance. Creation runs the environment guard, so a deployment with an
// unsafe or incomplete configuration fails with one clear message instead of
// serving requests against the wrong database.
//
// Nothing here holds durable state. Anything that must survive a request lives
// in Supabase; a serverless instance can disappear between invocations.

import { createOrbitApp } from "../lib/server/create-app.js";
import { EnvironmentSafetyError } from "../lib/env/guard.js";

let handler = null;
let startupError = null;

function getHandler() {
  if (handler || startupError) return handler;
  try {
    handler = createOrbitApp();
  } catch (error) {
    // Cache the failure: retrying the guard on every request would turn one
    // configuration mistake into a per-request stampede, and the answer cannot
    // change without a redeploy or an environment-variable change.
    startupError = error;
  }
  return handler;
}

export default function orbitVercelHandler(req, res) {
  const app = getHandler();
  if (app) return app(req, res);

  // Configuration failure. The reason is logged for the owner in the Vercel
  // function logs; the browser gets a generic message, because the guard's
  // text names hostnames and project references that a public visitor has no
  // reason to see.
  if (startupError instanceof EnvironmentSafetyError) {
    console.error(`[orbit] startup blocked (${startupError.code}):\n${startupError.message}`);
  } else {
    console.error("[orbit] startup failed:", startupError);
  }
  res.writeHead(503, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({
    ok: false,
    error: "Orbit is not configured for this environment yet.",
  }));
}
