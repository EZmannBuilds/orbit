// Orbit Axis :: Update Two — detail-level removal + calculation reuse.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDetailLevel, DETAIL_LEVELS, DEFAULT_DETAIL, createFortuneService, FortuneError } from "../lib/fortune/service.js";
import { createChartService } from "../lib/charts/service.js";
import { natalComputeCount, resetNatalComputeCount } from "../lib/astro/natal.js";

// ── Supported levels + normalization ────────────────────────────────────────
test("only Simple and Advanced are supported; Simple is the default", () => {
  assert.deepEqual(DETAIL_LEVELS, ["Simple", "Advanced"]);
  assert.equal(DEFAULT_DETAIL, "Simple");
});

test("normalizeDetailLevel: Balanced (any casing) and unknowns become Simple", () => {
  for (const v of ["Balanced", "balanced", "BALANCED", "  balanced  "]) assert.equal(normalizeDetailLevel(v), "Simple");
  for (const v of ["Expert", "", null, undefined, "xyz", 42]) assert.equal(normalizeDetailLevel(v), "Simple");
  assert.equal(normalizeDetailLevel("Simple"), "Simple");
  assert.equal(normalizeDetailLevel("Advanced"), "Advanced");
  assert.equal(normalizeDetailLevel("advanced"), "Advanced");
});

// ── Service read/write behavior ──────────────────────────────────────────────
function detailStore(initial = null) {
  let value = initial;
  return {
    async getDetailLevel() { return value; },
    async setDetailLevel(_owner, level) { value = level; return true; },
  };
}

test("getDetail normalizes a legacy Balanced row to Simple", async () => {
  const svc = createFortuneService(detailStore("Balanced"));
  assert.equal(await svc.getDetail("owner"), "Simple");
});

test("setDetail accepts Simple/Advanced, migrates Balanced→Simple, rejects garbage", async () => {
  const store = detailStore();
  const svc = createFortuneService(store);
  assert.deepEqual(await svc.setDetail("o", "Advanced"), { astrology_detail_level: "Advanced" });
  assert.equal(await svc.getDetail("o"), "Advanced");
  // Legacy Balanced coerces to Simple rather than erroring.
  assert.deepEqual(await svc.setDetail("o", "Balanced"), { astrology_detail_level: "Simple" });
  assert.equal(await svc.getDetail("o"), "Simple");
  // Genuine bad input is still a validation error.
  await assert.rejects(() => svc.setDetail("o", "Expert"), (e) => e instanceof FortuneError && e.code === "invalid_detail");
});

// ── Calculation reuse (no Swiss Ephemeris recompute on follow-ups) ───────────
function memChartStore(profile) {
  const calcs = new Map();
  let activeId = profile.id;
  return {
    async listProfiles() { return [profile]; },
    async getProfile(_o, id) { return id === profile.id ? profile : null; },
    async getActiveId() { return activeId; },
    async setActiveId(_o, id) { activeId = id; },
    async getCalculation(id, version, hash) { return calcs.get(`${id}|${version}|${hash}`) || null; },
    async insertCalculation(row) { calcs.set(`${row.birth_profile_id}|${row.calculation_version}|${row.input_hash}`, row); return row; },
  };
}

const PROFILE = {
  id: "chart-1", nickname: "My Chart", first_name: "Ada",
  birth_date: "1990-05-05", birth_time: "12:00", time_accuracy: "exact",
  latitude: 40.7128, longitude: -74.006, timezone_name: "America/New_York",
  utc_offset_at_birth: "-04:00", zodiac_system: "tropical", house_system: "placidus",
};

test("ordinary follow-up reuses the cached natal calculation (no recompute)", async () => {
  resetNatalComputeCount();
  const svc = createChartService(memChartStore(PROFILE));
  await svc.getActive("owner");              // first call computes once
  const afterFirst = natalComputeCount();
  assert.equal(afterFirst, 1);
  await svc.getActive("owner");              // follow-up: cache hit
  await svc.getActive("owner");
  await svc.get("owner", PROFILE.id);
  assert.equal(natalComputeCount(), afterFirst, "no additional Swiss Ephemeris runs for the unchanged chart");
});

test("a chart edit (forced recalculation) computes fresh", async () => {
  resetNatalComputeCount();
  const svc = createChartService(memChartStore(PROFILE));
  await svc.getActive("owner");
  const base = natalComputeCount();
  // update() calls calculateAndCache with { force: true } whenever birth data
  // changes; exercise that same path directly to prove an edit recomputes.
  await svc.calculate("owner", PROFILE.id, { force: true });
  assert.ok(natalComputeCount() > base, "a forced recalculation runs Swiss Ephemeris again");
});
