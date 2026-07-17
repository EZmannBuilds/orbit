// Orbit Axis :: Ask Orbit deterministic presenter (Update 4.0).
//
// Turns a structured Ask context (from context-engine.js) into a complete,
// user-facing answer WITHOUT any language model. This is the default provider:
// Ask Orbit is fully functional with Ollama absent. Output is deterministic and
// contains only facts present in the evidence — it never invents placements,
// aspects, transits, or houses.
//
// The evidence labels produced here are also the canonical labels shown in the
// "Why Orbit Said This" panel, whether or not Ollama reworded the prose.

import { _internal } from "./context-engine.js";

const { BODY_THEME, ELEMENT_FLAVOR, elementOf } = _internal;

const ORDINAL = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th", 10: "10th", 11: "11th", 12: "12th" };
const HOUSE_TOPIC = {
  1: "self and how you come across", 2: "money, resources, and self-worth", 3: "communication and daily learning",
  4: "home, roots, and family", 5: "creativity, romance, and play", 6: "work, health, and routines",
  7: "partnership and close relationships", 8: "intimacy, shared resources, and change", 9: "meaning, travel, and belief",
  10: "career, reputation, and direction", 11: "community, friends, and hopes", 12: "rest, retreat, and the inner world",
};

function deg(x) {
  return x && x.degrees != null ? `${x.degrees}°${String(x.minutes ?? 0).padStart(2, "0")}′` : "";
}

// A concise, human evidence label. Advanced mode adds degrees/orbs/houses only
// when those values actually exist in the evidence.
export function evidenceLabel(item, detailMode = "Simple", chart = null) {
  const adv = detailMode === "Advanced";
  switch (item.type) {
    case "natal-placement": {
      const houseTxt = item.house ? ` · ${ORDINAL[item.house]} house` : "";
      const retro = item.retrograde ? " ℞" : "";
      const degTxt = adv && chart?.planets?.[item.body] ? ` ${deg(chart.planets[item.body])}` : "";
      return `Natal ${item.body} in ${item.sign}${degTxt}${adv ? houseTxt : (item.house ? houseTxt : "")}${retro}`;
    }
    case "natal-angle":
      return `Rising sign ${item.sign}`;
    case "natal-aspect":
      return `Natal ${item.a} ${item.aspect.toLowerCase()} ${item.b}${adv ? ` (orb ${item.orb}°)` : ""}`;
    case "current-transit": {
      const state = item.applying ? "applying" : "separating";
      return adv
        ? `Transit ${item.transitingBody} ${item.aspect} natal ${item.natalBody} (orb ${item.orb}°, ${state})`
        : `${item.transitingBody} ${item.aspect} your ${item.natalBody} right now`;
    }
    case "current-sky":
      if (item.subtype === "moon") return `Current ${item.sign} Moon${item.phase ? ` (${item.phase}${item.illumination != null ? `, ${Math.round(item.illumination)}% lit` : ""})` : ""}`;
      if (item.subtype === "season") return `${item.sign} season (Sun)`;
      if (item.subtype === "retrograde") return `${item.body} retrograde`;
      return "Current sky";
    default:
      return "Astrological factor";
  }
}

// Short, symbolic interpretation of one evidence item — original, general, and
// clearly reflective (no fabricated specifics, no fatalism).
function interpret(item, detailMode) {
  switch (item.type) {
    case "natal-placement": {
      const flavor = ELEMENT_FLAVOR[elementOf(item.sign)] || "in its own way";
      const house = item.house ? ` It plays out especially around ${HOUSE_TOPIC[item.house] || "that area of life"}.` : "";
      return `${item.body} carries ${BODY_THEME[item.body] || "part of your nature"}, and in ${item.sign} it expresses ${flavor}.${detailMode === "Advanced" ? house : ""}`;
    }
    case "natal-angle":
      return `Your ${item.sign} Rising shapes first impressions and the style you meet the world with.`;
    case "natal-aspect":
      return `${item.a} and ${item.b} are linked by a ${item.aspect.toLowerCase()}, so those two parts of you tend to move together.`;
    case "current-transit":
      return `${item.transitingBody} is currently ${item.aspect === "conjunction" ? "meeting" : `in a ${item.aspect} to`} your natal ${item.natalBody}. It's a passing weather pattern — ${item.applying ? "still building" : "already easing"} — not a permanent change.`;
    case "current-sky":
      if (item.subtype === "moon") return `The Moon in ${item.sign} tints today's mood; it moves on within a couple of days.`;
      if (item.subtype === "retrograde") return `${item.body} retrograde favors review and revision over launching something brand new.`;
      return `The Sun in ${item.sign} sets the season's broad tone.`;
    default:
      return "";
  }
}

// Build the full deterministic answer object from a context.
export function presentAnswer(ctx, chart = null) {
  const detailMode = ctx.detailMode === "Advanced" ? "Advanced" : "Simple";
  const ev = ctx.evidence || [];
  const plan = ctx.answerPlan || {};

  const direct = plan.directAnswer || "Here's what your chart and the current sky actually show.";

  // Interpretation: weave the two or three strongest pieces of evidence.
  const lead = ev.slice(0, detailMode === "Advanced" ? 3 : 2).map((it) => interpret(it, detailMode)).filter(Boolean);
  let interpretation = lead.join(" ");
  if (!interpretation) interpretation = "There isn't a single dominant factor right now, which usually points to a calm, open stretch rather than a turning point.";
  if (plan.reliabilityNote) interpretation += ` (${plan.reliabilityNote})`;

  // Reflection: a gentle, non-prescriptive prompt.
  const reflection = (plan.reflectionPrompts && plan.reflectionPrompts[0])
    || "Take what resonates and leave what doesn't — this is a mirror, not a forecast.";

  const evidence = ev.map((it) => ({
    label: evidenceLabel(it, detailMode, chart),
    type: it.type,
    relevance: it.relevance,
    interpretationKey: it.interpretationKey,
  }));

  // Include any limitation as its own labelled evidence line so the user sees it.
  for (const lim of ctx.limitations || []) {
    evidence.push({ label: lim.note, type: `limitation:${lim.type}`, relevance: null, interpretationKey: null });
  }

  return {
    provider: "deterministic",
    answer: { direct, interpretation, reflection },
    themes: plan.themes || [],
    evidence,
    detailMode,
    disclaimer: "Orbit offers symbolic reflection, not prediction or medical, legal, or financial advice.",
  };
}

// A compact, model-friendly rendering of the plan + evidence. Passed to Ollama
// as grounding when the optional adapter is used. Never includes private data
// beyond the active-chart astrology already selected as evidence.
export function renderPlanForModel(ctx, chart = null) {
  const lines = [];
  lines.push(`Question topics: ${ctx.questionType.join(", ")}.`);
  lines.push(`Detail mode: ${ctx.detailMode}. Birth-time reliability: ${ctx.birthTimeReliability}.`);
  lines.push(`Direct answer (keep this meaning): ${ctx.answerPlan.directAnswer}`);
  if (ctx.answerPlan.themes?.length) lines.push(`Themes: ${ctx.answerPlan.themes.join(", ")}.`);
  lines.push("Evidence (use only these facts; do not add any others):");
  for (const it of ctx.evidence) lines.push(`- ${evidenceLabel(it, ctx.detailMode, chart)}`);
  for (const lim of ctx.limitations || []) lines.push(`- Limitation: ${lim.note}`);
  return lines.join("\n");
}
