// Local Ollama client for Orbit. Zero dependencies (global fetch, Node 18+).
// Used only when the deterministic engine returns an unresolved intent —
// every failure path returns null so Orbit falls back to its canned reply.

const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 20000);

export async function orbitLlmReply(prompt, context) {
  const system = [
    "You are Orbit, the astrology accuracy and symbolic interpretation agent for a symbolic design brand.",
    "Answer briefly (2-4 sentences) using classical Western astrology symbolism.",
    "Frame everything as symbolic reflection for creative work — never prediction, medical, financial, or relationship advice, and no guaranteed outcomes.",
    `Today's sky: ${context}`,
  ].join(" ");

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.6, num_predict: 220 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}
