// Orbit Axis :: deterministic interpretation composition.
//
// Turns a calculated chart into readable explanations by combining authored
// layers. Every function here is PURE: same chart in, same words out, for ever.
// No randomness, no clock, no network, no model. That is the whole contract,
// and `test/interpretation-compose.test.js` holds it.
//
// Composition order is always Planet → Sign → House, because that is the order
// the sentence has to be read in to make sense: what is operating, how it
// expresses itself, where it is felt.

import { PLANETS, PLANET_ORDER, planetMeaning } from "./planets.js";
import { SIGNS, signMeaning } from "./signs.js";
import { houseMeaning } from "./houses.js";
import { ASPECTS, aspectMeaning, rankAspects, ASPECT_HIGHLIGHT_COUNT } from "./aspects.js";
import {
  ELEMENTS, MODALITIES, RETROGRADE, NEVER_RETROGRADE, ANGLES,
  isMeaningfullyDominant, leastRepresented,
} from "./patterns.js";
import { chartLimitation } from "./limitations.js";

export const CONTENT_VERSION = "1.0.0";

/** "24° 54′ Gemini" — the degree within the sign, which is what astrology means. */
export function formatPosition(body) {
  if (!body || !body.sign) return "";
  const deg = Number.isFinite(body.degrees) ? body.degrees : 0;
  const min = Number.isFinite(body.minutes) ? String(body.minutes).padStart(2, "0") : "00";
  return `${deg}° ${min}′ ${body.sign}`;
}

/**
 * One planet's explanation.
 *
 * `house` is omitted entirely when the engine did not supply one — not rendered
 * as "unknown", not defaulted. An absent house is absent.
 */
export function composePlacement(planetName, chart) {
  const planet = planetMeaning(planetName);
  const body = chart?.planets?.[planetName];
  if (!planet || !body) return null;

  const sign = signMeaning(body.sign);
  const houseNumber = chart?.planet_houses?.[planetName];
  const house = houseNumber ? houseMeaning(houseNumber) : null;
  const retrograde = body.retrograde === true && !NEVER_RETROGRADE.includes(planetName);

  // Three clauses, each from a different layer, in reading order. Authored
  // templates rather than concatenated fragments — the punctuation and the
  // connective words are part of the content, not an accident of joining.
  const lead = `${planet.name} describes ${planet.function_.toLowerCase()}.`;
  const expression = sign
    ? `In ${sign.name}, it expresses this ${sign.expression}.`
    : "";
  const placement = house
    ? `In the ${ordinal(house.number)} house, it is felt through ${house.area}.`
    : "";

  const summary = [lead, expression, placement].filter(Boolean).join(" ");

  const detail = [planet.core];
  if (sign) {
    detail.push(`Working through ${sign.name}, this function tends to operate ${sign.manner}.`);
  }
  if (house) detail.push(house.detail);
  if (retrograde) {
    detail.push(RETROGRADE.byPlanet[planetName] || RETROGRADE.general);
  }

  return Object.freeze({
    id: `${planet.id}-${sign ? sign.id : "unknown"}${house ? `-h${house.number}` : ""}`,
    planet: planet.name,
    function_: planet.function_,
    sign: body.sign,
    position: formatPosition(body),
    house: house ? house.number : null,
    houseTitle: house ? house.title : null,
    retrograde,
    summary,
    detail,
    strength: sign ? sign.strength : null,
    growth: sign ? sign.growth : null,
    retrogradeNote: retrograde ? RETROGRADE.notTransit : null,
    source_version: CONTENT_VERSION,
  });
}

function ordinal(n) {
  const names = ["", "first", "second", "third", "fourth", "fifth", "sixth",
                 "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
  return names[n] || `${n}th`;
}

/** Every supported planet, in a stable order. */
export function composeAllPlacements(chart) {
  return PLANET_ORDER.map((name) => composePlacement(name, chart)).filter(Boolean);
}

/**
 * The Big Three.
 *
 * Rising is included only when the engine actually returned an Ascendant. When
 * it did not, the entry carries `unavailable: true` and the reason — never a
 * sign derived from the noon fallback.
 */
export function composeBigThree(chart) {
  const out = [];
  for (const key of ["Sun", "Moon"]) {
    const placement = composePlacement(key, chart);
    if (placement) out.push({ ...placement, role: key === "Sun" ? "Identity" : "Inner life" });
  }
  const asc = chart?.angles?.ascendant;
  if (asc && asc.sign) {
    const sign = signMeaning(asc.sign);
    out.push(Object.freeze({
      id: `rising-${sign ? sign.id : "unknown"}`,
      planet: ANGLES.Ascendant.name,
      function_: "Approach and first impression",
      role: "Approach",
      sign: asc.sign,
      position: formatPosition(asc),
      house: null,
      retrograde: false,
      summary: `Your Rising sign is ${asc.sign}.`
             + (sign ? ` You tend to meet new situations ${sign.expression}.` : ""),
      detail: [ANGLES.Ascendant.core, ...(sign ? [`Led by ${sign.name}, that approach works ${sign.manner}.`] : [])],
      strength: sign ? sign.strength : null,
      growth: sign ? sign.growth : null,
      source_version: CONTENT_VERSION,
    }));
  } else {
    out.push(Object.freeze({
      id: "rising-unavailable",
      planet: ANGLES.Ascendant.name,
      role: "Approach",
      unavailable: true,
      reason: "A reliable birth time is needed to calculate the Ascendant.",
      source_version: CONTENT_VERSION,
    }));
  }
  return out;
}

/** Ranked aspects with authored copy. See aspects.js for the ranking rules. */
export function composeAspects(chart, { limit = ASPECT_HIGHLIGHT_COUNT } = {}) {
  const ranked = rankAspects(chart?.aspects || []);
  const all = ranked.map((a) => {
    const meaning = aspectMeaning(a.aspect);
    if (!meaning) return null;
    return Object.freeze({
      id: `${a.a}-${a.aspect}-${a.b}`.toLowerCase(),
      a: a.a, b: a.b, aspect: a.aspect,
      orb: Number.isFinite(a.orb) ? a.orb : null,
      orbLabel: Number.isFinite(a.orb) ? `${a.orb.toFixed(1)}° orb` : "",
      headline: `${a.a} and ${a.b} ${meaning.interaction}.`,
      detail: meaning.detail,
      constructive: meaning.constructive,
      tension: meaning.tension,
      source_version: CONTENT_VERSION,
    });
  }).filter(Boolean);
  return { highlights: all.slice(0, limit), all };
}

/** Element and modality copy, honest about flat distributions. */
export function composePatterns(chart) {
  const out = { element: null, modality: null };

  const eb = chart?.element_balance;
  if (eb?.percentages) {
    const dominant = isMeaningfullyDominant(eb.percentages, eb.dominant) ? eb.dominant : null;
    const light = leastRepresented(eb.percentages);
    out.element = Object.freeze({
      counts: eb.counts, percentages: eb.percentages,
      dominant,
      balanced: !dominant,
      summary: dominant
        ? `${dominant} is the most emphasised element in this chart — ${ELEMENTS[dominant]?.short}.`
        : "No single element clearly dominates this chart; the four are fairly evenly spread.",
      detail: dominant ? ELEMENTS[dominant]?.emphasised : null,
      lighter: light ? { element: light, detail: ELEMENTS[light]?.lighter } : null,
      source_version: CONTENT_VERSION,
    });
  }

  const mb = chart?.modality_balance;
  if (mb?.percentages) {
    const dominant = isMeaningfullyDominant(mb.percentages, mb.dominant) ? mb.dominant : null;
    out.modality = Object.freeze({
      counts: mb.counts, percentages: mb.percentages,
      dominant,
      balanced: !dominant,
      summary: dominant
        ? `This chart leans ${dominant} — it ${MODALITIES[dominant]?.verb}.`
        : "Cardinal, Fixed, and Mutable are fairly evenly represented here.",
      detail: dominant ? MODALITIES[dominant]?.emphasised : null,
      growth: dominant ? MODALITIES[dominant]?.growth : null,
      source_version: CONTENT_VERSION,
    });
  }

  return out;
}

/**
 * A short deterministic overview, composed from chart facts only.
 *
 * This is the closest thing to a "personality paragraph" the product has, and
 * it is assembled from named placements rather than written about a person. It
 * must never read as though something judged the reader.
 */
export function composeOverview(chart) {
  const parts = [];
  const sun = chart?.planets?.Sun;
  const moon = chart?.planets?.Moon;
  const asc = chart?.angles?.ascendant;

  if (sun?.sign && moon?.sign) {
    parts.push(`A ${sun.sign} Sun with a ${moon.sign} Moon`
      + (asc?.sign ? ` and ${asc.sign} rising.` : "."));
  }
  const patterns = composePatterns(chart);
  if (patterns.element?.dominant) {
    parts.push(`The chart leans ${patterns.element.dominant.toLowerCase()} — ${ELEMENTS[patterns.element.dominant].short}.`);
  } else if (patterns.element) {
    parts.push("The elements are evenly spread rather than concentrated.");
  }
  if (patterns.modality?.dominant) {
    parts.push(`Its overall rhythm ${MODALITIES[patterns.modality.dominant].verb}.`);
  }
  const retro = (chart?.retrogrades || []).filter((r) => !NEVER_RETROGRADE.includes(r));
  if (retro.length >= 3) {
    parts.push(`${retro.length} planets were retrograde at birth, which tends to turn those functions inward first.`);
  }
  return parts.join(" ");
}

/** Everything My Chart needs, composed once. */
export function composeChart(chart) {
  if (!chart) return null;
  return Object.freeze({
    overview: composeOverview(chart),
    bigThree: composeBigThree(chart),
    placements: composeAllPlacements(chart),
    aspects: composeAspects(chart),
    patterns: composePatterns(chart),
    limitation: chartLimitation(chart),
    retrogrades: (chart.retrogrades || []).filter((r) => !NEVER_RETROGRADE.includes(r)),
    calculationVersion: chart.calculation_version || null,
    contentVersion: CONTENT_VERSION,
  });
}
