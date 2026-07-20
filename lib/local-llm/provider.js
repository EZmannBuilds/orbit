// Orbit Axis :: local language-provider factory.
//
// This is the ONE place a real Ollama client is constructed, which makes it the
// one place that can guarantee a deployment never tries to reach one.
//
// Why that matters (Update 4.0.3): Ollama runs on the owner's own computer at
// 127.0.0.1:11434. A Vercel function has no route to it. Attempting the call
// anyway would spend the whole invocation timing out against an address that
// does not exist there, and would leak a localhost connection error into a
// user-facing response. Orbit's Ask answers are deterministic first and only
// *optionally* reworded by a model, so the correct deployed behaviour is to
// declare the model unavailable up front and use the deterministic presenter —
// which produces a complete, evidence-backed answer on its own.
//
// The disabled stub below performs no network I/O of any kind, so "Ollama is
// never called from Vercel" is enforced by construction rather than by every
// call site remembering to check.

import { localLlmConfig } from "./config.js";
import { resolveEnvironment } from "../env/environment.js";
import { OllamaProvider } from "./ollama.js";

function disabledProvider(config, reason, message) {
  return {
    async health() {
      return {
        ok: false, provider: config.provider, enabled: false, reachable: false,
        configured_model: config.model || null, installed_model: false,
        model_available: false,
        fallback_available: true, fallback_active: true,
        context_length: config.contextLength,
        disabled: true, disabled_reason: reason, message,
      };
    },
    async listModels() { return []; },
    async generate() {
      return { ok: false, status: "disabled", text: "", message };
    },
    async *streamChat() {
      yield { type: "error", status: "disabled", message };
    },
    async warmup() { return { ok: false, status: "disabled" }; },
  };
}

// `env` may be passed in by callers that already resolved the environment
// (tests and the request handler); otherwise it is resolved here.
export function createLocalLLMProvider(overrides = {}, { env = null } = {}) {
  const config = { ...localLlmConfig(), ...overrides };

  // Environment gate first: a deployment must not get a network-capable
  // provider even if ORBIT_LOCAL_LLM_ENABLED is left set to true in the Vercel
  // dashboard by mistake.
  const info = env ?? resolveEnvironment();
  if (!info.allowsLocalLanguageProvider) {
    return disabledProvider(
      config,
      info.isDeployed ? "not_available_on_deployment" : "not_permitted_in_environment",
      "Orbit's optional local language model is not available in this environment. Answers use the deterministic Orbit engine.",
    );
  }

  if (!config.enabled) {
    return disabledProvider(config, "disabled_by_configuration", "Local LLM features are disabled.");
  }
  if (config.provider !== "ollama") throw new Error(`Unsupported local LLM provider: ${config.provider}`);
  return new OllamaProvider(config);
}
