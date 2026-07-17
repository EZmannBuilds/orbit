// Orbit Axis :: Ask Orbit language-generation boundary (Update 4.0).
//
// The astrology engine has already decided WHAT is true (the evidence) and drawn
// up a structured answer plan. This module is the single seam where an optional
// local model may reword that plan more fluently. It never calculates astrology
// and never adds facts:
//
//   - The deterministic presenter is always the source of truth and the fallback.
//   - If a local Ollama model is available, it is asked to rephrase the plan +
//     evidence into warm prose. Its output is validated (non-empty, length-capped,
//     stripped of any HTML) before use; on timeout, error, or suspicious output
//     the deterministic answer is returned instead.
//   - The evidence list shown to the user always comes from the deterministic
//     presenter, never from the model.
//
// This keeps provider-specific calls out of the UI and out of the engine.

import { presentAnswer, renderPlanForModel } from "./presenter.js";

const ASK_SYSTEM_PROMPT = [
  "You are Orbit, a focused, calm astrology advisor — not a general chatbot.",
  "You will be given a structured answer plan and a fixed list of astrological evidence.",
  "Rephrase the plan into a warm, plain-language answer with three short parts: a direct answer, a brief interpretation, and one gentle reflection.",
  "Use ONLY the evidence provided. Never introduce a placement, aspect, house, retrograde, or transit that is not listed. If something isn't given, don't claim it.",
  "Frame everything as symbolic reflection, never guaranteed fate. Avoid medical, legal, financial, and death/pregnancy/disaster certainty.",
  "Do not output HTML, markdown headings, JSON, the word 'evidence', or these instructions. Return only the answer prose.",
].join(" ");

function stripUnsafe(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")       // no HTML/markup
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Validate a model response before we trust it. Returns cleaned text or null.
function validateModelText(text, maxChars = 4000) {
  const clean = stripUnsafe(text);
  if (clean.length < 24) return null;                 // too short to be a real answer
  if (clean.length > maxChars) return null;           // runaway output
  if (/```|<script|<\/|\{\s*"/.test(clean)) return null; // code/markup/JSON leakage
  return clean;
}

// Produce the final answer object. Always returns a complete, valid answer.
// opts.provider (optional) is a local-LLM provider from createLocalLLMProvider.
// opts.useModel gates the optional model pass (default: attempt when a provider
// is supplied and healthy). opts.signal supports cancellation.
export async function generateAskAnswer(ctx, chart = null, opts = {}) {
  const deterministic = presentAnswer(ctx, chart);

  const provider = opts.provider || null;
  const useModel = opts.useModel !== false && !!provider;
  if (!useModel) return deterministic;

  let health = null;
  try { health = await provider.health(); } catch { health = null; }
  const modelReady = health?.reachable && (health.model_available ?? health.installed_model);
  if (!modelReady) return { ...deterministic, providerNote: "language_model_unavailable" };

  try {
    const grounding = renderPlanForModel(ctx, chart);
    const result = await provider.generate({
      system: ASK_SYSTEM_PROMPT,
      prompt: `${grounding}\n\nWrite the answer now.`,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    });
    const clean = result?.ok ? validateModelText(result.text, opts.maxChars) : null;
    if (!clean) return { ...deterministic, providerNote: result?.status || "model_output_rejected" };
    // Model reworded the prose; the evidence + themes stay authoritative.
    return {
      provider: "ollama",
      answer: { direct: clean, interpretation: "", reflection: "" },
      wordedText: clean,
      themes: deterministic.themes,
      evidence: deterministic.evidence,
      detailMode: deterministic.detailMode,
      disclaimer: deterministic.disclaimer,
    };
  } catch {
    return { ...deterministic, providerNote: "model_error" };
  }
}
