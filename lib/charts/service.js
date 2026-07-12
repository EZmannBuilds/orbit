// Orbit :: saved-chart service (business logic).
//
// Store-agnostic: takes a `store` implementing the interface in store.js, so the
// rules here are unit-tested against an in-memory store and run in production
// against Supabase. Never trusts a client-supplied owner_id — the caller passes
// the authenticated owner and every store call is scoped to it.

import { computeNatalChart, chartInputHash, CALCULATION_VERSION } from "../astro/natal.js";
import { EPHEMERIS_VERSION } from "../astro/ephemeris.js";

export const PRIMARY_NAME = "My Chart";
const TIME_ACCURACIES = new Set(["exact", "reported", "approximate", "unknown"]);

class ChartError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}
export { ChartError };

const BIRTH_FIELDS = [
  "birth_date", "birth_time", "time_accuracy", "birthplace_name",
  "latitude", "longitude", "timezone_name", "utc_offset_at_birth",
  "zodiac_system", "house_system", "notes", "relationship_type",
];

function sanitizeInput(input) {
  const out = {};
  for (const f of BIRTH_FIELDS) if (input[f] !== undefined) out[f] = input[f];
  if (!out.birth_date) throw new ChartError("invalid_input", "birth_date is required");
  const acc = out.time_accuracy || "unknown";
  if (!TIME_ACCURACIES.has(acc)) throw new ChartError("invalid_input", `time_accuracy must be one of ${[...TIME_ACCURACIES].join(", ")}`);
  out.time_accuracy = acc;
  if (out.latitude == null || out.longitude == null) throw new ChartError("invalid_input", "latitude and longitude are required");
  out.zodiac_system = out.zodiac_system || "tropical";
  out.house_system = out.house_system || "placidus";
  return out;
}

// A compact summary attached to each chart for the saved-charts panel.
function summarize(chart) {
  return {
    sun: chart.big_three.sun?.sign || null,
    moon: chart.big_three.moon?.sign || null,
    rising: chart.big_three.rising?.unavailable ? null : chart.big_three.rising?.sign || null,
    time_known: chart.time_known,
  };
}

// Stateless natal calculation — no persistence, no auth. Powers the "enter
// birth details → see chart" preview and the My Chart panel before sign-in.
export function previewChart(input) {
  const clean = sanitizeInput(input);
  return computeNatalChart(clean);
}

export function createChartService(store) {
  async function calculateAndCache(ownerId, profile, { force = false } = {}) {
    const input_hash = chartInputHash(profile);
    if (!force) {
      const cached = await store.getCalculation(profile.id, CALCULATION_VERSION, input_hash);
      if (cached) return { chart: cached.chart_data, cached: true, calculation: cached };
    }
    const chart = computeNatalChart(profile);
    const row = {
      birth_profile_id: profile.id,
      calculation_version: CALCULATION_VERSION,
      ephemeris_version: EPHEMERIS_VERSION,
      input_hash,
      calculated_at: new Date().toISOString(),
      chart_data: chart,
      source_hash: input_hash,
      calculation_status: chart.calculation_status,
      warnings: chart.warnings,
    };
    let calculation = null;
    try { calculation = await store.insertCalculation(row); } catch { /* cache write best-effort */ }
    return { chart, cached: false, calculation };
  }

  return {
    async list(ownerId) {
      const [profiles, activeId] = await Promise.all([store.listProfiles(ownerId), store.getActiveId(ownerId)]);
      const withSummary = [];
      for (const p of profiles) {
        const { chart } = await calculateAndCache(ownerId, p);
        withSummary.push({ ...p, is_active: p.id === activeId, summary: summarize(chart) });
      }
      return { charts: withSummary, active_chart_id: activeId };
    },

    async get(ownerId, id) {
      const profile = await store.getProfile(ownerId, id);
      if (!profile) throw new ChartError("not_found", "chart not found");
      const { chart, cached } = await calculateAndCache(ownerId, profile);
      const activeId = await store.getActiveId(ownerId);
      return { profile, chart, cached, is_active: profile.id === activeId };
    },

    async create(ownerId, input) {
      const clean = sanitizeInput(input);
      const existing = await store.listProfiles(ownerId);
      const hasPrimary = existing.some((p) => p.is_primary);
      const isFirst = existing.length === 0;

      // First chart (and none primary yet) becomes "My Chart" automatically.
      const autoPrimary = isFirst && !hasPrimary;
      const nickname = autoPrimary
        ? PRIMARY_NAME
        : (input.nickname && String(input.nickname).trim()) || "Untitled Chart";

      const row = {
        owner_id: ownerId,
        nickname,
        is_primary: autoPrimary,
        ...clean,
      };
      const profile = await store.insertProfile(row);

      // First chart (or no active set) becomes active.
      const activeId = await store.getActiveId(ownerId);
      if (autoPrimary || !activeId) await store.setActiveId(ownerId, profile.id);

      const { chart } = await calculateAndCache(ownerId, profile, { force: true });
      return { profile, chart, became_primary: autoPrimary };
    },

    async update(ownerId, id, patch) {
      const profile = await store.getProfile(ownerId, id);
      if (!profile) throw new ChartError("not_found", "chart not found");
      const allowed = {};
      for (const f of [...BIRTH_FIELDS, "nickname"]) if (patch[f] !== undefined) allowed[f] = patch[f];
      // Never let a client flip is_primary/owner_id directly.
      const updated = await store.updateProfile(ownerId, id, { ...allowed, updated_at: new Date().toISOString() });
      // birth details may have changed → recalculate (cache keyed by input_hash makes this cheap when unchanged).
      const { chart } = await calculateAndCache(ownerId, updated, { force: true });
      return { profile: updated, chart };
    },

    async activate(ownerId, id) {
      const profile = await store.getProfile(ownerId, id);
      if (!profile) throw new ChartError("not_found", "chart not found");
      await store.setActiveId(ownerId, id);
      return { active_chart_id: id };
    },

    async remove(ownerId, id, { confirmEmpty = false } = {}) {
      const profile = await store.getProfile(ownerId, id);
      if (!profile) throw new ChartError("not_found", "chart not found");
      const all = await store.listProfiles(ownerId);
      if (all.length <= 1 && !confirmEmpty) {
        throw new ChartError("last_chart", "Deleting your only chart leaves an empty state — you'll need to add a new chart before Orbit can show a fortune or My Chart. Re-send with confirmEmpty to proceed.");
      }
      const activeId = await store.getActiveId(ownerId);
      await store.deleteProfile(ownerId, id);

      let newActive = activeId;
      if (activeId === id) {
        const remaining = all.filter((p) => p.id !== id);
        // Safe replacement: prefer the primary "My Chart", else most recent.
        const primary = remaining.find((p) => p.is_primary);
        const replacement = primary || remaining[remaining.length - 1] || null;
        newActive = replacement ? replacement.id : null;
        await store.setActiveId(ownerId, newActive);
      }
      return { deleted: id, active_chart_id: newActive, empty: newActive === null };
    },

    async calculate(ownerId, id, opts = {}) {
      const profile = await store.getProfile(ownerId, id);
      if (!profile) throw new ChartError("not_found", "chart not found");
      return calculateAndCache(ownerId, profile, opts);
    },

    async getActive(ownerId) {
      const activeId = await store.getActiveId(ownerId);
      if (!activeId) return null;
      const profile = await store.getProfile(ownerId, activeId);
      if (!profile) return null;
      const { chart } = await calculateAndCache(ownerId, profile);
      return { profile, chart };
    },
  };
}
