import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let envLoaded = false;
// Which env files were actually found and loaded, and which were looked for.
// Update 4.0.4: Update 4.0.3 reported `env:check` "failing in the main checkout
// but succeeding in a worktree" and left it unexplained. The cause was not a
// path bug — REPO_ROOT correctly resolves per checkout — it was that a worktree
// has no untracked .env.local, so NO database was configured there at all, and
// the check still printed an unqualified "safe to start". Recording the search
// result lets the checks say which of those two situations they are in instead
// of leaving the reader to guess.
let envFilesLoaded = [];
let envFilesSearched = [];

export function loadEnvLocal() {
  if (envLoaded) return;
  envLoaded = true;
  envFilesLoaded = [];
  envFilesSearched = [];
  for (const name of [".env.local", ".env"]) {
    const filePath = join(REPO_ROOT, name);
    envFilesSearched.push(name);
    if (!existsSync(filePath)) continue;
    envFilesLoaded.push(name);
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trim().startsWith("#")) continue;
      if (process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

// Names only — never contents, never values.
export function envFileStatus() {
  loadEnvLocal();
  return { root: REPO_ROOT, searched: [...envFilesSearched], loaded: [...envFilesLoaded] };
}

export function localLlmConfig() {
  loadEnvLocal();
  return {
    enabled: process.env.ORBIT_LOCAL_LLM_ENABLED !== "false",
    provider: process.env.ORBIT_LOCAL_LLM_PROVIDER || "ollama",
    baseUrl: process.env.ORBIT_OLLAMA_BASE_URL || process.env.OLLAMA_BASE || "http://127.0.0.1:11434",
    model: process.env.ORBIT_LOCAL_MODEL || process.env.OLLAMA_MODEL || "",
    embeddingModel: process.env.ORBIT_LOCAL_EMBEDDING_MODEL || "",
    timeoutMs: numberEnv("ORBIT_LOCAL_LLM_TIMEOUT_MS", 180000),
    contextLength: numberEnv("ORBIT_LOCAL_LLM_CONTEXT_LENGTH", 8192),
    temperature: numberEnv("ORBIT_LOCAL_LLM_TEMPERATURE", 0.2),
    maxOutputTokens: numberEnv("ORBIT_LOCAL_LLM_MAX_OUTPUT_TOKENS", 3000),
    maxResponseChars: Number(process.env.ORBIT_LOCAL_LLM_MAX_RESPONSE_CHARS || 120000),
    maxNoteChars: numberEnv("ORBIT_LOCAL_LLM_MAX_NOTE_CHARS", 80000),
    vaultPath: process.env.ORBIT_VAULT_PATH || resolve(REPO_ROOT, "..", "Orbit vault"),
    proposalDir: process.env.ORBIT_PROPOSAL_DIR || join(REPO_ROOT, ".orbit", "proposals"),
    promptVersion: process.env.ORBIT_LOCAL_LLM_PROMPT_VERSION || "orbit-project-assistant/v2",
    // ── Ask Orbit Axis chat (Update Two) ──────────────────────────────────────
    // Ollama keep-alive: how long Ollama keeps the model resident between turns.
    // "10m" avoids a cold reload on every message without pinning memory forever.
    // Set ORBIT_LLM_KEEP_ALIVE=0 to unload immediately after each request.
    keepAlive: process.env.ORBIT_LLM_KEEP_ALIVE || "10m",
    // One-time, tiny, non-user-facing warmup at server start so the first real
    // chat turn isn't a cold model load. Never blocks startup; failure is a
    // no-op. Disable with ORBIT_LLM_WARMUP=false.
    warmupEnabled: process.env.ORBIT_LLM_WARMUP !== "false",
    // Streaming chat timeout is shorter than the batch vault-assistant timeout —
    // a conversational reply that hasn't started in this long is treated as down.
    chatTimeoutMs: numberEnv("ORBIT_LLM_CHAT_TIMEOUT_MS", 60000),
    // A short-lived health cache so a single chat turn (and rapid retries) don't
    // hammer the local Ollama endpoint with repeated /api/tags probes.
    healthCacheMs: numberEnv("ORBIT_LLM_HEALTH_CACHE_MS", 5000),
  };
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function supabaseConfig() {
  loadEnvLocal();
  return {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    accessToken: process.env.SUPABASE_ACCESS_TOKEN || "",
    ownerId: process.env.SUPABASE_OWNER_ID || "",
  };
}
