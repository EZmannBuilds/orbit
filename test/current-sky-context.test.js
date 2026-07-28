import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createCurrentSkyContext,
  resolveSkyTimezone,
  CURRENT_SKY_CONTEXT_VERSION,
} from "../lib/astro/current-sky-context.js";
import { fortuneForProfile, createFortuneService } from "../lib/fortune/service.js";
import { upcomingEvents } from "../lib/sky.js";

const PROFILE = {
  id: "bp-canonical-sky",
  birth_date: "1990-06-16",
  birth_time: "08:30",
  time_accuracy: "exact",
  latitude: 41.8781,
  longitude: -87.6298,
  timezone_name: "America/Chicago",
  utc_offset_at_birth: "-05:00",
};

function snapshots(instantUtc) {
  return {
    skySnapshot: {
      sky_version: "sky-v1",
      instant_utc: instantUtc,
      zodiac_season: "Cancer",
      sun: { sign: "Cancer", longitude: 100, degrees: 10, minutes: 0 },
      moon: {
        sign: "Capricorn",
        longitude: 264,
        degrees: 24,
        minutes: 0,
        phase_name: "Full Moon",
        phase_fraction: 0.455556,
        elongation_degrees: 164,
        illumination_percent: 98,
        waxing: true,
        waning: false,
      },
      dominant_element: "Water",
      retrogrades: ["Saturn"],
      aspects: [],
      planets: {
        Sun: { name: "Sun", sign: "Cancer", longitude: 100 },
        Moon: { name: "Moon", sign: "Capricorn", longitude: 264 },
      },
      snapshot_hash: "fixture-sky",
    },
    lunarEventsSnapshot: {
      events_version: "lunar-events-v1",
      calculated_from_utc: instantUtc,
      full_moon: { kind: "full_moon", instant_utc: "2026-07-29T14:35:00.000Z" },
      new_moon: { kind: "new_moon", instant_utc: "2026-08-12T17:36:00.000Z" },
    },
  };
}

function contextAt(instantUtc, timezoneName) {
  return createCurrentSkyContext({
    at: new Date(instantUtc),
    timezoneName,
    timezoneSource: "fixture",
    ...snapshots(instantUtc),
  });
}

test("Chicago, Los Angeles, and Tokyo receive explicit local-day keys", () => {
  const instant = "2026-07-11T02:00:00.000Z";
  assert.equal(contextAt(instant, "America/Chicago").local_date, "2026-07-10");
  assert.equal(contextAt(instant, "America/Los_Angeles").local_date, "2026-07-10");
  assert.equal(contextAt(instant, "Asia/Tokyo").local_date, "2026-07-11");
});

test("UTC rollover does not advance the user's local date early", () => {
  const instant = "2026-07-11T00:01:00.000Z";
  const chicago = contextAt(instant, "America/Chicago");
  const losAngeles = contextAt(instant, "America/Los_Angeles");
  assert.equal(chicago.local_date, "2026-07-10");
  assert.equal(losAngeles.local_date, "2026-07-10");
  assert.equal(chicago.calculated_at_utc, instant);
});

test("local midnight advances exactly at midnight in the requested timezone", () => {
  assert.equal(contextAt("2026-07-11T04:59:59.000Z", "America/Chicago").local_date, "2026-07-10");
  assert.equal(contextAt("2026-07-11T05:00:00.000Z", "America/Chicago").local_date, "2026-07-11");
});

test("daylight-saving spring and fall transitions retain valid local context", () => {
  const beforeSpring = contextAt("2026-03-08T07:30:00.000Z", "America/Chicago");
  const afterSpring = contextAt("2026-03-08T08:30:00.000Z", "America/Chicago");
  assert.match(beforeSpring.local_date_time, /T01:30:00\.000-06:00$/);
  assert.match(afterSpring.local_date_time, /T03:30:00\.000-05:00$/);

  const firstFallHour = contextAt("2026-11-01T06:30:00.000Z", "America/Chicago");
  const secondFallHour = contextAt("2026-11-01T07:30:00.000Z", "America/Chicago");
  assert.match(firstFallHour.local_date_time, /T01:30:00\.000-05:00$/);
  assert.match(secondFallHour.local_date_time, /T01:30:00\.000-06:00$/);
});

test("unknown timezone fallback is explicit and never uses the server timezone", () => {
  assert.deepEqual(resolveSkyTimezone({ timezoneName: "not-a-zone" }), {
    name: "UTC",
    source: "utc_fallback",
    fallback: true,
  });
  assert.deepEqual(resolveSkyTimezone({
    timezoneName: "not-a-zone",
    fallbackTimezone: "Asia/Tokyo",
  }), {
    name: "Asia/Tokyo",
    source: "birth_timezone_fallback",
    fallback: true,
  });
});

test("one context carries phase, waxing, illumination, positions, and local lunar events", () => {
  const context = contextAt("2026-07-28T04:30:00.000Z", "America/Chicago");
  assert.equal(context.context_version, CURRENT_SKY_CONTEXT_VERSION);
  assert.equal(context.moon_phase_name, context.moon.phase_name);
  assert.equal(context.moon_phase_fraction, context.moon.phase_fraction);
  assert.equal(context.illumination_percent, context.moon.illumination_percent);
  assert.equal(context.is_waxing, context.moon.waxing);
  assert.equal(context.planetary_positions, context.planets);
  assert.equal(context.next_full_moon.local_date, "2026-07-29");
  assert.equal(context.next_new_moon.local_date, "2026-08-12");
  assert.equal(context.source.calculation, "orbit-axis-engine");
});

test("fortune date and stored sky snapshot use the same canonical local day and Moon facts", () => {
  const instant = new Date("2026-07-11T02:00:00.000Z");
  const context = createCurrentSkyContext({
    at: instant,
    timezoneName: "America/Chicago",
    timezoneSource: "current_timezone",
  });
  const fortune = fortuneForProfile(PROFILE, instant, "America/Chicago");
  assert.equal(fortune.fortune_date, "2026-07-10");
  assert.equal(fortune.sky_snapshot.local_date, fortune.fortune_date);
  assert.equal(fortune.sky_snapshot.user_timezone, fortune.timezone_name);
  assert.equal(fortune.sky_snapshot.moon_phase, fortune.factors.find((f) => f.type === "moon").advanced.split(", ")[1]);
  assert.equal(fortune.sky_snapshot.waxing, context.moon.waxing);
  assert.equal(fortune.sky_snapshot.illumination_percent, context.moon.illumination_percent);
  assert.ok(fortune.sky_snapshot.next_full_moon.instant_utc);
  assert.ok(fortune.sky_snapshot.next_new_moon.instant_utc);
});

test("Transits lunar events are sourced from the same canonical context", () => {
  const context = contextAt("2026-07-28T04:30:00.000Z", "America/Los_Angeles");
  const events = upcomingEvents(new Date(context.calculated_at_utc), 8, {
    currentSkyContext: context,
  });
  const full = events.find((event) => event.kind === "full_moon");
  const nextNew = events.find((event) => event.kind === "new_moon");
  assert.equal(full.date, context.next_full_moon.local_date);
  assert.equal(full.instant_utc, context.next_full_moon.instant_utc);
  assert.equal(nextNew.date, context.next_new_moon.local_date);
  assert.equal(nextNew.instant_utc, context.next_new_moon.instant_utc);
  assert.equal(full.source, "orbit-axis-engine");
});

test("stored legacy fortunes remain readable without recalculation", async () => {
  const legacyRow = {
    id: "legacy-fortune",
    birth_profile_id: PROFILE.id,
    fortune_engine_version: "fortune-v1",
    fortune_date: "2026-01-02",
    timezone_name: "America/Chicago",
    seed_hash: "legacy-seed",
    sky_snapshot: {
      zodiac_season: "Capricorn",
      moon_sign: "Gemini",
      moon_phase: "Waxing Gibbous",
      illumination_percent: 87,
      waxing: true,
      retrogrades: [],
    },
    mood: "Legacy mood",
    love_reading: "Legacy love",
    luck_reading: "Legacy luck",
    watch_out: "Legacy caution",
    lucky_number: 7,
    lucky_color_name: "Indigo",
    lucky_color_value: "#3344aa",
    factors: [],
  };
  const service = createFortuneService({
    async listHistory() { return [legacyRow]; },
  });
  const [result] = await service.history("owner", { limit: 30 });
  assert.equal(result.fortune_date, "2026-01-02");
  assert.deepEqual(result.sky_snapshot, legacyRow.sky_snapshot);
  assert.equal(result.sky_snapshot.context_version, undefined);
});

test("active server and client code contain no mean-cycle Moon fallback", () => {
  const legacySky = readFileSync(new URL("../lib/sky.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../lib/server/create-app.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(legacySky, /SYNODIC_MONTH|REFERENCE_NEW_MOON|function moonPhase/);
  assert.doesNotMatch(server, /import \{[^}]*moonPhase|chartNow\(\)/s);
  assert.doesNotMatch(client, /SYNODIC_MONTH|REFERENCE_NEW_MOON|Math\.cos\([^)]*moon/i);
  assert.match(client, /\/api\/sky\/current\?tz=/);
});
