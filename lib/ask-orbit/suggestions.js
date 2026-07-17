// Orbit Axis :: Ask Orbit suggested questions (Update 4.0).
//
// Deterministic, context-adaptive suggestion chips for the empty state. Adapts
// to what is actually available: no house-specific questions when the birth time
// is unknown, no placement references for placements that aren't present, and no
// transit questions when current-sky data didn't load.

import { birthTimeReliability } from "./context-engine.js";

const PRESENT_BODIES = ["Venus", "Mars", "Saturn", "Mercury", "Jupiter", "Moon"];

// active: { profile, chart } | null ; sky: currentSky() | null
export function suggestedQuestions({ active = null, sky = null, limit = 6 } = {}) {
  const chart = active?.chart || null;
  const reliability = chart ? birthTimeReliability(chart, active?.profile) : "unknown";
  // House/Rising suggestions are fine unless the birth time is unknown.
  const houseOk = reliability !== "unknown";
  const out = [];

  // Always-safe, chart-light prompts.
  out.push({ text: "What should I pay attention to today?", topic: "general-daily" });

  if (sky) {
    out.push({ text: "How is the current sky affecting me?", topic: "current-transit" });
  }

  // Placement prompts only for placements the chart actually has.
  if (chart?.planets?.Venus?.sign) {
    out.push({ text: "What does my Venus placement say about relationships?", topic: "relationships" });
  }
  if (chart?.planets?.Saturn?.sign) {
    out.push({ text: "What area is Saturn asking me to develop?", topic: "career-purpose" });
  }
  out.push({ text: "Why might I feel more withdrawn lately?", topic: "emotional-patterns" });

  // Aspect prompt only if there are natal aspects to talk about.
  if (Array.isArray(chart?.aspects) && chart.aspects.length) {
    out.push({ text: "Explain my strongest chart pattern.", topic: "aspect-pattern" });
  }

  // House prompt only when the birth time supports houses.
  if (houseOk) {
    out.push({ text: "Which part of my life is most active right now?", topic: "house-topic" });
  }

  // Rising prompt only when Rising is available.
  const rising = chart?.big_three?.rising;
  if (houseOk && rising && !rising.unavailable && rising.sign) {
    out.push({ text: "What does my Rising sign say about how I come across?", topic: "natal-placement" });
  }

  // De-dupe by text and cap.
  const seen = new Set();
  return out.filter((s) => (seen.has(s.text) ? false : seen.add(s.text))).slice(0, limit);
}
