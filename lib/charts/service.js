// Orbit :: saved-chart service (business logic).
//
// Store-agnostic: takes a `store` implementing the interface in store.js, so the
// rules here are unit-tested against an in-memory store and run in production
// against Supabase. Never trusts a client-supplied owner_id — the caller passes
// the authenticated owner and every store call is scoped to it.

import { computeNatalChart, chartInputHash, CALCULATION_VERSION } from "../astro/natal.js";
import { EPHEMERIS_VERSION } from "../astro/ephemeris.js";
import { verifyPlaceSignature } from "../locations/geoapify.js";
import { resolveBirthTiming, timezoneForCoordinates } from "../locations/timezone.js";

export const PRIMARY_NAME = "My Chart";
const TIME_ACCURACIES = new Set(["exact", "reported", "approximate", "unknown"]);

class ChartError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}
export { ChartError };

const BIRTH_FIELDS = [
  "first_name", "last_name",
  "birth_date", "birth_time", "time_accuracy", "birthplace_name",
  "latitude", "longitude", "timezone_name", "utc_offset_at_birth",
  "birthplace_city", "birthplace_region", "birthplace_country", "birthplace_country_code",
  "geo_provider", "geo_place_id", "geo_resolved_at",
  "zodiac_system", "house_system", "notes", "relationship_type",
];
const PROFILE_NAME_FIELDS = ["first_name", "last_name"];
const ASTRO_INPUT_FIELDS = new Set([
  "birth_date", "birth_time", "time_accuracy", "birthplace_name",
  "latitude", "longitude", "timezone_name", "utc_offset_at_birth",
  "zodiac_system", "house_system", "birthplace",
]);

function cleanText(value, max = 160) {
  if (value == null) return null;
  const text = String(value).normalize("NFKC").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

function selectedPlace(input) {
  const place = input.birthplace;
  if (!place || typeof place !== "object") return null;
  const normalized = {
    provider: cleanText(place.provider, 40) || "geoapify",
    provider_place_id: cleanText(place.provider_place_id, 220),
    label: cleanText(place.label, 220),
    city: cleanText(place.city, 120),
    region: cleanText(place.region, 120),
    country: cleanText(place.country, 120),
    country_code: cleanText(place.country_code, 8)?.toLowerCase() || null,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
  if (!normalized.provider_place_id || !normalized.label) {
    throw new ChartError("invalid_input", "Choose a birthplace from the search results.");
  }
  if (!verifyPlaceSignature(normalized, place.selection_token)) {
    throw new ChartError("invalid_input", "Choose a birthplace from the search results.");
  }
  return normalized;
}

function applyResolvedPlace(out, place) {
  out.birthplace_name = place.label;
  out.latitude = place.latitude;
  out.longitude = place.longitude;
  out.birthplace_city = place.city;
  out.birthplace_region = place.region;
  out.birthplace_country = place.country;
  out.birthplace_country_code = place.country_code;
  out.geo_provider = place.provider;
  out.geo_place_id = place.provider_place_id;
  out.geo_resolved_at = new Date().toISOString();
}

function sanitizeInput(input, { base = null } = {}) {
  const source = { ...(base || {}), ...(input || {}) };
  const out = {};
  for (const f of BIRTH_FIELDS) if (source[f] !== undefined) out[f] = source[f];
  for (const f of PROFILE_NAME_FIELDS) out[f] = cleanText(out[f], 80);
  out.birthplace_name = cleanText(out.birthplace_name, 220);
  out.birthplace_city = cleanText(out.birthplace_city, 120);
  out.birthplace_region = cleanText(out.birthplace_region, 120);
  out.birthplace_country = cleanText(out.birthplace_country, 120);
  out.birthplace_country_code = cleanText(out.birthplace_country_code, 8)?.toLowerCase() || null;
  out.notes = cleanText(out.notes, 2000);
  out.relationship_type = cleanText(out.relationship_type, 80);
  const place = selectedPlace(input || {});
  if (place) applyResolvedPlace(out, place);
  if (!out.birth_date) throw new ChartError("invalid_input", "birth_date is required");
  const acc = out.time_accuracy || "unknown";
  if (!TIME_ACCURACIES.has(acc)) throw new ChartError("invalid_input", `time_accuracy must be one of ${[...TIME_ACCURACIES].join(", ")}`);
  out.time_accuracy = acc;
  if (acc === "unknown") out.birth_time = null;
  else out.birth_time = cleanText(out.birth_time, 16);
  if (out.latitude == null || out.longitude == null) throw new ChartError("invalid_input", "latitude and longitude are required");
  try {
    out.timezone_name = timezoneForCoordinates(out.latitude, out.longitude);
    const timing = resolveBirthTiming({
      birthDate: out.birth_date,
      birthTime: out.birth_time,
      timeAccuracy: out.time_accuracy,
      timezoneName: out.timezone_name,
    });
    out.utc_offset_at_birth = timing.utc_offset_at_birth;
  } catch (error) {
    throw new ChartError(error.code || "invalid_input", error.message);
  }
  out.zodiac_system = out.zodiac_system || "tropical";
  out.house_system = out.house_system || "placidus";
  return out;
}

function hasAstroInputChange(patch = {}) {
  return Object.keys(patch || {}).some((key) => ASTRO_INPUT_FIELDS.has(key));
}

async function syncProfileNames(store, ownerId, clean, profile = null) {
  if (!store.upsertProfileNames) return;
  const isPrimary = profile ? !!profile.is_primary : true;
  if (!isPrimary) return;
  const first = clean.first_name;
  const last = clean.last_name;
  if (first == null && last == null) return;
  await store.upsertProfileNames(ownerId, first, last);
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
        : cleanText(input.nickname, 120);
      if (!nickname) throw new ChartError("invalid_input", "nickname is required for saved charts");

      const row = {
        owner_id: ownerId,
        nickname,
        is_primary: autoPrimary,
        ...clean,
      };
      const profile = await store.insertProfile(row);
      if (autoPrimary) await syncProfileNames(store, ownerId, clean, profile);

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
      if (patch.birthplace !== undefined || hasAstroInputChange(allowed)) {
        Object.assign(allowed, sanitizeInput(patch, { base: profile }));
      } else {
        for (const f of PROFILE_NAME_FIELDS) if (allowed[f] !== undefined) allowed[f] = cleanText(allowed[f], 80);
        if (allowed.nickname !== undefined) allowed.nickname = cleanText(allowed.nickname, 120);
      }
      if (allowed.nickname === null || allowed.nickname === "") throw new ChartError("invalid_input", "nickname is required");
      // Never let a client flip is_primary/owner_id directly.
      const updated = await store.updateProfile(ownerId, id, { ...allowed, updated_at: new Date().toISOString() });
      await syncProfileNames(store, ownerId, updated, updated);
      const { chart } = await calculateAndCache(ownerId, updated, { force: hasAstroInputChange(patch) });
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
