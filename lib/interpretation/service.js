// Orbit Axis :: the one place a chart becomes a reading.
//
// This is the integration layer between the calculation and the interface. The
// browser renders what this returns and composes nothing itself — that is the
// whole point of it existing. If interpretation logic ever appears in
// public/app.js again, there are two corpora that will disagree, and the one
// that disagrees will be the one nobody is testing.
//
// Everything here is pure and synchronous. No network, no model, no clock.

import { composeChart, CONTENT_VERSION } from "./compose.js";

/**
 * What the interface is allowed to say about how the chart was calculated.
 *
 * Every field is read from the stored profile, which is where `sanitizeInput`
 * records the settings actually used (see lib/charts/service.js — it sets
 * `zodiac_system` and `house_system` on every saved chart). Nothing here is
 * hardcoded, because a hardcoded "Placidus" keeps claiming Placidus on the day
 * someone adds a house-system option.
 *
 * Deliberately NOT included:
 *   - "Geocentric". The engine never states it, so neither do we.
 *   - Raw calculation/ephemeris versions in the primary context. `natal-v1`
 *     tells a reader nothing; it belongs in chart data, labelled.
 */
const ZODIAC_LABELS = Object.freeze({ tropical: "Tropical", sidereal: "Sidereal" });
const HOUSE_LABELS = Object.freeze({
  placidus: "Placidus", whole: "Whole sign", "whole-sign": "Whole sign",
  koch: "Koch", equal: "Equal",
});

export function calculationContext(chart, profile = null) {
  const rows = [];
  const zodiac = profile?.zodiac_system;
  const houses = profile?.house_system;

  if (zodiac) {
    rows.push({
      label: "Zodiac",
      value: ZODIAC_LABELS[zodiac] || titleCase(zodiac),
      help: "Signs are measured from the spring equinox.",
    });
  }
  // A house system is only a fact about this chart when houses were actually
  // calculated. Naming one on an unknown-time chart describes a calculation
  // that did not happen.
  if (houses && chart?.time_known) {
    rows.push({
      label: "House system",
      value: HOUSE_LABELS[houses] || titleCase(houses),
      help: "How the twelve life areas are divided.",
    });
  }
  if (profile?.timezone_name) {
    rows.push({
      label: "Birth timezone",
      value: profile.timezone_name,
      help: profile.utc_offset_at_birth
        ? `UTC${profile.utc_offset_at_birth} on the day you were born.`
        : null,
    });
  }
  return rows;
}

function titleCase(value) {
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The complete reading for one chart.
 *
 * Returns null for a missing chart rather than an empty shell, so the interface
 * has to decide what to show instead of silently rendering a reading about
 * nothing.
 */
export function buildChartReading(chart, profile = null) {
  if (!chart) return null;
  const composed = composeChart(chart);
  if (!composed) return null;
  return Object.freeze({
    ...composed,
    context: calculationContext(chart, profile),
    contentVersion: CONTENT_VERSION,
  });
}

export { CONTENT_VERSION };
