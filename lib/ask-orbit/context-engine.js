// Orbit Axis :: Ask Orbit astrology context engine (Update 4.0).
//
// The deterministic core of Ask Orbit. Given a question plus the already-computed
// natal chart and current sky, it:
//   1. classifies the question into one or more topics,
//   2. selects only the relevant astrological evidence,
//   3. ranks that evidence by relevance and strength,
//   4. produces a typed, structured answer plan.
//
// It never calls a language model, never touches the network, and never
// fabricates a placement, aspect, retrograde, house, or transit — every piece of
// evidence is copied from the deterministic Swiss Ephemeris output it is handed.
// Identical structured inputs always produce identical output (no Math.random,
// no ambient Date; the caller passes any "now" it needs).
//
// Reuses personalTransits() from the fortune engine so there is exactly one
// transit calculation in the app, not a second copy.

import { personalTransits } from "../fortune/engine.js";
import { elementOf, modalityOf } from "../astro/natal.js";

export const ASK_ENGINE_VERSION = "ask-v1";

// ── question classification ──────────────────────────────────────────────────
export const QUESTION_TYPES = Object.freeze([
  "general-daily", "natal-placement", "relationships", "career-purpose",
  "emotional-patterns", "current-transit", "timing", "house-topic",
  "aspect-pattern", "clarification",
]);

const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const PERSONAL = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars"]);

// Base importance of each body — luminaries and personal planets weigh more than
// the slow outer planets. Rising/chart-ruler bonuses are applied separately.
const BODY_WEIGHT = {
  Sun: 0.62, Moon: 0.62, Mercury: 0.46, Venus: 0.46, Mars: 0.46,
  Jupiter: 0.36, Saturn: 0.38, Uranus: 0.26, Neptune: 0.26, Pluto: 0.28,
};

// Which bodies / houses a topic cares about (for the relevance bonus).
const TOPIC_MAP = {
  "relationships": { bodies: ["Venus", "Mars", "Moon"], houses: [7, 5], themes: ["connection", "values", "desire"] },
  "career-purpose": { bodies: ["Sun", "Saturn", "Mars"], houses: [10, 6], themes: ["direction", "structure", "effort"] },
  "emotional-patterns": { bodies: ["Moon", "Neptune"], houses: [4, 12], themes: ["feeling", "care", "inner life"] },
  "general-daily": { bodies: ["Moon", "Sun"], houses: [], themes: ["mood", "focus"] },
  "current-transit": { bodies: [], houses: [], themes: ["timing", "change"] },
  "timing": { bodies: [], houses: [], themes: ["timing", "readiness"] },
  "natal-placement": { bodies: [], houses: [], themes: ["character"] },
  "house-topic": { bodies: [], houses: [], themes: ["life area"] },
  "aspect-pattern": { bodies: [], houses: [], themes: ["core pattern"] },
  "clarification": { bodies: [], houses: [], themes: ["clarity"] },
};

// Short, original, symbolic keyword for each body — used for plain-language
// interpretation. Deliberately generic (not copied from any guidebook).
const BODY_THEME = {
  Sun: "identity and vitality", Moon: "emotional needs and instincts",
  Mercury: "thinking and communication", Venus: "love, values, and pleasure",
  Mars: "drive, courage, and assertion", Jupiter: "growth, meaning, and opportunity",
  Saturn: "structure, discipline, and long-term work", Uranus: "change and independence",
  Neptune: "imagination and sensitivity", Pluto: "depth and transformation",
};
const ELEMENT_FLAVOR = {
  Fire: "with warmth and momentum", Earth: "in a grounded, practical way",
  Air: "through ideas and connection", Water: "with feeling and intuition",
};

export function classifyQuestion(text) {
  const q = String(text || "").toLowerCase();
  const types = new Set();
  if (/\b(relationship|relationships|love|partner|dating|romance|romantic|marriage|attract|attraction|crush|ex)\b/.test(q)) types.add("relationships");
  if (/\b(career|job|work|working|purpose|vocation|calling|ambition|success|profession|business|money)\b/.test(q)) types.add("career-purpose");
  if (/\b(feel|feeling|feelings|emotion|emotional|mood|withdrawn|anxious|anxiety|sad|down|depress|lonely|overwhelm|inner)\b/.test(q)) types.add("emotional-patterns");
  if (/\b(transit|current sky|right now|affecting me|happening|these days|this week|lately|going on)\b/.test(q)) types.add("current-transit");
  if (/\b(when|timing|how long|best time|right time|soon|ready)\b/.test(q)) types.add("timing");
  if (/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+house\b|which house|what house/.test(q)) types.add("house-topic");
  if (/\b(aspect|aspects|pattern|strongest|square|trine|conjunction|opposition|sextile)\b/.test(q)) types.add("aspect-pattern");
  if (/\bmy (sun|moon|rising|ascendant|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto)\b|placement|natal|chart (say|says|show|tell)|what does my/.test(q)) types.add("natal-placement");
  if (/\bexplain (more|that|this|again)\b|what do you mean|clarify|elaborate|tell me more|go deeper|why did you|say more\b/.test(q)) types.add("clarification");
  if (!types.size) types.add("general-daily");
  // Preserve canonical order for stable, testable output.
  return QUESTION_TYPES.filter((t) => types.has(t));
}

export function mentionedBody(text) {
  const q = String(text || "").toLowerCase();
  for (const b of BODIES) if (new RegExp(`\\b${b.toLowerCase()}\\b`).test(q)) return b;
  if (/\b(rising|ascendant)\b/.test(q)) return "Ascendant";
  return null;
}

const HOUSE_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};
export function mentionedHouse(text) {
  const q = String(text || "").toLowerCase();
  const num = q.match(/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\s+house\b/);
  if (num) return parseInt(num[1], 10);
  const word = q.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+house\b/);
  if (word) return HOUSE_WORDS[word[1]];
  return null;
}

// ── birth-time reliability ───────────────────────────────────────────────────
// Derives the reliability tier from the chart. House-, angle-, and Rising-based
// evidence is only trustworthy when the birth time is trustworthy.
export function birthTimeReliability(chart, profile = null) {
  const acc = chart?.time_accuracy || profile?.time_accuracy || "unknown";
  if (["exact", "reported", "approximate", "unknown"].includes(acc)) return acc;
  return "unknown";
}
// Houses / angles / Rising are usable unless the birth time is unknown.
// Approximate times still use them, but with a caution limitation and reduced
// confidence (see buildLimitations + the approximate down-weighting below).
function houseSafe(reliability) { return reliability !== "unknown"; }

function clamp01(n) { return Math.max(0, Math.min(1, Math.round(n * 100) / 100)); }
function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

// ── evidence selection + ranking ─────────────────────────────────────────────
// Returns a ranked, filtered array of evidence items. Every value is copied from
// the provided chart / sky / transits; nothing is invented.
export function selectEvidence({ chart, sky, transits, questionTypes = [], question = "", reliability = "unknown", limit = 6 }) {
  const items = [];
  const topics = questionTypes.length ? questionTypes : ["general-daily"];
  const wantBody = mentionedBody(question);
  const wantHouse = mentionedHouse(question);
  const houseOk = houseSafe(reliability);

  const topicBodies = new Set();
  const topicHouses = new Set();
  for (const t of topics) {
    for (const b of TOPIC_MAP[t]?.bodies || []) topicBodies.add(b);
    for (const h of TOPIC_MAP[t]?.houses || []) topicHouses.add(h);
  }
  const wantsNatal = topics.some((t) => ["natal-placement", "relationships", "career-purpose", "emotional-patterns", "aspect-pattern", "house-topic", "clarification"].includes(t));
  const wantsTransits = topics.some((t) => ["general-daily", "current-transit", "timing", "emotional-patterns", "relationships", "career-purpose"].includes(t));
  const wantsSky = topics.some((t) => ["general-daily", "current-transit", "emotional-patterns", "timing"].includes(t));

  // 1) Natal placements
  if (chart?.planets) {
    for (const body of BODIES) {
      const p = chart.planets[body];
      if (!p?.sign) continue;
      const house = houseOk ? chart.planet_houses?.[body] ?? null : null;
      let rel = BODY_WEIGHT[body] || 0.3;
      if (chart.chart_ruler === body) rel += 0.12;
      if (topicBodies.has(body)) rel += 0.3;
      if (wantBody === body) rel += 0.4;
      if (wantHouse != null && house === wantHouse) rel += 0.35;
      // Placements matter most when the question is about the natal chart.
      if (!wantsNatal) rel -= 0.18;
      items.push({
        type: "natal-placement",
        body, sign: p.sign,
        house: house ?? undefined,
        retrograde: !!p.retrograde || undefined,
        relevance: clamp01(rel),
        interpretationKey: `${slug(body)}-${slug(p.sign)}`,
      });
    }
  }

  // 2) Rising / Ascendant (angle) — only when birth time supports it
  const rising = chart?.big_three?.rising;
  if (houseOk && rising && !rising.unavailable && rising.sign) {
    let rel = 0.55;
    if (topics.includes("natal-placement") || topics.includes("general-daily")) rel += 0.1;
    if (wantBody === "Ascendant") rel += 0.4;
    if (reliability === "approximate") rel -= 0.12; // less confident on an approximate time
    items.push({
      type: "natal-angle",
      body: "Ascendant", sign: rising.sign,
      relevance: clamp01(rel),
      interpretationKey: `ascendant-${slug(rising.sign)}`,
    });
  }

  // 3) Natal aspects (tighter orb = stronger). Most relevant for aspect questions.
  if (Array.isArray(chart?.aspects)) {
    const aspTopic = topics.includes("aspect-pattern");
    for (const a of chart.aspects.slice(0, 8)) {
      // Skip angle-dependent aspects when the birth time can't support them.
      if (!houseOk && (a.a === "Ascendant" || a.b === "Ascendant" || a.a === "MC" || a.b === "MC")) continue;
      const tight = 1 - Math.min(a.orb, 8) / 8;
      let rel = 0.28 + tight * 0.3 + (aspTopic ? 0.25 : 0);
      if (wantBody && (a.a === wantBody || a.b === wantBody)) rel += 0.25;
      items.push({
        type: "natal-aspect",
        a: a.a, b: a.b, aspect: a.aspect, orb: a.orb,
        relevance: clamp01(rel),
        interpretationKey: `${slug(a.a)}-${slug(a.aspect)}-${slug(a.b)}`,
      });
    }
  }

  // 4) Current transits to the natal chart
  if (wantsTransits && Array.isArray(transits)) {
    for (const t of transits.slice(0, 6)) {
      const tight = 1 - Math.min(t.orb, 3) / 3;
      let rel = 0.4 + tight * 0.28 + (t.applying ? 0.05 : 0);
      if (PERSONAL.has(t.transiting) || PERSONAL.has(t.natal)) rel += 0.08;
      if (topics.includes("timing") || topics.includes("current-transit")) rel += 0.12;
      if (wantBody && (t.transiting === wantBody || t.natal === wantBody)) rel += 0.2;
      items.push({
        type: "current-transit",
        transitingBody: t.transiting, aspect: t.aspect, natalBody: t.natal,
        orb: t.orb, applying: !!t.applying,
        relevance: clamp01(rel),
        interpretationKey: `${slug(t.transiting)}-${slug(t.aspect)}-${slug(t.natal)}`,
      });
    }
  }

  // 5) Current sky (Moon / season / retrogrades)
  if (wantsSky && sky) {
    if (sky.moon?.sign) {
      let rel = 0.42 + (topics.includes("emotional-patterns") || topics.includes("general-daily") ? 0.12 : 0);
      items.push({
        type: "current-sky", subtype: "moon",
        sign: sky.moon.sign, phase: sky.moon.phase_name,
        illumination: sky.moon.illumination_percent, waxing: sky.moon.waxing,
        relevance: clamp01(rel),
        interpretationKey: `moon-${slug(sky.moon.sign)}`,
      });
    }
    if (sky.zodiac_season) {
      items.push({
        type: "current-sky", subtype: "season", sign: sky.zodiac_season,
        relevance: clamp01(0.3),
        interpretationKey: `season-${slug(sky.zodiac_season)}`,
      });
    }
    for (const r of sky.retrogrades || []) {
      items.push({
        type: "current-sky", subtype: "retrograde", body: r,
        relevance: clamp01(0.36 + (r === "Mercury" ? 0.06 : 0)),
        interpretationKey: `retrograde-${slug(r)}`,
      });
    }
  }

  // Deterministic ranking: relevance desc, then a stable key for ties.
  items.sort((x, y) => (y.relevance - x.relevance) || sortKey(x).localeCompare(sortKey(y)));
  return items.slice(0, limit);
}

function sortKey(item) {
  return [item.type, item.subtype || "", item.body || "", item.transitingBody || "", item.natalBody || "", item.a || "", item.b || "", item.sign || "", item.aspect || ""].join("|");
}

// ── answer plan ──────────────────────────────────────────────────────────────
// A structured, deterministic plan the presenter (and optionally Ollama) render
// into words. The plan references only the selected evidence.
export function buildAnswerPlan({ questionTypes = [], evidence = [], reliability = "unknown", limitations = [] }) {
  const topics = questionTypes.length ? questionTypes : ["general-daily"];
  const themeSet = [];
  for (const t of topics) for (const th of TOPIC_MAP[t]?.themes || []) if (!themeSet.includes(th)) themeSet.push(th);

  const top = evidence[0] || null;
  let directAnswer;
  if (!top) {
    directAnswer = "There isn't a strong, reliable factor pointing at this right now — which is itself a calm, neutral signal.";
  } else if (top.type === "natal-placement" || top.type === "natal-angle") {
    directAnswer = `Your ${top.body} in ${top.sign} is the most relevant piece of your chart here — it colors ${BODY_THEME[top.body] || "this area"}.`;
  } else if (top.type === "current-transit") {
    directAnswer = `The clearest active influence is ${top.transitingBody} ${top.aspect} your natal ${top.natalBody} — a passing ${top.applying ? "and still-building" : "and easing"} theme, not a fixed outcome.`;
  } else if (top.type === "current-sky") {
    directAnswer = top.subtype === "moon"
      ? `Today's ${top.sign} Moon sets the emotional weather more than anything fixed in your chart.`
      : top.subtype === "retrograde"
        ? `${top.body} retrograde is the main note in the current sky — a review-and-slow-down signal.`
        : `The Sun in ${top.sign} season is the broad backdrop right now.`;
  } else if (top.type === "natal-aspect") {
    directAnswer = `Your natal ${top.a} ${top.aspect} ${top.b} is the strongest pattern behind this.`;
  } else {
    directAnswer = "Here is what your chart and the current sky actually show.";
  }

  const reflectionPrompts = [];
  if (topics.includes("relationships")) reflectionPrompts.push("Where do you want more honesty or ease in how you connect?");
  if (topics.includes("career-purpose")) reflectionPrompts.push("What kind of effort feels meaningful rather than just required?");
  if (topics.includes("emotional-patterns")) reflectionPrompts.push("What would help you feel steadier this week?");
  if (topics.includes("timing")) reflectionPrompts.push("What is one small, reversible step you could take now?");
  if (!reflectionPrompts.length) reflectionPrompts.push("What part of this reflection actually matches your experience right now?");

  return {
    directAnswer,
    themes: themeSet.slice(0, 4),
    reflectionPrompts: reflectionPrompts.slice(0, 2),
    reliabilityNote: limitations[0]?.note || null,
  };
}

// ── limitations ──────────────────────────────────────────────────────────────
export function buildLimitations({ reliability, sky }) {
  const out = [];
  if (reliability === "unknown") {
    out.push({ type: "birth-time", reliability, note: "Birth time is unknown, so Rising sign, houses, and angle-based conclusions aren't used — this answer relies on planetary signs and aspects only." });
  } else if (reliability === "approximate") {
    out.push({ type: "birth-time", reliability, note: "Birth time is approximate, so any house or angle detail may shift — treat those parts as tentative." });
  }
  if (!sky) {
    out.push({ type: "current-sky", note: "Current-sky data couldn't be loaded, so this answer uses your natal chart only (no live transits)." });
  }
  return out;
}

// ── top-level: build the full typed context ──────────────────────────────────
// active: { profile, chart } (from chartSvc.getActive) ; sky: currentSky() | null
export function buildAskContext({ active, sky, detailMode = "Simple", question = "", limit = 6 }) {
  const chart = active?.chart || null;
  const profile = active?.profile || null;
  const reliability = birthTimeReliability(chart, profile);
  const questionType = classifyQuestion(question);

  // Only compute transits when we have both a chart and a sky.
  let transits = [];
  if (chart && sky) {
    try { transits = personalTransits(sky, chart); } catch { transits = []; }
  }

  const limitations = buildLimitations({ reliability, sky });
  const evidence = chart
    ? selectEvidence({ chart, sky, transits, questionTypes: questionType, question, reliability, limit })
    : [];
  const answerPlan = buildAnswerPlan({ questionTypes: questionType, evidence, reliability, limitations });

  return {
    engineVersion: ASK_ENGINE_VERSION,
    questionType,
    activeChartId: profile?.id || null,
    activeChartName: profile?.nickname || null,
    detailMode: detailMode === "Advanced" ? "Advanced" : "Simple",
    birthTimeReliability: reliability,
    evidence,
    limitations,
    answerPlan,
  };
}

// Exposed for the presenter and tests.
export const _internal = { BODY_THEME, ELEMENT_FLAVOR, TOPIC_MAP, elementOf, modalityOf };
