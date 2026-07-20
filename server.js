// Orbit — local development entry point.
//
// This file exists to do exactly three things: run the environment guard,
// create an HTTP server around the shared handler, and listen. Every route and
// all request behaviour lives in lib/server/create-app.js, which is also what
// the Vercel function (api/index.js) exports — so local and deployed Orbit run
// the same code and cannot drift apart.
//
// Zero runtime dependencies: node server.js (Node 20.11+). Default port 3001
// (override with PORT or the first CLI argument).
//
// The correct local command is `npm run dev:local`, which pins the local
// Supabase stack first. Running `node server.js` directly with a .env.local
// that points at hosted production is refused by the guard below, on purpose.

import http from "node:http";
import { createOrbitApp } from "./lib/server/create-app.js";
import { EnvironmentSafetyError, environmentStatusLines } from "./lib/env/guard.js";
import { localLlmConfig } from "./lib/local-llm/config.js";
import { createLocalLLMProvider } from "./lib/local-llm/provider.js";

const PORT = Number(process.env.PORT || process.argv[2] || 3001);

// ── Environment safety gate (Update 4.0.2, extended in 4.0.3) ────────────────
// createOrbitApp() runs assertStartupSafe() before returning a handler, so this
// happens BEFORE the port is bound and before any database request. Nothing
// here prints a key or a credential-bearing URL.
let handler;
try {
  handler = createOrbitApp();
} catch (error) {
  if (error instanceof EnvironmentSafetyError) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const ENV_INFO = handler.orbitEnvironment;
const server = http.createServer(handler);

server.listen(PORT, async () => {
  console.log(`Orbit astrology app listening at http://localhost:${PORT}`);
  // Concise, non-sensitive status so the target database is never a guess.
  if (!ENV_INFO.isProduction) {
    const askHistory = ENV_INFO.databaseTarget === "local" || ENV_INFO.databaseTarget === "preview"
      ? "persistent" : "not persistent (in-memory)";
    let ollama = "disabled";
    if (ENV_INFO.allowsLocalLanguageProvider && localLlmConfig().enabled) {
      try {
        const health = await createLocalLLMProvider().health();
        ollama = health?.reachable
          ? ((health.model_available ?? health.installed_model)
            ? `available (${health.configured_model || health.selected_model})`
            : "running, configured model not installed — using the built-in formatter")
          : "unavailable — using the built-in formatter";
      } catch { ollama = "unavailable — using the built-in formatter"; }
    }
    for (const line of environmentStatusLines(ENV_INFO, { askHistory, ollama })) console.log(line);
  }
  warmupModel();
});

// Best-effort model warmup: never blocks startup, never fails the app. Only
// runs when the local LLM is enabled AND Ollama is already reachable with the
// configured model installed — it will not start Ollama or pull a model.
// This lives in the local entry point only: a serverless function must never
// spend invocation time warming a model it is not allowed to call.
async function warmupModel() {
  const config = localLlmConfig();
  if (!ENV_INFO.allowsLocalLanguageProvider) return;
  if (!config.enabled || !config.warmupEnabled) return;
  try {
    const provider = createLocalLLMProvider(config);
    const health = await provider.health();
    if (!health.reachable || !(health.model_available ?? health.installed_model)) return;
    const result = await provider.warmup();
    console.log(`[axis-chat] warmup ${result.status} (keep-alive ${config.keepAlive})`);
  } catch { /* warmup is optional */ }
}
