// Orbit Axis :: chart deletion, export, and the account-deletion avatar sweep
// against a REAL local Supabase stack (Dev Update 1.10).
//
// The unit tests prove these flows against doubles; this file proves the same
// behaviour against real Storage policies and real rows, through the real
// HTTP route where one exists. Account deletion itself needs a service-role
// key the test runner deliberately strips, so its avatar SWEEP — which runs
// under the user's own token by design — is exercised directly, and full
// account deletion stays covered by scripts/deletion-check.js.
//
// Skips when no local stack is reachable. Synthetic users, synthetic bytes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";

const URL_ = process.env.ORBIT_TEST_SUPABASE_URL || "http://127.0.0.1:55321";
const ANON = process.env.ORBIT_TEST_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_URL = URL_;
process.env.SUPABASE_ANON_KEY = ANON;
process.env.GEOAPIFY_API_KEY = "cleanup-suite-synthetic-location-secret";
process.env.ORBIT_ENVIRONMENT = process.env.ORBIT_ENVIRONMENT || "test";

const { createOrbitApp } = await import("../lib/server/create-app.js");
const { resolveEnvironment, classifyDatabaseTarget } = await import("../lib/env/environment.js");
const { SESSION_COOKIE } = await import("../lib/auth/supabase-auth.js");
const { safePlaceForClient } = await import("../lib/locations/geoapify.js");
const { buildAccountExport, AVATAR_EXPORT_LIMITATION } = await import("../lib/account/export.js");
const { sweepAvatarObjects } = await import("../lib/account/deletion.js");

if (classifyDatabaseTarget(URL_).target === "production") {
  throw new Error("Refusing to run cleanup tests against the hosted production database.");
}

const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(URL_.replace(/\/+$/, ""));

function syntheticWebp(marker) {
  const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const payload = Buffer.alloc(5 + marker.length + 64);
  payload[0] = 0x2f;
  payload.writeUInt32LE((511 | (511 << 14)) >>> 0, 1);
  payload.write(marker, 5, "ascii");
  const chunk = Buffer.concat([Buffer.from("VP8L"), u32le(payload.length), payload,
    payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  const body = Buffer.concat([Buffer.from("WEBP"), chunk]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}

const PLACE = {
  provider: "geoapify", provider_place_id: "cleanup-suite-place",
  label: "Synthetic City, Testland", city: "Synthetic City", region: "Testland",
  country: "Testland", country_code: "tl", latitude: 40.7128, longitude: -74.006,
};

let reachable = false;
let server = null, BASE = "";
let user = null;

async function makeUser() {
  const email = `orbit-cleanup-${randomUUID()}@example.test`;
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: `Test-${randomUUID()}` }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("local signup failed");
  return { id: data.user.id, email, accessToken: data.access_token };
}

function cookie(u) {
  return `${SESSION_COOKIE}=${Buffer.from(JSON.stringify({
    access_token: u.accessToken, refresh_token: null,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: u.id, email: u.email },
  }), "utf8").toString("base64url")}`;
}

async function call(method, path, { body, contentType } = {}) {
  const headers = { cookie: cookie(user) };
  if (contentType) headers["content-type"] = contentType;
  const payload = body !== undefined && !(body instanceof Uint8Array) ? JSON.stringify(body) : body;
  if (payload !== undefined && !contentType) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null; try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ }
  return { status: res.status, json, buf };
}

async function storageList(prefix) {
  const res = await fetch(`${URL_}/storage/v1/object/list/chart-avatars`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${user.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000 }),
  });
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

async function ownedObjectPaths() {
  const paths = [];
  for (const entry of await storageList(`${user.id}/`)) {
    if (entry.id) { paths.push(`${user.id}/${entry.name}`); continue; }
    for (const leaf of await storageList(`${user.id}/${entry.name}/`)) {
      if (leaf.id) paths.push(`${user.id}/${entry.name}/${leaf.name}`);
    }
  }
  return paths;
}

async function createChart(extra = {}) {
  const res = await call("POST", "/api/charts", {
    body: {
      birth_date: "1990-06-15", birth_time: "08:30", time_accuracy: "exact",
      birthplace: safePlaceForClient(PLACE), ...extra,
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json).slice(0, 200));
  return res.json.profile;
}

async function uploadAvatar(chartId, marker, expectedVersion = 0) {
  const res = await call("POST", `/api/charts/${chartId}/avatar?expectedVersion=${expectedVersion}`, {
    body: syntheticWebp(marker), contentType: "image/webp",
  });
  assert.equal(res.status, 200, JSON.stringify(res.json).slice(0, 200));
}

const skipped = (t) => { if (!reachable) { t.skip(`local Supabase not reachable at ${URL_}`); return true; } return false; };

before(async () => {
  if (!isLoopback) return;
  try {
    const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(2500) });
    reachable = res.status < 500;
  } catch { reachable = false; }
  if (!reachable) return;
  const env = resolveEnvironment({
    env: { ORBIT_ENVIRONMENT: "local", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON },
    loadEnvFiles: false,
  });
  server = http.createServer(createOrbitApp({ env }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
  user = await makeUser();
});

after(async () => {
  if (reachable) {
    // Fixture hygiene: remove any remaining charts and objects.
    const list = await call("GET", "/api/charts");
    for (const chart of list.json?.charts || []) {
      await call("DELETE", `/api/charts/${chart.id}?confirmEmpty=true`).catch(() => {});
    }
    for (const path of await ownedObjectPaths()) {
      await fetch(`${URL_}/storage/v1/object/chart-avatars/${path}`, {
        method: "DELETE",
        headers: { apikey: ANON, authorization: `Bearer ${user.accessToken}` },
      }).catch(() => {});
    }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
});

// ── Chart deletion ──────────────────────────────────────────────────────────

test("deleting a chart removes ITS avatar and nothing else", async (t) => {
  if (skipped(t)) return;
  const first = await createChart();                                        // My Chart / self, active
  const doomed = await createChart({ nickname: "Doomed", relationship_type: "friend" });
  await uploadAvatar(first.id, "CLEANUP-KEEP");
  await uploadAvatar(doomed.id, "CLEANUP-DOOMED");
  assert.equal((await ownedObjectPaths()).length, 2);

  const del = await call("DELETE", `/api/charts/${doomed.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.json.avatar_cleanup, "removed");

  const remaining = await ownedObjectPaths();
  assert.deepEqual(remaining, [`${user.id}/${first.id}/avatar.webp`],
    "exactly the surviving chart's object remains");
  const served = await call("GET", `/api/charts/${first.id}/avatar`);
  assert.equal(served.status, 200, "the unrelated avatar still serves");
});

test("a missing object never blocks chart deletion", async (t) => {
  if (skipped(t)) return;
  const chart = await createChart({ nickname: "Ghost Picture", relationship_type: "friend" });
  await uploadAvatar(chart.id, "CLEANUP-GHOST");
  // The object vanishes out-of-band; the row still points at it.
  const path = `${user.id}/${chart.id}/avatar.webp`;
  const gone = await fetch(`${URL_}/storage/v1/object/chart-avatars/${path}`, {
    method: "DELETE",
    headers: { apikey: ANON, authorization: `Bearer ${user.accessToken}` },
  });
  assert.ok(gone.status < 300);

  const del = await call("DELETE", `/api/charts/${chart.id}`);
  assert.equal(del.status, 200, "deletion proceeds; the goal state is 'no object' and it holds");
  assert.equal(del.json.avatar_cleanup, "removed");
});

test("deleting the active chart still repairs activation", async (t) => {
  if (skipped(t)) return;
  const list = await call("GET", "/api/charts");
  const active = list.json.charts.find((c) => c.is_active);
  const other = list.json.charts.find((c) => !c.is_active)
    || await createChart({ nickname: "Backup", relationship_type: "friend" });
  const del = await call("DELETE", `/api/charts/${active.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.json.active_chart_id, other.id, "a survivor was promoted");
});

// ── Export ──────────────────────────────────────────────────────────────────

test("the real export names identity honestly and leaks no storage detail", async (t) => {
  if (skipped(t)) return;
  // One chart with an avatar, one legacy 'other' row without.
  const pictured = await createChart({ nickname: "Pictured", relationship_type: "partner" });
  await uploadAvatar(pictured.id, "CLEANUP-EXPORT");
  const legacyId = randomUUID();
  await fetch(`${URL_}/rest/v1/birth_profiles`, {
    method: "POST",
    headers: {
      apikey: ANON, authorization: `Bearer ${user.accessToken}`,
      "content-type": "application/json", prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: legacyId, owner_id: user.id, nickname: "Legacy Row", relationship_type: "other",
      birth_date: "1990-06-15", birth_time: "12:00:00", time_accuracy: "exact",
      birthplace_name: "Synthetic City", latitude: 40.7128, longitude: -74.006,
      timezone_name: "America/New_York", utc_offset_at_birth: "-04:00",
    }),
  });

  const doc = await buildAccountExport({ accessToken: user.accessToken, timezone: "UTC" });
  const rows = doc.birth_profiles;
  const exportedPictured = rows.find((r) => r.id === pictured.id);
  assert.equal(exportedPictured.avatar_present, true);
  assert.equal(exportedPictured.avatar_exported, false);
  assert.equal(exportedPictured.avatar_export_limitation, AVATAR_EXPORT_LIMITATION);
  assert.equal(exportedPictured.relationship_type_status, "set");
  const exportedLegacy = rows.find((r) => r.id === legacyId);
  assert.equal(exportedLegacy.relationship_type, "other", "the stored value is the user's data");
  assert.equal(exportedLegacy.relationship_type_status, "legacy_unclassified");
  assert.equal(exportedLegacy.avatar_present, false);
  assert.equal(exportedLegacy.avatar_export_limitation, null);

  const text = JSON.stringify(doc);
  assert.ok(!text.includes("avatar_storage_path"), "no raw path field");
  assert.ok(!text.includes("chart-avatars"), "no bucket name");
  assert.ok(!text.includes(`${user.id}/`), "no owner-prefixed object path");
  assert.ok(!text.includes("storage/v1"), "no storage URL of any kind");
});

// ── Account-deletion sweep ──────────────────────────────────────────────────

test("the sweep removes every owner object across charts, and misses nothing", async (t) => {
  if (skipped(t)) return;
  // Ensure at least two objects exist, one of them for an already-deleted
  // chart (residue), which the sweep must also collect.
  const residuePath = `${user.id}/${randomUUID()}/avatar.webp`;
  const seeded = await fetch(`${URL_}/storage/v1/object/chart-avatars/${residuePath}`, {
    method: "POST",
    headers: {
      apikey: ANON, authorization: `Bearer ${user.accessToken}`,
      "content-type": "image/webp", "x-upsert": "true",
    },
    body: syntheticWebp("CLEANUP-RESIDUE"),
  });
  assert.ok(seeded.status < 300);
  assert.ok((await ownedObjectPaths()).length >= 2, "precondition: multiple objects exist");

  const swept = await sweepAvatarObjects({
    root: URL_, anonKey: ANON, accessToken: user.accessToken, userId: user.id,
  });
  assert.equal(swept.complete, true);
  assert.ok(swept.removed >= 2);
  assert.deepEqual(await ownedObjectPaths(), [], "zero orphaned objects remain");

  // Idempotent: sweeping a clean prefix removes nothing and fails nothing.
  const again = await sweepAvatarObjects({
    root: URL_, anonKey: ANON, accessToken: user.accessToken, userId: user.id,
  });
  assert.equal(again.complete, true);
  assert.equal(again.removed, 0);
});
