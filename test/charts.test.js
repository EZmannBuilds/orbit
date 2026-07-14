// Orbit :: saved-chart service tests (in-memory store, deterministic).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createChartService, ChartError, PRIMARY_NAME } from "../lib/charts/service.js";
import { safePlaceForClient } from "../lib/locations/geoapify.js";

// In-memory store mirroring the Supabase store interface, owner-scoped.
function memStore() {
  const profiles = new Map();       // id -> row
  const active = new Map();          // ownerId -> birth_profile_id
  const profileNames = new Map();    // ownerId -> {first_name,last_name}
  const calcs = [];                  // {birth_profile_id, calculation_version, input_hash, chart_data}
  let activity = 0;
  function nextActivityStamp() {
    activity += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, activity)).toISOString();
  }
  return {
    _profiles: profiles,
    _calcs: calcs,
    _profileNames: profileNames,
    async listProfiles(ownerId) {
      return [...profiles.values()].filter((p) => p.owner_id === ownerId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async getProfile(ownerId, id) {
      const p = profiles.get(id);
      return p && p.owner_id === ownerId ? p : null; // cross-user isolation
    },
    async countProfiles(ownerId) { return (await this.listProfiles(ownerId)).length; },
    async insertProfile(row) {
      const id = randomUUID();
      const rec = { id, created_at: new Date(Date.now() + profiles.size).toISOString(), ...row };
      // enforce one-primary-per-owner like the DB partial unique index
      if (rec.is_primary) {
        for (const p of profiles.values()) if (p.owner_id === rec.owner_id && p.is_primary) throw new Error("duplicate primary");
      }
      profiles.set(id, rec);
      return rec;
    },
    async updateProfile(ownerId, id, patch) {
      const p = profiles.get(id);
      if (!p || p.owner_id !== ownerId) throw new Error("not found");
      Object.assign(p, patch);
      return p;
    },
    async activateProfile(ownerId, id) {
      const p = profiles.get(id);
      if (!p || p.owner_id !== ownerId) throw new Error("not found");
      p.last_active_at = nextActivityStamp();
      active.set(ownerId, id);
      return p;
    },
    async deleteProfile(ownerId, id) {
      const p = profiles.get(id);
      if (!p || p.owner_id !== ownerId) throw new Error("not found");
      profiles.delete(id);
      return true;
    },
    async getActiveId(ownerId) { return active.get(ownerId) || null; },
    async setActiveId(ownerId, id) { if (id === null) active.delete(ownerId); else active.set(ownerId, id); },
    async upsertProfileNames(ownerId, firstName, lastName) { profileNames.set(ownerId, { first_name: firstName, last_name: lastName }); },
    async getCalculation(bpId, ver, hash) {
      return calcs.find((c) => c.birth_profile_id === bpId && c.calculation_version === ver && c.input_hash === hash) || null;
    },
    async insertCalculation(row) { calcs.push(row); return row; },
  };
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const INPUT = {
  birth_date: "1990-06-16", birth_time: "08:30", time_accuracy: "exact",
  birthplace_name: "London", latitude: 51.5, longitude: -0.13,
  timezone_name: "Europe/London", utc_offset_at_birth: "+00:00",
};

const PLACE = {
  provider: "geoapify",
  provider_place_id: "unit-london",
  label: "London, England, United Kingdom",
  city: "London",
  region: "England",
  country: "United Kingdom",
  country_code: "gb",
  latitude: 51.5,
  longitude: -0.13,
};

test("first chart is auto-named 'My Chart', marked primary and active", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const { profile, became_primary } = await svc.create(OWNER, INPUT);
  assert.equal(profile.nickname, PRIMARY_NAME);
  assert.equal(profile.is_primary, true);
  assert.equal(became_primary, true);
  assert.equal(await store.getActiveId(OWNER), profile.id);
  assert.ok(profile.last_active_at, "first chart records activity");
});

test("selected birthplace is verified and profile names persist for My Chart", async () => {
  process.env.GEOAPIFY_API_KEY = "unit-test-location-secret";
  const store = memStore();
  const svc = createChartService(store);
  const { profile } = await svc.create(OWNER, {
    first_name: "Test",
    last_name: "User",
    birth_date: "1990-06-16",
    birth_time: "08:30",
    time_accuracy: "exact",
    birthplace: safePlaceForClient(PLACE),
  });
  assert.equal(profile.first_name, "Test");
  assert.equal(profile.birthplace_name, PLACE.label);
  assert.equal(profile.timezone_name, "Europe/London");
  assert.equal(profile.utc_offset_at_birth, "+01:00");
  assert.deepEqual(store._profileNames.get(OWNER), { first_name: "Test", last_name: "User" });
});

test("a second chart does NOT recreate 'My Chart'", async () => {
  const store = memStore();
  const svc = createChartService(store);
  await svc.create(OWNER, INPUT);
  const { profile } = await svc.create(OWNER, { ...INPUT, nickname: "Mom", relationship_type: "family" });
  assert.equal(profile.nickname, "Mom");
  assert.equal(profile.is_primary, false);
  assert.equal(profile.relationship_type, "family");
  const { charts } = await svc.list(OWNER);
  assert.equal(charts.filter((c) => c.nickname === PRIMARY_NAME).length, 1);
});

test("custom nicknames persist and don't need to be legal names", async () => {
  const store = memStore();
  const svc = createChartService(store);
  await svc.create(OWNER, INPUT);
  for (const n of ["Jordan", "Creative Partner", "Ezra Launch Chart"]) {
    const { profile } = await svc.create(OWNER, { ...INPUT, nickname: n });
    assert.equal(profile.nickname, n);
  }
});

test("secondary saved charts require a nickname", async () => {
  const store = memStore();
  const svc = createChartService(store);
  await svc.create(OWNER, INPUT);
  await assert.rejects(() => svc.create(OWNER, { ...INPUT }), (e) => e.code === "invalid_input");
});

test("name-only updates reuse the cached calculation", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const { profile } = await svc.create(OWNER, INPUT);
  assert.equal(store._calcs.length, 1);
  const updated = await svc.update(OWNER, profile.id, { first_name: "Orbit", last_name: "Axis" });
  assert.equal(updated.profile.first_name, "Orbit");
  assert.equal(store._calcs.length, 1);
});

test("renaming a chart does not update last_active_at", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const { profile } = await svc.create(OWNER, INPUT);
  const before = profile.last_active_at;
  const updated = await svc.update(OWNER, profile.id, { nickname: "Renamed" });
  assert.equal(updated.profile.nickname, "Renamed");
  assert.equal(updated.profile.last_active_at, before);
});

test("editing birth information does not update last_active_at", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const { profile } = await svc.create(OWNER, INPUT);
  const before = profile.last_active_at;
  const updated = await svc.update(OWNER, profile.id, { birth_time: "09:15" });
  assert.equal(updated.profile.birth_time, "09:15");
  assert.equal(updated.profile.last_active_at, before);
});

test("active chart can be switched and persists", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const a = await svc.create(OWNER, INPUT);
  const b = await svc.create(OWNER, { ...INPUT, nickname: "Partner" });
  assert.equal(await store.getActiveId(OWNER), a.profile.id, "additional charts do not replace the active chart");
  assert.equal(b.profile.last_active_at, undefined);
  await svc.activate(OWNER, b.profile.id);
  assert.equal(await store.getActiveId(OWNER), b.profile.id);
  assert.ok(store._profiles.get(b.profile.id).last_active_at, "activation records activity");
  // re-fetch (simulates refresh/restart reading persisted pref)
  const active = await svc.getActive(OWNER);
  assert.equal(active.profile.id, b.profile.id);
});

test("cross-user access is rejected", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const a = await svc.create(OWNER, INPUT);
  await assert.rejects(() => svc.get(OTHER, a.profile.id), (e) => e instanceof ChartError && e.code === "not_found");
  await assert.rejects(() => svc.activate(OTHER, a.profile.id), (e) => e.code === "not_found");
  await assert.rejects(() => svc.remove(OTHER, a.profile.id, { confirmEmpty: true }), (e) => e.code === "not_found");
});

test("deleting the active chart selects a safe replacement (primary preferred)", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const primary = await svc.create(OWNER, INPUT);              // My Chart, primary, active
  const friend = await svc.create(OWNER, { ...INPUT, nickname: "Friend" });
  await svc.activate(OWNER, friend.profile.id);                // active = friend
  const res = await svc.remove(OWNER, friend.profile.id);
  assert.equal(res.active_chart_id, primary.profile.id);       // fell back to primary
  assert.equal(res.empty, false);
});

test("deleting the only chart is blocked unless confirmEmpty", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const only = await svc.create(OWNER, INPUT);
  await assert.rejects(() => svc.remove(OWNER, only.profile.id), (e) => e.code === "last_chart");
  const res = await svc.remove(OWNER, only.profile.id, { confirmEmpty: true });
  assert.equal(res.empty, true);
  assert.equal(res.active_chart_id, null);
});

test("unknown-time chart hides Rising and houses", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const { chart } = await svc.create(OWNER, { ...INPUT, time_accuracy: "unknown", birth_time: null });
  assert.equal(chart.big_three.rising.unavailable, true);
  assert.equal(chart.houses.length, 0);
  assert.ok(chart.warnings.includes("rising_unavailable"));
});

test("calculation is cached: second calculate hits cache, not recompute", async () => {
  const store = memStore();
  const svc = createChartService(store);
  const c = await svc.create(OWNER, INPUT);
  const first = await svc.calculate(OWNER, c.profile.id);
  const second = await svc.calculate(OWNER, c.profile.id);
  assert.equal(second.cached, true);
  assert.deepEqual(first.chart.big_three, second.chart.big_three);
});

test("invalid input is rejected", async () => {
  const store = memStore();
  const svc = createChartService(store);
  await assert.rejects(() => svc.create(OWNER, { birth_date: "1990-06-16" }), (e) => e.code === "invalid_input");
  await assert.rejects(() => svc.create(OWNER, { ...INPUT, time_accuracy: "guess" }), (e) => e.code === "invalid_input");
});
