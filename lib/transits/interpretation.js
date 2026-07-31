// Orbit Axis :: what a transit means, composed rather than written out.
//
// Same architecture as the Dev Update 1.5 natal corpus, and for the same
// reason: ten transiting bodies across ten natal targets across five aspects
// is five hundred paragraphs, which no one keeps consistent. Authored per
// layer, composed at read time.
//
// The natal roles are IMPORTED, not restated. Mercury means the same thing in
// My Chart and here, or the product contradicts itself.

import { PLANETS } from "../interpretation/planets.js";

/**
 * What a transiting body is doing while it passes.
 *
 * Distinct from the natal `function_`: natal Mars is what drive looks like in
 * someone, transiting Mars is what it is currently pushing on.
 */
export const TRANSIT_ACTION = Object.freeze({
  Sun: "bringing attention and visibility to",
  Moon: "passing quickly across",
  Mercury: "putting words, plans, and second thoughts around",
  Venus: "softening and drawing attention to",
  Mars: "pressing energy and urgency into",
  Jupiter: "widening the space around",
  Saturn: "asking for structure and patience from",
  Uranus: "unsettling and loosening",
  Neptune: "blurring the edges of",
  Pluto: "working slowly and deeply on",
});

/**
 * The dynamic itself. BOTH readings are authored for every aspect — the same
 * structural guard the natal corpus uses against "trines good, squares bad".
 */
export const ASPECT_DYNAMIC = Object.freeze({
  Conjunction: {
    verb: "meets",
    detail: "The two are occupying the same degree, so their themes are hard to separate for now.",
    constructive: "Concentrated attention. Whatever this pair governs is unusually easy to focus on.",
    tension: "Little distance to think from. What is amplified can be harder to see clearly.",
  },
  Opposition: {
    verb: "faces",
    detail: "They sit across the chart from each other, which tends to show a theme through contrast.",
    constructive: "Contrast makes things legible. Two sides of a question become visible at once.",
    tension: "It can feel like being pulled between two valid demands rather than choosing freely.",
  },
  Square: {
    verb: "presses on",
    detail: "A ninety-degree angle, which usually registers as friction that asks for an adjustment.",
    constructive: "Friction is what makes a change actually happen rather than stay theoretical.",
    tension: "Pressure without an obvious release. Forcing it tends to cost more than pacing it.",
  },
  Trine: {
    verb: "flows with",
    detail: "An easy angle — the two tend to cooperate without much effort being required.",
    constructive: "Support that is genuinely available, and easy to use if you reach for it.",
    tension: "Ease is easy to sleep through. Nothing here insists on being noticed.",
  },
  Sextile: {
    verb: "opens toward",
    detail: "A cooperative angle that tends to offer an opening rather than an event.",
    constructive: "A usable opportunity, usually one that responds to being acted on.",
    tension: "It asks for a first move. Left alone it often passes without much happening.",
  },
});

/** How close is close. Deterministic bands, stated as fact. */
export function intensity(orb) {
  if (!Number.isFinite(orb)) return null;
  if (orb <= 0.5) return { label: "Exact", detail: "This is as close as it gets." };
  if (orb <= 1.5) return { label: "Close", detail: "Tight enough to be one of the clearer influences right now." };
  return { label: "Wide", detail: "Within range, but not among the tightest contacts today." };
}

/**
 * The retrograde modifier — for the TRANSITING body only.
 *
 * A planet retrograde in the sky today says nothing about whether it was
 * retrograde at someone's birth, and conflating the two is a common way to be
 * confidently wrong. Natal retrograde belongs to My Chart.
 */
export const RETROGRADE_MODIFIER =
  "This transit arrives while the planet is retrograde, which tends to bring a "
  + "second pass over familiar ground — review, repetition, or reconsideration "
  + "rather than something wholly new.";

export const NEVER_RETROGRADE = Object.freeze(["Sun", "Moon"]);

/**
 * One transit's reading, composed from the layers above.
 *
 * Returns null rather than filler when a body is unknown, so a malformed entry
 * becomes a missing card instead of a sentence about nothing.
 */
export function composeTransit(t) {
  if (!t) return null;
  const action = TRANSIT_ACTION[t.transiting];
  const dynamic = ASPECT_DYNAMIC[t.aspect];
  const target = PLANETS[t.natal];
  if (!action || !dynamic || !target) return null;

  const title = `${t.transiting} ${dynamic.verb} your ${t.natal}`;
  const lead = `Transiting ${t.transiting} is ${action} your natal ${t.natal}`
             + ` — ${target.function_.toLowerCase()}.`;
  const band = intensity(t.orb);
  const detail = [dynamic.detail];
  if (band) detail.push(band.detail);
  if (t.retrograde && !NEVER_RETROGRADE.includes(t.transiting)) detail.push(RETROGRADE_MODIFIER);
  if (t.duration) detail.push(`${t.duration}.`);

  return Object.freeze({
    id: t.id,
    title,
    lead,
    detail,
    constructive: dynamic.constructive,
    tension: dynamic.tension,
    intensity: band ? band.label : null,
    targetRole: target.function_,
    source_version: CONTENT_VERSION,
  });
}

export const CONTENT_VERSION = "transit-1.0.0";

export function composeAll(list) {
  return (list || []).map((t) => {
    const reading = composeTransit(t);
    return reading ? Object.freeze({ ...t, reading }) : null;
  }).filter(Boolean);
}
