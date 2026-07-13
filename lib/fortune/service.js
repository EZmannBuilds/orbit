// Orbit Axis :: daily-fortune service.
//
// Orchestrates: compute natal chart + current sky (deterministic, local Swiss
// Ephemeris) -> compose fortune (deterministic) -> return the stored fortune if
// one already exists for (chart, local date, engine version), else persist and
// return. Store-agnostic so the caching logic is unit-tested with an in-memory
// store and runs in production against Supabase.

import { computeNatalChart, chartInputHash } from "../astro/natal.js";
import { currentSky } from "../astro/current-sky.js";
import { composeFortune, localDateForZone, FORTUNE_ENGINE_VERSION } from "./engine.js";
import { isValidIanaTimezone } from "../locations/timezone.js";

export const DETAIL_LEVELS = ["Simple", "Balanced", "Advanced"];
export const DEFAULT_DETAIL = "Simple";
export const CURRENT_TIMEZONE_SOURCES = ["device", "geolocation"];
export const DEFAULT_CURRENT_TIMEZONE = "UTC";

class FortuneError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}
export { FortuneError };

// Map a composed fortune into a daily_fortunes row.
function toRow(owner, profile, f) {
  return {
    owner_id: owner,
    birth_profile_id: profile.id,
    fortune_date: f.fortune_date,
    timezone_name: f.timezone_name,
    fortune_engine_version: f.fortune_engine_version,
    seed_hash: f.seed_hash,
    sky_snapshot: f.sky_snapshot,
    mood: f.mood, love_reading: f.love_reading, luck_reading: f.luck_reading, watch_out: f.watch_out,
    lucky_number: f.lucky_number,
    lucky_color_name: f.lucky_color.name, lucky_color_value: f.lucky_color.value,
    factors: f.factors,
  };
}

// Normalize a stored row back into the fortune shape the UI expects.
function fromRow(row) {
  return {
    fortune_engine_version: row.fortune_engine_version,
    fortune_date: row.fortune_date,
    timezone_name: row.timezone_name,
    chart_id: row.birth_profile_id,
    seed_hash: row.seed_hash,
    sky_snapshot: row.sky_snapshot,
    mood: row.mood, love_reading: row.love_reading, luck_reading: row.luck_reading, watch_out: row.watch_out,
    lucky_number: row.lucky_number,
    lucky_color: { name: row.lucky_color_name, value: row.lucky_color_value },
    factors: row.factors,
  };
}

// Compose a fortune for a saved chart profile at an instant (no persistence).
// `currentTimezoneName` is the user's *current* (browsing) timezone — it
// decides which local calendar day "today" is. It never touches the natal
// chart calculation (birth timezone stays fixed to the birthplace/birth time).
export function fortuneForProfile(profile, now = new Date(), currentTimezoneName = null) {
  const chart = computeNatalChart(profile);
  const sky = currentSky(now);
  const timezoneName = (currentTimezoneName && isValidIanaTimezone(currentTimezoneName))
    ? currentTimezoneName
    : (profile.timezone_name || DEFAULT_CURRENT_TIMEZONE);
  const localDate = localDateForZone(now, timezoneName);
  return composeFortune({
    chart, sky, localDate, timezoneName,
    chartId: profile.id, chartInputHash: chartInputHash(profile),
  });
}

export function createFortuneService(store) {
  return {
    // Return today's fortune for a saved chart, using the cache when present.
    async today(owner, profile, now = new Date(), currentTimezoneName = null) {
      if (!profile?.id) throw new FortuneError("no_chart", "no active chart");
      const composed = fortuneForProfile(profile, now, currentTimezoneName);
      const cached = await store.getFortune(profile.id, composed.fortune_date, FORTUNE_ENGINE_VERSION);
      if (cached) return { fortune: fromRow(cached), cached: true };
      let saved = null;
      try { saved = await store.insertFortune(toRow(owner, profile, composed)); } catch { /* cache best-effort */ }
      return { fortune: saved ? fromRow(saved) : composed, cached: false };
    },

    async history(owner, { birthProfileId = null, limit = 30 } = {}) {
      const rows = await store.listHistory(owner, { birthProfileId, limit });
      return rows.map(fromRow);
    },

    async getDetail(owner) {
      const level = await store.getDetailLevel(owner);
      return DETAIL_LEVELS.includes(level) ? level : DEFAULT_DETAIL;
    },

    async setDetail(owner, level) {
      if (!DETAIL_LEVELS.includes(level)) throw new FortuneError("invalid_detail", `detail must be one of ${DETAIL_LEVELS.join(", ")}`);
      await store.setDetailLevel(owner, level);
      return { astrology_detail_level: level };
    },

    async getCurrentTimezone(owner) {
      const row = await store.getCurrentTimezone(owner);
      const name = row?.current_timezone_name;
      return {
        timezone_name: name && isValidIanaTimezone(name) ? name : DEFAULT_CURRENT_TIMEZONE,
        source: row?.current_timezone_source || null,
        updated_at: row?.current_timezone_updated_at || null,
        persisted: !!name,
      };
    },

    async setCurrentTimezone(owner, { timezone_name, source } = {}) {
      if (!isValidIanaTimezone(timezone_name)) {
        throw new FortuneError("invalid_timezone", "timezone_name must be a valid IANA timezone (e.g. \"America/New_York\").");
      }
      const cleanSource = CURRENT_TIMEZONE_SOURCES.includes(source) ? source : "device";
      await store.setCurrentTimezone(owner, { name: timezone_name, source: cleanSource });
      return { timezone_name, source: cleanSource };
    },
  };
}
