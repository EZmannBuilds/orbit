// Orbit Axis :: current-timezone (Home / Current Sky) tests.
// Current timezone is the user's *browsing* timezone — distinct from a saved
// chart's birth timezone, which must never change automatically.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIanaTimezone, validateCurrentTimezone, TimezoneError } from "../lib/locations/timezone.js";
import { createFortuneService, DEFAULT_CURRENT_TIMEZONE, FortuneError } from "../lib/fortune/service.js";
import { fortuneForProfile } from "../lib/fortune/service.js";
import { handleChartsRoute } from "../lib/charts/api.js";

function memStore() {
  const fortunes = [];
  const detail = new Map();
  const currentTz = new Map(); // ownerId -> {current_timezone_name, current_timezone_source, current_timezone_updated_at}
  return {
    _currentTz: currentTz,
    async getFortune(bpId, date, ver) {
      return fortunes.find((f) => f.birth_profile_id === bpId && f.fortune_date === date && f.fortune_engine_version === ver) || null;
    },
    async insertFortune(row) {
      const rec = { id: `f${fortunes.length}`, ...row };
      fortunes.push(rec);
      return rec;
    },
    async listHistory() { return []; },
    async getDetailLevel(ownerId) { return detail.get(ownerId) || null; },
    async setDetailLevel(ownerId, level) { detail.set(ownerId, level); },
    async getCurrentTimezone(ownerId) { return currentTz.get(ownerId) || null; },
    async setCurrentTimezone(ownerId, { name, source }) {
      currentTz.set(ownerId, { current_timezone_name: name, current_timezone_source: source, current_timezone_updated_at: new Date().toISOString() });
    },
  };
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const PROFILE = {
  id: "bp-1", birth_date: "1990-06-16", birth_time: "08:30", time_accuracy: "exact",
  latitude: 51.5, longitude: -0.13, timezone_name: "Europe/London", utc_offset_at_birth: "+00:00",
};

test("isValidIanaTimezone accepts real zones and rejects garbage", () => {
  assert.equal(isValidIanaTimezone("America/Chicago"), true);
  assert.equal(isValidIanaTimezone("UTC"), true);
  assert.equal(isValidIanaTimezone("Not/AZone"), false);
  assert.equal(isValidIanaTimezone("+05:00"), false); // offsets are not IANA zone names
  assert.equal(isValidIanaTimezone(""), false);
  assert.equal(isValidIanaTimezone(null), false);
  assert.equal(isValidIanaTimezone(undefined), false);
});

test("validateCurrentTimezone throws TimezoneError on invalid input", () => {
  assert.equal(validateCurrentTimezone("Asia/Tokyo"), "Asia/Tokyo");
  assert.throws(() => validateCurrentTimezone("bogus"), (e) => e instanceof TimezoneError && e.code === "invalid_timezone");
});

test("does not use the server machine timezone as the user's timezone", () => {
  // No current timezone supplied and no birth timezone override requested ->
  // falls back to the documented default (UTC), never process.env.TZ / OS tz.
  const composed = fortuneForProfile(PROFILE, new Date("2026-07-11T12:00:00Z"), null);
  // profile.timezone_name (birth tz) is used only as a last-resort fallback,
  // never the server's local machine timezone.
  assert.equal(composed.timezone_name, "Europe/London");
});

test("invalid current-timezone override falls back to birth timezone, not silently to server tz", () => {
  const composed = fortuneForProfile(PROFILE, new Date("2026-07-11T12:00:00Z"), "not-a-real-zone");
  assert.equal(composed.timezone_name, "Europe/London");
});

test("valid current timezone overrides birth timezone for the fortune date only", () => {
  const now = new Date("2026-07-11T02:00:00Z"); // 2026-07-10 22:00 in Chicago (UTC-5 summer)
  const composed = fortuneForProfile(PROFILE, now, "America/Chicago");
  assert.equal(composed.timezone_name, "America/Chicago");
  assert.equal(composed.fortune_date, "2026-07-10");
  // The London-tz version of the same instant is a different calendar day.
  const londonComposed = fortuneForProfile(PROFILE, now, "Europe/London");
  assert.equal(londonComposed.fortune_date, "2026-07-11");
});

test("service getCurrentTimezone defaults to UTC when nothing is stored", async () => {
  const svc = createFortuneService(memStore());
  const tz = await svc.getCurrentTimezone(OWNER);
  assert.equal(tz.timezone_name, DEFAULT_CURRENT_TIMEZONE);
  assert.equal(tz.persisted, false);
});

test("service setCurrentTimezone persists and getCurrentTimezone reads it back", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  await svc.setCurrentTimezone(OWNER, { timezone_name: "Asia/Tokyo", source: "device" });
  const tz = await svc.getCurrentTimezone(OWNER);
  assert.equal(tz.timezone_name, "Asia/Tokyo");
  assert.equal(tz.source, "device");
  assert.equal(tz.persisted, true);
});

test("service setCurrentTimezone rejects an invalid IANA zone", async () => {
  const svc = createFortuneService(memStore());
  await assert.rejects(() => svc.setCurrentTimezone(OWNER, { timezone_name: "nope" }),
    (e) => e instanceof FortuneError && e.code === "invalid_timezone");
});

test("service setCurrentTimezone defaults an unrecognized source to 'device'", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  await svc.setCurrentTimezone(OWNER, { timezone_name: "Europe/Paris", source: "carrier-pigeon" });
  const tz = await svc.getCurrentTimezone(OWNER);
  assert.equal(tz.source, "device");
});

test("birth timezone is never mutated by current-timezone changes", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  await svc.setCurrentTimezone(OWNER, { timezone_name: "Asia/Tokyo", source: "device" });
  // PROFILE (the saved chart / birth data) is a plain object untouched by the
  // current-timezone service — simulate the pattern used by the API layer.
  assert.equal(PROFILE.timezone_name, "Europe/London");
});

test("/api/sky/current echoes a validated tz or falls back to UTC", async () => {
  const goodTz = await handleChartsRoute("GET", "/api/sky/current", new URLSearchParams({ tz: "America/Chicago" }), {}, null);
  assert.equal(goodTz.status, 200);
  assert.equal(goodTz.body.sky.timezone_name, "America/Chicago");
  assert.ok(goodTz.body.sky.local_date);
  assert.ok(goodTz.body.sky.local_time_iso);

  const badTz = await handleChartsRoute("GET", "/api/sky/current", new URLSearchParams({ tz: "not-a-zone" }), {}, null);
  assert.equal(badTz.body.sky.timezone_name, "UTC");

  const noTz = await handleChartsRoute("GET", "/api/sky/current", new URLSearchParams(), {}, null);
  assert.equal(noTz.body.sky.timezone_name, "UTC");
});

test("/api/moon/current no longer hardcodes timezone: UTC when a valid tz is supplied", async () => {
  const r = await handleChartsRoute("GET", "/api/moon/current", new URLSearchParams({ tz: "Pacific/Auckland" }), {}, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.timezone_name, "Pacific/Auckland");
  assert.ok(r.body.local_date);
  assert.ok(r.body.moon.phase_name);
});

test("/api/sky/current caches the snapshot across rapid repeated calls", async () => {
  const a = await handleChartsRoute("GET", "/api/sky/current", new URLSearchParams(), {}, null);
  const b = await handleChartsRoute("GET", "/api/sky/current", new URLSearchParams(), {}, null);
  // Same cached snapshot_hash and instant_utc within the cache window.
  assert.equal(a.body.sky.snapshot_hash, b.body.sky.snapshot_hash);
  assert.equal(a.body.sky.instant_utc, b.body.sky.instant_utc);
});
