import tzLookup from "tz-lookup";
import { DateTime } from "luxon";

export class TimezoneError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function validateCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new TimezoneError("invalid_coordinates", "Latitude is invalid.");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new TimezoneError("invalid_coordinates", "Longitude is invalid.");
  return { latitude: lat, longitude: lon };
}

export function timezoneForCoordinates(latitude, longitude) {
  const coords = validateCoordinates(latitude, longitude);
  let zone = "";
  try { zone = tzLookup(coords.latitude, coords.longitude); }
  catch { throw new TimezoneError("timezone_unresolved", "Could not resolve a timezone for that place."); }
  if (!zone || !DateTime.local().setZone(zone).isValid) {
    throw new TimezoneError("timezone_unresolved", "Could not resolve a valid timezone for that place.");
  }
  return zone;
}

// Named IANA zones are either "UTC" or "Area/Location[/Sublocation]" — this
// rejects fixed-offset strings ("+05:00", "UTC+5") that Luxon would otherwise
// happily resolve, since we never want to store a manually typed UTC offset.
const IANA_ZONE_NAME_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/;

// Validate an arbitrary client-supplied IANA zone name (e.g. from
// Intl.DateTimeFormat().resolvedOptions().timeZone). Never trusts the string
// without checking Luxon can actually resolve it — rejects offsets, made-up
// names, and empty input alike.
export function isValidIanaTimezone(name) {
  if (!name || typeof name !== "string" || name.length > 100) return false;
  if (name !== "UTC" && !IANA_ZONE_NAME_RE.test(name)) return false;
  return DateTime.local().setZone(name).isValid;
}

export function validateCurrentTimezone(name) {
  if (!isValidIanaTimezone(name)) {
    throw new TimezoneError("invalid_timezone", "That is not a recognized IANA timezone (e.g. \"America/New_York\").");
  }
  return name;
}

export function offsetString(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export function resolveBirthTiming({ birthDate, birthTime, timeAccuracy, timezoneName }) {
  const accuracy = timeAccuracy || "unknown";
  if (!birthDate) throw new TimezoneError("invalid_birth_date", "Birth date is required.");
  const noon = DateTime.fromISO(`${birthDate}T12:00:00`, { zone: timezoneName });
  if (!noon.isValid) throw new TimezoneError("invalid_birth_date", "Birth date could not be interpreted for that timezone.");
  if (accuracy === "unknown" || !birthTime) {
    return {
      timezone_name: timezoneName,
      utc_offset_at_birth: offsetString(noon.offset),
      utc_offset_minutes: noon.offset,
      utc_instant: null,
      dst_state: noon.isInDST ? "dst" : "standard",
      time_known: false,
    };
  }
  const [year, month, day] = String(birthDate).split("-").map(Number);
  const [hour, minute] = String(birthTime).split(":").map(Number);
  const local = DateTime.fromObject({ year, month, day, hour, minute }, { zone: timezoneName });
  if (!local.isValid) {
    throw new TimezoneError("nonexistent_local_time", "That local birth time does not exist in the selected timezone. Check daylight-saving time and choose a valid local time.");
  }
  if (local.year !== year || local.month !== month || local.day !== day || local.hour !== hour || local.minute !== minute) {
    throw new TimezoneError("nonexistent_local_time", "That local birth time does not exist in the selected timezone. Check daylight-saving time and choose a valid local time.");
  }
  const possible = typeof local.getPossibleOffsets === "function" ? local.getPossibleOffsets() : [local];
  const distinct = new Set(possible.map(dt => dt.offset));
  if (distinct.size > 1) {
    throw new TimezoneError("ambiguous_local_time", "That local birth time is ambiguous in the selected timezone. Choose a less ambiguous time or mark the time approximate.");
  }
  return {
    timezone_name: timezoneName,
    utc_offset_at_birth: offsetString(local.offset),
    utc_offset_minutes: local.offset,
    utc_instant: local.toUTC().toISO(),
    dst_state: local.isInDST ? "dst" : "standard",
    time_known: true,
  };
}
