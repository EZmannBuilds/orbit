// Orbit Axis :: fortune service tests (in-memory store, deterministic).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFortuneService, FortuneError, DEFAULT_DETAIL } from "../lib/fortune/service.js";
import { FORTUNE_ENGINE_VERSION } from "../lib/fortune/engine.js";

function memStore() {
  const fortunes = [];       // rows
  const detail = new Map();  // ownerId -> level
  return {
    _fortunes: fortunes,
    async getFortune(bpId, date, ver) {
      return fortunes.find((f) => f.birth_profile_id === bpId && f.fortune_date === date && f.fortune_engine_version === ver) || null;
    },
    async insertFortune(row) {
      const existing = fortunes.find((f) => f.birth_profile_id === row.birth_profile_id && f.fortune_date === row.fortune_date && f.fortune_engine_version === row.fortune_engine_version);
      if (existing) return existing;
      const rec = { id: `f${fortunes.length}`, created_at: new Date(Date.now() + fortunes.length).toISOString(), ...row };
      fortunes.push(rec);
      return rec;
    },
    async listHistory(ownerId, { birthProfileId = null, limit = 30 } = {}) {
      return fortunes
        .filter((f) => f.owner_id === ownerId && (!birthProfileId || f.birth_profile_id === birthProfileId))
        .sort((a, b) => b.fortune_date.localeCompare(a.fortune_date))
        .slice(0, limit);
    },
    async getDetailLevel(ownerId) { return detail.get(ownerId) || null; },
    async setDetailLevel(ownerId, level) { detail.set(ownerId, level); },
  };
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const PROFILE = {
  id: "bp-1", birth_date: "1990-06-16", birth_time: "08:30", time_accuracy: "exact",
  latitude: 51.5, longitude: -0.13, timezone_name: "Europe/London", utc_offset_at_birth: "+00:00",
};
const NOW = new Date("2026-07-11T12:00:00Z");

test("today() composes then caches: second call returns stored fortune", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  const a = await svc.today(OWNER, PROFILE, NOW);
  const b = await svc.today(OWNER, PROFILE, NOW);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.equal(a.fortune.seed_hash, b.fortune.seed_hash);
  assert.equal(store._fortunes.length, 1); // only one row persisted
  // required fields present
  for (const k of ["mood", "love_reading", "luck_reading", "watch_out", "lucky_number", "lucky_color"]) {
    assert.ok(a.fortune[k] != null, `missing ${k}`);
  }
  assert.equal(a.fortune.fortune_engine_version, FORTUNE_ENGINE_VERSION);
});

test("today() is stable across the same day, changes on a new day", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  const day1a = await svc.today(OWNER, PROFILE, new Date("2026-07-11T09:00:00Z"));
  const day1b = await svc.today(OWNER, PROFILE, new Date("2026-07-11T21:00:00Z")); // same London day
  assert.equal(day1a.fortune.seed_hash, day1b.fortune.seed_hash);
  const day2 = await svc.today(OWNER, PROFILE, new Date("2026-07-12T12:00:00Z"));
  assert.notEqual(day1a.fortune.seed_hash, day2.fortune.seed_hash);
});

test("history returns newest-first, respects limit and chart filter", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  for (const d of ["2026-07-09", "2026-07-10", "2026-07-11"]) {
    await svc.today(OWNER, PROFILE, new Date(`${d}T12:00:00Z`));
  }
  const hist = await svc.history(OWNER, { birthProfileId: PROFILE.id, limit: 30 });
  assert.equal(hist.length, 3);
  assert.deepEqual(hist.map((h) => h.fortune_date), ["2026-07-11", "2026-07-10", "2026-07-09"]);
  const limited = await svc.history(OWNER, { limit: 2 });
  assert.equal(limited.length, 2);
});

test("history is owner-scoped (no cross-user reads)", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  await svc.today(OWNER, PROFILE, NOW);
  const otherHist = await svc.history(OTHER, {});
  assert.equal(otherHist.length, 0);
});

test("detail level defaults to Simple, persists, validates", async () => {
  const store = memStore();
  const svc = createFortuneService(store);
  assert.equal(await svc.getDetail(OWNER), DEFAULT_DETAIL);
  await svc.setDetail(OWNER, "Advanced");
  assert.equal(await svc.getDetail(OWNER), "Advanced");
  await assert.rejects(() => svc.setDetail(OWNER, "Expert"), (e) => e instanceof FortuneError && e.code === "invalid_detail");
});

test("today() without a chart is rejected", async () => {
  const svc = createFortuneService(memStore());
  await assert.rejects(() => svc.today(OWNER, {}, NOW), (e) => e.code === "no_chart");
});
