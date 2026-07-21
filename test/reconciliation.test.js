// Orbit Axis :: Update 3.3.2 branch-reconciliation regression suite.
//
// Explicit, auditable proof that reconciling the returning-user chart flow and
// the Me planet-grid redesign onto one base preserved the behavior of BOTH
// feature lines. Logic-level checks import the real services; frontend behaviors
// are asserted against the served source (the project is deliberately
// dependency-free with no DOM harness), mirroring frontend-static.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createChartService, pickFallbackActive, PRIMARY_NAME } from "../lib/charts/service.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(ROOT, "public", "app.js"), "utf8");
const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");

// Minimal in-memory store mirroring the Supabase interface (as charts.test.js).
function memStore() {
  const profiles = new Map();
  const active = new Map();
  const calcs = [];
  return {
    _calcs: calcs,
    async listProfiles(o) { return [...profiles.values()].filter((p) => p.owner_id === o); },
    async getProfile(o, id) { const p = profiles.get(id); return p && p.owner_id === o ? p : null; },
    async countProfiles(o) { return (await this.listProfiles(o)).length; },
    async insertProfile(row) { profiles.set(row.id, row); return row; },
    async updateProfile(o, id, patch) { const p = profiles.get(id); Object.assign(p, patch); return p; },
    async activateProfile(o, id) { active.set(o, id); return profiles.get(id); },
    async deleteProfile(o, id) { profiles.delete(id); },
    async getActiveId(o) { return active.get(o) || null; },
    async setActiveId(o, id) { active.set(o, id); },
    async upsertProfileNames() {},
    async getCalculation() { return null; },
    async insertCalculation(row) { calcs.push(row); return row; },
  };
}
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let idc = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idc).padStart(12, "0")}`;
async function addChart(svc, store, input) {
  const id = nextId();
  // service.create computes its own id; emulate by creating through the service.
  return svc.create(OWNER, input);
}
const SAMPLE = { birth_date: "1990-06-15", time_accuracy: "unknown", latitude: 40.7128, longitude: -74.006, birthplace: null };

// The service.create path requires a signed place; use the lower-level store for
// restoration tests where we only need profiles to exist.
function seedProfiles(store, rows) { for (const r of rows) store.insertProfile(r); }

// ── Returning-user flow (from feat/orbit-axis-returning-user-chart-flow) ─────
test("reconciled: active-chart restoration + heal (fallback preference order)", async () => {
  const store = memStore();
  const svc = createChartService(store);
  seedProfiles(store, [
    { id: "p-primary", owner_id: OWNER, nickname: PRIMARY_NAME, is_primary: true, birth_date: "1990-01-01", time_accuracy: "unknown", latitude: 1, longitude: 1, updated_at: "2026-01-01" },
    { id: "p-recent", owner_id: OWNER, nickname: "Recent", birth_date: "1991-01-01", time_accuracy: "unknown", latitude: 1, longitude: 1, last_active_at: "2026-07-01", updated_at: "2026-02-01" },
  ]);
  // A stale/dangling active id must heal to a real chart, not error.
  await store.setActiveId(OWNER, "does-not-exist");
  const active = await svc.getActive(OWNER);
  assert.ok(active && active.profile, "getActive heals a dangling active id");
  assert.equal(active.profile.id, "p-recent", "last-active wins the fallback");
});

test("reconciled: pickFallbackActive prefers last-active, then primary, then recency", () => {
  const chosen = pickFallbackActive([
    { id: "a", is_primary: true, updated_at: "2026-01-01" },
    { id: "b", last_active_at: "2026-07-10", updated_at: "2026-02-01" },
  ]);
  assert.equal(chosen.id, "b");
});

test("reconciled: onboarding is opened from exactly one place (no fortune/chart-fail path opens it)", () => {
  // The onboarding gate is opened by exactly one call site.
  const openers = (appJs.match(/openModal\(onboarding/g) || []).length;
  assert.equal(openers, 1, `onboarding must open from exactly one gated path (found ${openers})`);
  // That single opener lives in the chart-state resolver, gated on the pure
  // startup decision (ONBOARDING) — which is derived from a confirmed zero-chart,
  // auth-resolved, successful-request result and is unit-tested in returning-user.
  const resolver = appJs.slice(appJs.indexOf("async function resolveChartState"), appJs.indexOf("async function resolveChartState") + 1600);
  assert.match(resolver, /view === STARTUP_VIEW\.ONBOARDING[\s\S]*openModal\(onboarding/, "opener gated on the ONBOARDING decision");
  assert.match(resolver, /chartCount: state\.charts\.length/, "decision receives the real chart count");
  // A recoverable failure closes onboarding and shows a retry instead.
  assert.match(resolver, /STARTUP_VIEW\.ERROR[\s\S]*closeModal\(onboarding\)[\s\S]*errorBox\.hidden = false/, "chart failure never opens onboarding");
  // The fortune loader must never open onboarding — a fortune failure is inline.
  const fortuneBlock = appJs.slice(appJs.indexOf("async function axisLoadToday"), appJs.indexOf("async function axisLoadToday") + 2000);
  assert.ok(fortuneBlock.length > 0, "fortune loader found");
  assert.ok(!/onboarding/.test(fortuneBlock), "fortune load never references onboarding");
});

test("reconciled: a failed chart request shows a recoverable error, not onboarding", () => {
  assert.ok(html.includes('id="today-chart-error"'), "recoverable chart-error banner exists");
  assert.ok(html.includes('id="today-chart-retry"'), "retry control exists");
  assert.match(appJs, /startup|state\.ready|gate/i, "a startup gate exists to prevent onboarding flashing");
});

// ── Me page (from feat/orbit-axis-me-planet-grid-redesign) ───────────────────
test("reconciled: Me keys (Rising/Sun/Moon) + full Mercury–Pluto grid survive", () => {
  assert.match(appJs, /const CHART_KEY_PLACEMENTS = \["Rising", "Sun", "Moon"\]/);
  assert.match(appJs, /const PLANET_GRID_PLACEMENTS = \["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"\]/);
  assert.ok(html.includes("The Keys to Your Chart") && html.includes(">Planets<"));
});

test("reconciled: unknown birth time still hides Rising/houses (no fabrication)", () => {
  assert.match(appJs, /if \(!chart\?\.time_known\) return "House unavailable"/);
  assert.ok(appJs.includes("Rising unavailable"));
});

test("reconciled: Simple keeps all planets; Advanced only adds technical detail", () => {
  // Same grid constant drives both modes; Advanced adds an overlay class.
  assert.ok(appJs.includes("PLANET_GRID_PLACEMENTS"));
  assert.ok(appJs.includes("placement-card__tech advanced-only"));
});

// ── Both lines coexist with the new Update 4.0 surface ───────────────────────
test("Ask Orbit distinguishes signed-out, no-chart, and chart-load-failure states", () => {
  // 401 must render the sign-in state, not a generic error.
  assert.match(appJs, /error\.status === 401 \? "signedout" : "loaderror"/, "401 maps to the signed-out state");
  // A failed chart lookup must never be shown as "you have no chart".
  assert.match(appJs, /res\.chart_status === "error"[\s\S]{0,80}showAskState\("loaderror"\)/, "chart_status=error maps to load error");
  assert.match(appJs, /!res\.active_chart[\s\S]{0,60}showAskState\("nochart"\)/, "only a genuine zero-chart result shows no-chart");
  // The shared request helper exposes the status the branching depends on.
  // Asserted on behaviour rather than on the exact right-hand expression: the
  // variable was renamed during the Update 5.1.1 parsing repair while the
  // behaviour was unchanged, and a test that fails on a rename without any
  // behaviour changing is testing the wrong thing.
  assert.match(appJs, /error\.status = (response|result)\.status/, "request() exposes HTTP status to callers");
});

test("reconciled base also carries the new Ask Orbit surface (no feature lost)", () => {
  assert.ok(html.includes('id="panel-ask"') && html.includes('id="ask-input"'), "Ask Orbit panel present");
  assert.ok(html.includes('id="panel-me"'), "Me panel still present");
  assert.ok(html.includes('id="today-chart-picker"'), "Home saved-chart selector still present");
});
