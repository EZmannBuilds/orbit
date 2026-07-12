import { localLlmConfig } from "./config.js";
import { OllamaProvider } from "./ollama.js";

export function createLocalLLMProvider(overrides = {}) {
  const config = { ...localLlmConfig(), ...overrides };
  if (!config.enabled) {
    return {
      async health() {
        return {
          ok: false, provider: config.provider, enabled: false, reachable: false,
          configured_model: config.model || null, installed_model: false,
          fallback_available: true, fallback_active: true,
          context_length: config.contextLength,
          disabled: true, message: "Local LLM features are disabled.",
        };
      },
      async listModels() { return []; },
      async generate() {
        return { ok: false, status: "disabled", text: "", message: "Local LLM features are disabled." };
      },
    };
  }
  if (config.provider !== "ollama") throw new Error(`Unsupported local LLM provider: ${config.provider}`);
  return new OllamaProvider(config);
}
