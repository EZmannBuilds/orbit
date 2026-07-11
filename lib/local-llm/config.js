import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let envLoaded = false;

export function loadEnvLocal() {
  if (envLoaded) return;
  envLoaded = true;
  for (const name of [".env.local", ".env"]) {
    const filePath = join(REPO_ROOT, name);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trim().startsWith("#")) continue;
      if (process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

export function localLlmConfig() {
  loadEnvLocal();
  return {
    enabled: process.env.ORBIT_LOCAL_LLM_ENABLED !== "false",
    provider: process.env.ORBIT_LOCAL_LLM_PROVIDER || "ollama",
    baseUrl: process.env.ORBIT_OLLAMA_BASE_URL || process.env.OLLAMA_BASE || "http://127.0.0.1:11434",
    model: process.env.ORBIT_LOCAL_MODEL || process.env.OLLAMA_MODEL || "",
    embeddingModel: process.env.ORBIT_LOCAL_EMBEDDING_MODEL || "",
    timeoutMs: Number(process.env.ORBIT_LOCAL_LLM_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 20000),
    maxResponseChars: Number(process.env.ORBIT_LOCAL_LLM_MAX_RESPONSE_CHARS || 120000),
    vaultPath: process.env.ORBIT_VAULT_PATH || resolve(REPO_ROOT, "..", "Orbit vault"),
    proposalDir: process.env.ORBIT_PROPOSAL_DIR || join(REPO_ROOT, ".orbit", "proposals"),
    promptVersion: process.env.ORBIT_LOCAL_LLM_PROMPT_VERSION || "orbit-project-assistant/v1",
  };
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
