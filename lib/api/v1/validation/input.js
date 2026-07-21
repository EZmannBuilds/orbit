// Orbit Axis API v1 :: input validation.
//
// Everything that arrives from a client is checked here before it reaches the
// engine. The engine validates again — defence in depth, and it is a public
// package that cannot assume a careful caller — but this layer exists to turn a
// bad request into a precise, stable error code rather than a generic one.
//
// Two rules govern this file:
//
//  1. NEVER SILENTLY REPAIR. A date of "2005-02-30" is not nudged to the 28th
//     and a latitude of 200 is not clamped to 90. Both are rejected. A chart
//     computed from repaired input is wrong in a way nobody can see, which is
//     worse than an error message.
//
//  2. NEVER ECHO PERSONAL VALUES. Error details name the FIELD that was wrong,
//     never the value it contained. A birth date in an error message ends up in
//     logs, in bug reports, and in screenshots.
//
// No validation dependency is used. Orbit has no runtime dependencies beyond
// luxon and tz-lookup, both already present, and the rules here are small
// enough that a schema library would add more surface than it removes.

import { DateTime } from "luxon";
import { HOUSE_SYSTEMS } from "@ezmannbuilds/orbit-axis-engine";
import { ApiError } from "../errors/codes.js";

/** House-system names accepted at the API edge, mapped to engine codes. */
export const HOUSE_SYSTEM_NAMES = Object.freeze({
  placidus: "P", koch: "K", porphyry: "O", regiomontanus: "R",
  campanus: "C", equal: "E", "whole-sign": "W", alcabitius: "B", morinus: "M",
});

/** The only zodiac Orbit implements. Named explicitly so a request for */
/** sidereal fails loudly instead of silently returning tropical results.  */
export const ZODIAC_TYPES = Object.freeze(["tropical"]);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_SHAPE = /^\d{2}:\d{2}(:\d{2})?$/;

function fail(code, field, message) {
  throw new ApiError(code, { message, details: { field } });
}

/**
 * A real calendar date in YYYY-MM-DD.
 * Rejects impossible dates: Luxon resolves 2005-02-30 as invalid rather than
 * rolling it forward, which is exactly the behaviour wanted here.
 */
export function validateBirthDate(value, field = "birthDate") {
  if (typeof value !== "string" || !DATE_SHAPE.test(value)) {
    fail("INVALID_DATE", field, "Enter a date as YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const dt = DateTime.fromObject({ year, month, day }, { zone: "utc" });
  if (!dt.isValid) fail("INVALID_DATE", field, "That is not a real calendar date.");
  // The bundled ephemeris covers roughly 1800–2400. Outside it the engine
  // would return unreliable positions, so refuse rather than mislead.
  if (year < 1800 || year > 2400) {
    fail("INVALID_DATE", field, "Orbit can calculate charts for years between 1800 and 2400.");
  }
  return { year, month, day };
}

/** A wall-clock time in HH:MM or HH:MM:SS. */
export function validateBirthTime(value, field = "birthTime") {
  if (typeof value !== "string" || !TIME_SHAPE.test(value)) {
    fail("INVALID_TIME", field, "Enter a time as HH:MM.");
  }
  const [hour, minute, second = 0] = value.split(":").map(Number);
  if (hour > 23 || minute > 59 || second > 59) {
    fail("INVALID_TIME", field, "That is not a valid time of day.");
  }
  return { hour, minute, second };
}

/**
 * An IANA zone name. Validated against the platform's own zone database via
 * Luxon rather than a hand-maintained list, so it stays correct as zones change.
 */
export function validateTimezone(value, field = "timezone") {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_TIMEZONE", field, "Provide a time zone, for example America/Chicago.");
  }
  const zone = value.trim();
  if (!DateTime.local().setZone(zone).isValid) {
    fail("INVALID_TIMEZONE", field, "That time zone was not recognised. Use an IANA name such as Europe/London.");
  }
  return zone;
}

export function validateLatitude(value, field = "latitude") {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -90 || value > 90) {
    fail("INVALID_COORDINATES", field, "Latitude must be a number between -90 and 90.");
  }
  return value;
}

export function validateLongitude(value, field = "longitude") {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -180 || value > 180) {
    fail("INVALID_COORDINATES", field, "Longitude must be a number between -180 and 180.");
  }
  return value;
}

/** Allow-list, returning the engine's single-letter code. */
export function validateHouseSystem(value, field = "houseSystem") {
  if (value === undefined || value === null) return "placidus";
  if (typeof value !== "string" || !(value.toLowerCase() in HOUSE_SYSTEM_NAMES)) {
    throw new ApiError("UNSUPPORTED_HOUSE_SYSTEM", {
      message: `Supported house systems: ${Object.keys(HOUSE_SYSTEM_NAMES).join(", ")}.`,
      details: { field },
    });
  }
  const name = value.toLowerCase();
  const code = HOUSE_SYSTEM_NAMES[name];
  // Belt and braces: the engine keeps its own allow-list, and the two must not
  // silently diverge.
  if (!HOUSE_SYSTEMS.includes(code)) {
    throw new ApiError("UNSUPPORTED_HOUSE_SYSTEM", { details: { field } });
  }
  return name;
}

export function validateZodiacType(value, field = "zodiacType") {
  if (value === undefined || value === null) return "tropical";
  if (typeof value !== "string" || !ZODIAC_TYPES.includes(value.toLowerCase())) {
    throw new ApiError("UNSUPPORTED_ZODIAC_TYPE", {
      message: `Orbit currently calculates ${ZODIAC_TYPES.join(", ")} charts only.`,
      details: { field },
    });
  }
  return value.toLowerCase();
}

/** An ISO-8601 instant for a transit calculation. */
export function validateInstant(value, field = "at") {
  if (value === undefined || value === null) return new Date();
  if (typeof value !== "string") fail("INVALID_DATE", field, "Provide an ISO-8601 timestamp.");
  const dt = DateTime.fromISO(value, { zone: "utc" });
  if (!dt.isValid) fail("INVALID_DATE", field, "Provide a valid ISO-8601 timestamp, for example 2026-07-21T12:00:00Z.");
  const year = dt.year;
  if (year < 1800 || year > 2400) {
    fail("INVALID_DATE", field, "Orbit can calculate for years between 1800 and 2400.");
  }
  return dt.toJSDate();
}

/**
 * A full birth input as the v1 contract defines it.
 *
 * `birthTimeKnown: false` is a first-class case, not an error: Orbit computes
 * planetary positions from a noon default and withholds houses and angles,
 * which is the honest treatment. When the time is unknown, `birthTime` is
 * ignored rather than rejected — a client may keep a stale value in a form.
 *
 * @param {object} body
 * @param {{ prefix?: string }} [options] field-name prefix for synastry (chartA./chartB.)
 */
export function validateBirthInput(body, { prefix = "" } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("INVALID_INPUT", {
      message: "Provide birth details.",
      details: { field: prefix ? prefix.replace(/\.$/, "") : "body" },
    });
  }
  const f = (name) => `${prefix}${name}`;

  const date = validateBirthDate(body.birthDate, f("birthDate"));
  const timeKnown = body.birthTimeKnown !== false;
  const time = timeKnown ? validateBirthTime(body.birthTime, f("birthTime")) : null;
  const timezone = validateTimezone(body.timezone, f("timezone"));
  const latitude = validateLatitude(body.latitude, f("latitude"));
  const longitude = validateLongitude(body.longitude, f("longitude"));
  const houseSystem = validateHouseSystem(body.houseSystem, f("houseSystem"));
  const zodiacType = validateZodiacType(body.zodiacType, f("zodiacType"));

  // Resolve the UTC offset that applied at that place on that date. This is why
  // a zone name is required rather than a raw offset: historical daylight-saving
  // rules differ, and "-05:00" is not a fact about a date, it is a guess.
  const local = DateTime.fromObject(
    { year: date.year, month: date.month, day: date.day, hour: time ? time.hour : 12, minute: time ? time.minute : 0 },
    { zone: timezone },
  );
  if (!local.isValid) {
    fail("INVALID_TIME", f("birthTime"),
      "That date and time do not exist in the chosen time zone — it may fall in a daylight-saving gap.");
  }

  return {
    birthDate: `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`,
    birthTime: time ? `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}` : null,
    birthTimeKnown: timeKnown,
    timezone,
    latitude,
    longitude,
    houseSystem,
    zodiacType,
    utcOffsetMinutes: local.offset,
  };
}

/** Translate a validated v1 input into the engine's profile shape. */
export function toEngineProfile(input) {
  const sign = input.utcOffsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(input.utcOffsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return {
    birth_date: input.birthDate,
    birth_time: input.birthTime,
    time_accuracy: input.birthTimeKnown ? "exact" : "unknown",
    latitude: input.latitude,
    longitude: input.longitude,
    utc_offset_at_birth: offset,
    house_system: input.houseSystem,
  };
}
