import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanLocationQuery,
  normalizeGeoapifyFeature,
  safePlaceForClient,
  searchGeoapify,
  verifyPlaceSignature,
} from "../lib/locations/geoapify.js";
import { resolveBirthTiming, timezoneForCoordinates } from "../lib/locations/timezone.js";

const PLACE = {
  provider: "geoapify",
  provider_place_id: "paris-test",
  label: "Paris, Ile-de-France, France",
  latitude: 48.8566,
  longitude: 2.3522,
};

test("location queries are normalized and bounded", () => {
  assert.equal(cleanLocationQuery("  New   York  "), "New York");
  assert.throws(() => cleanLocationQuery("ny"), /at least 3/);
  assert.throws(() => cleanLocationQuery("x".repeat(121)), /too long/);
});

test("Geoapify features are reduced to safe normalized fields", () => {
  const normalized = normalizeGeoapifyFeature({
    properties: {
      formatted: "Paris, Ile-de-France, France",
      place_id: "abc",
      city: "Paris",
      state: "Ile-de-France",
      country: "France",
      country_code: "FR",
      lat: 48.85661234,
      lon: 2.35224567,
      datasource: { raw: { billing: "not copied" } },
    },
  });
  assert.deepEqual(Object.keys(normalized).sort(), [
    "city", "country", "country_code", "label", "latitude", "longitude", "provider", "provider_place_id", "region",
  ]);
  assert.equal(normalized.latitude, 48.856612);
  assert.equal(normalized.country_code, "fr");
});

test("signed places verify and tampering fails", () => {
  process.env.GEOAPIFY_API_KEY = "unit-test-location-secret";
  const signed = safePlaceForClient(PLACE);
  assert.equal(verifyPlaceSignature(signed, signed.selection_token), true);
  assert.equal(verifyPlaceSignature({ ...signed, latitude: 49 }, signed.selection_token), false);
});

test("Geoapify search returns safe client results with a mocked fetch", async () => {
  process.env.GEOAPIFY_API_KEY = "unit-test-location-secret";
  const calls = [];
  const results = await searchGeoapify("Paris", {
    fetchImpl: async (url) => {
      calls.push(url);
      return {
        ok: true,
        async json() {
          return {
            features: [{ properties: { formatted: PLACE.label, place_id: PLACE.provider_place_id, lat: PLACE.latitude, lon: PLACE.longitude } }],
          };
        },
      };
    },
  });
  assert.equal(results.length, 1);
  assert.ok(results[0].selection_token);
  assert.equal(calls[0].searchParams.get("text"), "Paris");
  assert.equal(calls[0].searchParams.get("format"), "geojson");
});

test("Geoapify search handles empty, provider, timeout, malformed, and missing-key cases", async () => {
  process.env.GEOAPIFY_API_KEY = "unit-test-location-secret";
  const empty = await searchGeoapify("Nowhere", {
    fetchImpl: async () => ({ ok: true, async json() { return { features: [] }; } }),
  });
  assert.deepEqual(empty, []);
  await assert.rejects(() => searchGeoapify("Paris", {
    fetchImpl: async () => ({ ok: false, async json() { return {}; } }),
  }), /failed/);
  await assert.rejects(() => searchGeoapify("Paris", {
    timeoutMs: 1,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      setTimeout(resolve, 50);
    }),
  }), /timed out/);
  await assert.rejects(() => searchGeoapify("Paris", {
    fetchImpl: async () => ({ ok: true, async json() { throw new Error("bad json"); } }),
  }), /malformed/);
  const oldKey = process.env.GEOAPIFY_API_KEY;
  process.env.GEOAPIFY_API_KEY = "";
  await assert.rejects(() => searchGeoapify("Paris", {
    fetchImpl: async () => ({ ok: true, async json() { return { features: [] }; } }),
  }), /not configured/);
  process.env.GEOAPIFY_API_KEY = oldKey;
});

test("timezone and historical offsets are resolved locally", () => {
  const zone = timezoneForCoordinates(48.8566, 2.3522);
  assert.equal(zone, "Europe/Paris");
  const timing = resolveBirthTiming({
    birthDate: "1990-06-16",
    birthTime: "08:30",
    timeAccuracy: "exact",
    timezoneName: zone,
  });
  assert.equal(timing.utc_offset_at_birth, "+02:00");
  assert.equal(timing.time_known, true);
});

test("timezone resolver covers common birthplace regions", () => {
  assert.equal(timezoneForCoordinates(31.1349, -97.7756), "America/Chicago");
  assert.equal(timezoneForCoordinates(40.7128, -74.006), "America/New_York");
  assert.equal(timezoneForCoordinates(51.5074, -0.1278), "Europe/London");
  assert.equal(timezoneForCoordinates(35.6762, 139.6503), "Asia/Tokyo");
  assert.throws(() => timezoneForCoordinates(91, 0), /Latitude is invalid/);
});

test("unknown birth time resolves offset without claiming an exact instant", () => {
  const timing = resolveBirthTiming({
    birthDate: "1990-12-16",
    birthTime: null,
    timeAccuracy: "unknown",
    timezoneName: "America/New_York",
  });
  assert.equal(timing.utc_offset_at_birth, "-05:00");
  assert.equal(timing.utc_instant, null);
  assert.equal(timing.time_known, false);
});

test("DST gap and ambiguous local times produce clear errors", () => {
  assert.throws(() => resolveBirthTiming({
    birthDate: "2024-03-10",
    birthTime: "02:30",
    timeAccuracy: "exact",
    timezoneName: "America/New_York",
  }), /does not exist/);
  assert.throws(() => resolveBirthTiming({
    birthDate: "2024-11-03",
    birthTime: "01:30",
    timeAccuracy: "exact",
    timezoneName: "America/New_York",
  }), /ambiguous/);
});
