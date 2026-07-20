// Local Ollama client for Orbit's symbolic fallback. This path never performs
// astronomical calculations; it only explains supplied deterministic facts.

import { localLlmConfig } from "./local-llm/config.js";
import { createLocalLLMProvider } from "./local-llm/provider.js";

// Resolved on call, not at import. A module-level constant here would read
// .env.local the moment anything imported this file, which conflicts with the
// Update 4.0.3 rule that importing the request handler does no I/O.
export function ollamaModelName() {
  return localLlmConfig().model || "";
}

export async function orbitLlmReply(prompt, context) {
  const config = localLlmConfig();
  if (!config.enabled) return null;
  const provider = createLocalLLMProvider(config);
  const system = [
    "You are Orbit, the astrology accuracy and symbolic interpretation agent for a symbolic design brand.",
    "Answer briefly (2-4 sentences) using classical Western astrology symbolism.",
    "Use only the supplied deterministic sky context. Do not invent chart positions, degrees, houses, or transits.",
    "Frame everything as symbolic reflection for creative work — never prediction, medical, financial, or relationship advice, and no guaranteed outcomes.",
    `Today's sky: ${context}`,
  ].join(" ");

  const result = await provider.generate({
    system,
    prompt,
    format: undefined,
    temperature: 0.6,
    numPredict: 220,
  });
  return result.ok ? result.text : null;
}
