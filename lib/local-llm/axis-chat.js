// Orbit Axis :: chat orchestration (Update Two).
//
// Three response paths, in priority order:
//   1. fast    — a narrow, deterministic answer for app-status / data-retrieval
//                questions where the LLM adds nothing (uses verified facts only).
//   2. ollama  — streamed local generation (handled by the server + provider).
//   3. fallback— a deterministic, useful reply from verified facts when Ollama
//                is offline / missing the model / times out. Never fabricates.
//
// This module owns the fast + fallback text and a bounded health cache so one
// chat turn (and rapid retries) never hammers the local Ollama endpoint.

export const FALLBACK_NOTICE = "Local model unavailable. Orbit Axis is using verified chart data only.";

// Message validation limits (also enforced server-side before we get here).
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_CONVERSATION_MESSAGES = 40;

export function validateChatInput({ message, messages = [] } = {}) {
  const text = String(message ?? "").trim();
  if (!text) return { ok: false, error: "Message is empty." };
  if (text.length > MAX_MESSAGE_CHARS) return { ok: false, error: "Message is too long." };
  if (Array.isArray(messages) && messages.length > MAX_CONVERSATION_MESSAGES) {
    return { ok: false, error: "Conversation is too long." };
  }
  return { ok: true, message: text };
}

// ── Bounded health cache ──────────────────────────────────────────────────────
let healthCacheEntry = { at: 0, health: null };
export async function cachedHealth(provider, ttlMs = 5000, now = Date.now()) {
  if (healthCacheEntry.health && now - healthCacheEntry.at <= ttlMs) return healthCacheEntry.health;
  const health = await provider.health();
  healthCacheEntry = { at: now, health };
  return health;
}
export function resetHealthCache() { healthCacheEntry = { at: 0, health: null }; }

// ── Fast deterministic path ───────────────────────────────────────────────────
// Intentionally narrow: only unambiguous factual/status questions. Anything
// interpretive returns null and routes to Ollama (or fallback). Never used for
// astrology interpretation.
export function fastAnswer(query, facts = {}) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;
  const chart = facts.chart || null;
  const sky = facts.sky || null;
  const detail = facts.detailLevel || "Simple";
  const health = facts.health || null;

  // Which detail mode am I using?
  if (/\b(what|which).*(detail|mode).*(using|am i|on|selected)|detail mode.*\?/.test(q) || /\bwhich detail\b/.test(q)) {
    return { path: "fast", intent: "detail_mode", text: `You're using ${detail} detail mode.` };
  }
  // Is Ollama / the local model online?
  if (/\b(ollama|local model|local ai|local intelligence)\b.*(online|available|running|up|working|status)|is (ollama|the local model) /.test(q)) {
    const up = !!(health && health.reachable && (health.model_available ?? health.installed_model));
    return { path: "fast", intent: "ollama_status", text: up
      ? "Yes — the local model is online and ready."
      : health && health.reachable
        ? "Ollama is running, but the configured model isn't installed, so Orbit Axis is using verified chart data only."
        : "The local model is offline right now, so Orbit Axis is using verified chart data only." };
  }
  // What chart am I viewing?
  if (/\b(what|which) chart\b.*(view|using|active|looking|on)|current chart\b/.test(q)) {
    return { path: "fast", intent: "active_chart", text: chart?.nickname
      ? `You're viewing "${chart.nickname}".`
      : "No chart is active yet. Add a chart to get started." };
  }
  // Is my birth time known?
  if (/\bbirth ?time\b.*(known|set|have|entered)|do (i|we) (know|have) (my )?birth ?time/.test(q)) {
    if (!chart) return { path: "fast", intent: "birth_time", text: "No chart is active yet." };
    return { path: "fast", intent: "birth_time", text: chart.timeKnown
      ? "Yes — your birth time is known, so houses and an exact Rising are available."
      : "Your birth time isn't known, so houses and an exact Rising aren't available." };
  }
  // What Moon phase is it?
  if (/\b(moon phase|phase of the moon)\b|what.*moon.*(phase|tonight|right now)/.test(q)) {
    if (!sky?.moonPhase) return null;
    return { path: "fast", intent: "moon_phase", text: `The Moon is a ${sky.moonPhase}${sky.moonIllum != null ? ` at ${Math.round(sky.moonIllum)}% illumination` : ""}, in ${sky.moonSign}.` };
  }
  // What is my Sun / Moon / Rising sign?
  const big = q.match(/what.*\bmy\b.*\b(sun|moon|rising|ascendant)\b (sign|placement)?|my (sun|moon|rising|ascendant) sign/);
  if (big && chart) {
    const which = /rising|ascendant/.test(q) ? "rising" : /moon/.test(q) ? "moon" : "sun";
    const sign = chart[which];
    const label = which === "rising" ? "Rising" : which[0].toUpperCase() + which.slice(1);
    if (which === "rising" && !sign) return { path: "fast", intent: "big_three", text: "Your Rising sign isn't available because your birth time isn't known." };
    if (sign) return { path: "fast", intent: "big_three", text: `Your ${label} sign is ${sign}.` };
  }
  return null;
}

// ── Deterministic fallback (Ollama unavailable) ───────────────────────────────
// Returns a genuinely useful reply from verified facts. Clearly avoids invented
// interpretation. Fast (no network) and short.
export function fallbackAnswer(query, facts = {}) {
  const chart = facts.chart || null;
  const sky = facts.sky || null;
  const detail = facts.detailLevel || "Simple";

  // Prefer the fast path if the question is actually factual.
  const fast = fastAnswer(query, facts);
  if (fast) return { path: "fallback", intent: fast.intent, notice: FALLBACK_NOTICE, text: fast.text };

  const lines = [];
  if (chart) {
    const big = [chart.sun && `Sun in ${chart.sun}`, chart.moon && `Moon in ${chart.moon}`, chart.rising ? `Rising in ${chart.rising}` : null].filter(Boolean).join(", ");
    lines.push(`${chart.nickname ? `${chart.nickname}: ` : ""}${big}.`);
    if (chart.timeKnown === false) lines.push("Birth time isn't known, so houses and an exact Rising aren't available.");
  } else {
    lines.push("No active chart is selected yet — add one to see personal placements.");
  }
  if (sky) {
    lines.push(`Right now: ${sky.season} season, Moon in ${sky.moonSign} (${sky.moonPhase}${sky.moonIllum != null ? `, ${Math.round(sky.moonIllum)}% lit` : ""})${sky.retrogrades?.length ? `, ${sky.retrogrades.join(" and ")} retrograde` : ""}.`);
  }
  lines.push("I can't reach the local model for a fuller interpretation right now, but these calculated facts are accurate. Try again once Ollama is back online.");
  return { path: "fallback", intent: "verified_summary", notice: FALLBACK_NOTICE, text: lines.join(" "), detailLevel: detail };
}
