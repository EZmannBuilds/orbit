// Orbit Axis :: canonical sky + local-day contract (Dev Update 1.1).
//
// The engine owns astronomy. This application layer adds the user's explicit
// IANA timezone, stable local-day key, and local renderings of the engine's next
// lunar-event instants. It never calculates a phase in the browser and never
// substitutes the server machine's timezone.

import { DateTime } from "luxon";
import {
  currentSky,
  nextLunarEvents,
  engineVersion,
  CONTRACT_VERSION,
  EPHEMERIS_VERSION,
} from "@ezmannbuilds/orbit-axis-engine";
import { isValidIanaTimezone } from "../locations/timezone.js";

export const CURRENT_SKY_CONTEXT_VERSION = "current-sky-context-v1";
export const UTC_FALLBACK_TIMEZONE = "UTC";

/**
 * Resolve the current browsing timezone without consulting the host process.
 *
 * A birth timezone may be used as an explicit last-resort fallback for an
 * existing chart. If neither input is valid, UTC is returned and labelled as a
 * fallback; callers can tell the user rather than silently implying UTC is
 * local.
 */
export function resolveSkyTimezone({
  timezoneName = null,
  timezoneSource = null,
  fallbackTimezone = null,
} = {}) {
  if (isValidIanaTimezone(timezoneName)) {
    return {
      name: timezoneName,
      source: timezoneSource || "request",
      fallback: false,
    };
  }
  if (isValidIanaTimezone(fallbackTimezone)) {
    return {
      name: fallbackTimezone,
      source: "birth_timezone_fallback",
      fallback: true,
    };
  }
  return {
    name: UTC_FALLBACK_TIMEZONE,
    source: "utc_fallback",
    fallback: true,
  };
}

function validInstant(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new TypeError("CurrentSkyContext requires a valid instant");
    error.code = "invalid_input";
    throw error;
  }
  return date;
}

function localFields(instantUtc, timezoneName) {
  const local = DateTime.fromISO(instantUtc, { zone: "utc" }).setZone(timezoneName);
  if (!local.isValid) {
    const error = new TypeError("CurrentSkyContext could not format the requested timezone");
    error.code = "invalid_timezone";
    throw error;
  }
  return {
    local_date: local.toISODate(),
    local_time_iso: local.toISO(),
  };
}

function localEvent(event, timezoneName) {
  const local = localFields(event.instant_utc, timezoneName);
  return {
    kind: event.kind,
    instant_utc: event.instant_utc,
    ...local,
  };
}

/**
 * Build the one contract consumed by Home, Fortune, History, Positions,
 * Transits, Ask evidence, and public sky endpoints.
 */
export function createCurrentSkyContext({
  at = new Date(),
  timezoneName = null,
  timezoneSource = null,
  fallbackTimezone = null,
  skySnapshot = null,
  lunarEventsSnapshot = null,
} = {}) {
  const instant = validInstant(at);
  const timezone = resolveSkyTimezone({ timezoneName, timezoneSource, fallbackTimezone });
  const sky = skySnapshot || currentSky(instant);
  const lunarEvents = lunarEventsSnapshot || nextLunarEvents(instant);
  const local = localFields(sky.instant_utc, timezone.name);
  const nextFullMoon = localEvent(lunarEvents.full_moon, timezone.name);
  const nextNewMoon = localEvent(lunarEvents.new_moon, timezone.name);

  return {
    context_version: CURRENT_SKY_CONTEXT_VERSION,
    calculated_at_utc: sky.instant_utc,
    user_timezone: timezone.name,
    timezone_name: timezone.name,
    timezone_source: timezone.source,
    timezone_fallback: timezone.fallback,
    local_date: local.local_date,
    local_date_time: local.local_time_iso,
    // Compatibility name retained for the current web client.
    local_time_iso: local.local_time_iso,

    moon_phase_name: sky.moon.phase_name,
    moon_phase_fraction: sky.moon.phase_fraction,
    illumination_percent: sky.moon.illumination_percent,
    is_waxing: sky.moon.waxing,
    next_full_moon: nextFullMoon,
    next_new_moon: nextNewMoon,
    zodiac_season: sky.zodiac_season,
    planetary_positions: sky.planets,

    // Existing engine shape stays additive so older consumers can migrate
    // without a flag day. These are the same facts, not a second calculation.
    sky_version: sky.sky_version,
    instant_utc: sky.instant_utc,
    sun: sky.sun,
    moon: sky.moon,
    dominant_element: sky.dominant_element,
    retrogrades: sky.retrogrades,
    aspects: sky.aspects,
    planets: sky.planets,
    snapshot_hash: sky.snapshot_hash,

    source: {
      calculation: "orbit-axis-engine",
      engine_version: engineVersion(),
      contract_version: CONTRACT_VERSION,
      ephemeris: EPHEMERIS_VERSION,
      sky_version: sky.sky_version,
      lunar_events_version: lunarEvents.events_version,
    },
  };
}

