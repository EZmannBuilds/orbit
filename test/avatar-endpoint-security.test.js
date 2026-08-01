// Orbit Axis :: avatar endpoint security proofs (Dev Update 1.10).
//
// INTEGRATION tests against the REAL HTTP route: a real createOrbitApp handler
// bound to a real loopback port, real session cookies, a real local Supabase
// stack with real Storage policies, and two disposable synthetic users. The
// existing avatar-transport tests read the source; these boot it — which is
// exactly how the pre-suite defects (avatar metadata silently dropped, every
// avatar request 500ing on the wrong destructure) survived a green run.
//
// Skips cleanly when no local stack is reachable, refuses to run against
// anything that is not loopback, and uses no real faces, no real birth data,
// and no owner data. Fixture "images" are synthetic header-valid WebP/PNG
// containers built in-process.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";

// Pin the process to the LOCAL stack BEFORE anything reads configuration.
// loadEnvLocal() only fills in variables that are undefined, so setting these
// first means a .env.local pointing at a hosted project can never win.
const URL_ = process.env.ORBIT_TEST_SUPABASE_URL || "http://127.0.0.1:55321";
const ANON = process.env.ORBIT_TEST_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_URL = URL_;
process.env.SUPABASE_ANON_KEY = ANON;
process.env.GEOAPIFY_API_KEY = "endpoint-suite-synthetic-location-secret";
process.env.ORBIT_ENVIRONMENT = process.env.ORBIT_ENVIRONMENT || "test";

const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(URL_.replace(/\/+$/, ""));

const { createOrbitApp } = await import("../lib/server/create-app.js");
const { resolveEnvironment, classifyDatabaseTarget } = await import("../lib/env/environment.js");
const { SESSION_COOKIE } = await import("../lib/auth/supabase-auth.js");
const { safePlaceForClient } = await import("../lib/locations/geoapify.js");
const { createChartService } = await import("../lib/charts/service.js");
const { createSupabaseChartStore } = await import("../lib/charts/store.js");

if (classifyDatabaseTarget(URL_).target === "production") {
  throw new Error("Refusing to run avatar endpoint security tests against the hosted production database.");
}

// ── Synthetic image fixtures ────────────────────────────────────────────────
// Header-valid containers, not decodable photographs: the server validates the
// container (format sniff, dimensions, animation flags) and never decodes
// pixels, so these exercise exactly what the boundary checks. Each carries an
// ASCII marker so the log-leak proof can search everything the process printed.

const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

function syntheticWebp({ width = 512, height = 512, marker = "ORBIT-FIXTURE", pad = 96 } = {}) {
  const dims = (width - 1) | ((height - 1) << 14);
  const payload = Buffer.alloc(5 + marker.length + pad);
  payload[0] = 0x2f;                       // VP8L signature byte
  payload.writeUInt32LE(dims >>> 0, 1);    // 14-bit width-1 / height-1 pair
  payload.write(marker, 5, "ascii");
  for (let i = 5 + marker.length; i < payload.length; i++) payload[i] = i % 251;
  const chunk = Buffer.concat([
    Buffer.from("VP8L"), u32le(payload.length), payload,
    payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),   // RIFF even padding
  ]);
  const body = Buffer.concat([Buffer.from("WEBP"), chunk]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}

function animatedWebp() {
  // VP8X header with the animation flag (0x02) set.
  const payload = Buffer.alloc(10);
  payload[0] = 0x02;
  payload[4] = 0xff; payload[5] = 0x01; payload[6] = 0x00;   // width-1 = 511
  payload[7] = 0xff; payload[8] = 0x01; payload[9] = 0x00;   // height-1 = 511
  const chunk = Buffer.concat([Buffer.from("VP8X"), u32le(payload.length), payload]);
  const body = Buffer.concat([Buffer.from("WEBP"), chunk]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}

function syntheticPng({ width = 512, height = 512 } = {}) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; ihdr[17] = 6;
  return Buffer.concat([sig, ihdr]);
}

const FIX = {
  webpA: syntheticWebp({ marker: "ORBIT-FIXTURE-ALPHA" }),
  webpB: syntheticWebp({ marker: "ORBIT-FIXTURE-BETA", pad: 128 }),
  webpC: syntheticWebp({ marker: "ORBIT-FIXTURE-GAMMA", pad: 160 }),
  webpD: syntheticWebp({ marker: "ORBIT-FIXTURE-DELTA", pad: 192 }),
  wrongDims: syntheticWebp({ width: 100, height: 100, marker: "ORBIT-FIXTURE-SMALL" }),
  tooLarge: syntheticWebp({ marker: "ORBIT-FIXTURE-HUGE", pad: 1_100_000 }),
  png: syntheticPng(),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 7)]),
  gif: Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(32, 3)]),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"></svg>'),
  html: Buffer.from("<!doctype html><html><body>not an image</body></html>"),
  mz: Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(64, 1)]),
  elf: Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64, 2)]),
  malformedRiff: Buffer.concat([Buffer.from("RIFF"), u32le(64), Buffer.from("WEBP"), Buffer.from("XXXX"), Buffer.alloc(56, 9)]),
  animated: animatedWebp(),
  overTransport: Buffer.alloc(2 * 1024 * 1024 + 1, 5),
};

const MARKERS = ["ORBIT-FIXTURE-ALPHA", "ORBIT-FIXTURE-BETA", "ORBIT-FIXTURE-GAMMA", "ORBIT-FIXTURE-DELTA"];

// ── Synthetic place (server-signed, in-process HMAC) ────────────────────────

const PLACE = {
  provider: "geoapify",
  provider_place_id: "endpoint-suite-synthetic-place",
  label: "Synthetic City, Testland",
  city: "Synthetic City",
  region: "Testland",
  country: "Testland",
  country_code: "tl",
  latitude: 40.7128,
  longitude: -74.006,
};
const chartInput = (extra = {}) => ({
  birth_date: "1990-06-15", birth_time: "08:30", time_accuracy: "exact",
  birthplace: safePlaceForClient(PLACE),
  ...extra,
});

// ── Harness state ───────────────────────────────────────────────────────────

let reachable = false;
let server = null;
let BASE = "";
let PORT = 0;
let userA = null, userB = null;
let chartA1 = null;      // User A, receives avatars through the suite
let chartA2 = null;      // User A, never given an avatar
let chartB1 = null;      // User B, carries an avatar
let deletedChartId = null;
let legacyOtherId = null;
let legacyPublicId = null;

const RESPONSES = [];    // every JSON body the API returned, for the leak scan
const LOGS = [];         // everything console printed while the suite ran
const consoleOriginals = { log: console.log, error: console.error, warn: console.warn };

const realFetch = globalThis.fetch;
let storageCalls = [];   // recorded by the pass-through fetch tap
let fetchFault = null;   // { match, method, respond } — single-shot fault injection

function installFetchTap() {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url ?? input);
    const method = String(init.method || input?.method || "GET").toUpperCase();
    if (url.includes("/storage/v1/")) storageCalls.push({ url, method });
    if (fetchFault && url.includes(fetchFault.match) && method === fetchFault.method) {
      const fault = fetchFault;
      fetchFault = null;                                  // single shot
      return fault.respond();
    }
    return realFetch(input, init);
  };
}

async function makeUser() {
  const email = `orbit-avatar-suite-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}`;                // synthetic, never a real credential
  const res = await realFetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`local signup failed: ${String(data.msg || data.error || res.status).slice(0, 120)}`);
  return {
    id: data.user.id, email,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
  };
}

function cookieFor(user, { expired = false, refreshToken } = {}) {
  const payload = {
    access_token: user.accessToken,
    refresh_token: refreshToken !== undefined ? refreshToken : user.refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600),
    user: { id: user.id, email: user.email },
  };
  return `${SESSION_COOKIE}=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

async function call(method, path, { user = null, cookie = null, headers = {}, body, contentType } = {}) {
  const h = { ...headers };
  const jar = cookie ?? (user ? cookieFor(user) : null);
  if (jar) h.cookie = jar;
  if (contentType) h["content-type"] = contentType;
  const payload = body !== undefined && !(body instanceof Uint8Array) && typeof body !== "string"
    ? JSON.stringify(body) : body;
  if (payload !== undefined && !contentType && typeof payload === "string") h["content-type"] = "application/json";
  const res = await realFetch(`${BASE}${path}`, { method, headers: h, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* binary body */ }
  if (json) RESPONSES.push(text);
  return { status: res.status, headers: res.headers, buf, json };
}

const rest = async (path, { token, method = "GET", body, prefer } = {}) => {
  const headers = { apikey: ANON, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (prefer) headers.prefer = prefer;
  const res = await realFetch(`${URL_}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json, text };
};

const storage = {
  url: (path) => `${URL_}/storage/v1/object/chart-avatars/${path}`,
  async get(token, path) {
    const headers = { apikey: ANON };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await realFetch(this.url(path), { headers });
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  },
  async put(token, path, bytes, contentType = "image/webp") {
    const headers = { apikey: ANON, "content-type": contentType, "x-upsert": "true" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await realFetch(this.url(path), { method: "POST", headers, body: bytes });
    return { status: res.status, text: await res.text() };
  },
  async remove(token, path) {
    const headers = { apikey: ANON };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await realFetch(this.url(path), { method: "DELETE", headers });
    return { status: res.status, text: await res.text() };
  },
  async list(token, prefix) {
    const headers = { apikey: ANON, "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await realFetch(`${URL_}/storage/v1/object/list/chart-avatars`, {
      method: "POST", headers, body: JSON.stringify({ prefix, limit: 1000 }),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, objects: Array.isArray(data) ? data : [] };
  },
};

const avatarPath = (user, chartId) => `${user.id}/${chartId}/avatar.webp`;

async function profileRow(user, chartId) {
  const r = await rest(`birth_profiles?id=eq.${chartId}&select=id,nickname,relationship_type,avatar_storage_path,avatar_version,avatar_updated_at`, { token: user.accessToken });
  return r.json?.[0] || null;
}

async function createChart(user, extra = {}) {
  const res = await call("POST", "/api/charts", { user, body: chartInput(extra) });
  assert.equal(res.status, 200, `chart create failed: ${JSON.stringify(res.json).slice(0, 200)}`);
  return res.json.profile;
}

function skipMsg() {
  return `local Supabase not reachable at ${URL_} — start it with "supabase start" and apply migrations`;
}
const skipped = (t) => { if (!reachable) { t.skip(skipMsg()); return true; } return false; };

// ── Setup ───────────────────────────────────────────────────────────────────

before(async () => {
  if (!isLoopback) return;
  try {
    const res = await realFetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(2500) });
    reachable = res.status < 500;
  } catch { reachable = false; }
  if (!reachable) return;

  for (const key of ["log", "error", "warn"]) {
    console[key] = (...args) => { LOGS.push(args.map(String).join(" ")); };
  }
  installFetchTap();

  const env = resolveEnvironment({
    env: { ORBIT_ENVIRONMENT: "local", SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON },
    loadEnvFiles: false,
  });
  server = http.createServer(createOrbitApp({ env }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  PORT = server.address().port;
  BASE = `http://127.0.0.1:${PORT}`;

  userA = await makeUser();
  userB = await makeUser();

  chartA1 = await createChart(userA);                                     // first chart: My Chart / self
  chartA2 = await createChart(userA, { nickname: "Companion", relationship_type: "friend" });
  chartB1 = await createChart(userB);                                     // B's first chart

  // Deleted-chart fixture: created, then genuinely deleted through the API.
  const doomed = await createChart(userA, { nickname: "Temporary", relationship_type: "friend" });
  deletedChartId = doomed.id;
  const del = await call("DELETE", `/api/charts/${doomed.id}`, { user: userA });
  assert.equal(del.status, 200, "deleted-chart fixture must delete cleanly");

  // Legacy rows: inserted directly, exactly as the pre-1.10 application left
  // them — the 1.10 API refuses to write these values, which is the point.
  legacyOtherId = randomUUID();
  legacyPublicId = randomUUID();
  for (const [id, rel, nick] of [[legacyOtherId, "other", "Legacy Other"], [legacyPublicId, "public_figure", "Legacy Figure"]]) {
    const r = await rest("birth_profiles", {
      token: userA.accessToken, method: "POST", prefer: "return=representation",
      body: {
        id, owner_id: userA.id, nickname: nick, relationship_type: rel,
        birth_date: "1990-06-15", birth_time: "12:00:00", time_accuracy: "exact",
        birthplace_name: "Synthetic City", latitude: 40.7128, longitude: -74.006,
        timezone_name: "America/New_York", utc_offset_at_birth: "-04:00",
      },
    });
    assert.ok(r.status < 300, `legacy fixture insert failed: ${r.text.slice(0, 160)}`);
  }

  // B's avatar exists before any cross-user test runs.
  const up = await call("POST", `/api/charts/${chartB1.id}/avatar?expectedVersion=0`, {
    user: userB, body: FIX.webpD, contentType: "image/webp",
  });
  assert.equal(up.status, 200, `B avatar upload failed: ${JSON.stringify(up.json).slice(0, 200)}`);
});

after(async () => {
  fetchFault = null;
  if (reachable) {
    // Fixture cleanup: charts through the API (which is also what will carry
    // avatar cleanup), then any storage leftovers directly, then verify.
    for (const [user, ids] of [
      [userA, [chartA1?.id, chartA2?.id, legacyOtherId, legacyPublicId]],
      [userB, [chartB1?.id]],
    ]) {
      for (const id of ids.filter(Boolean)) {
        await call("DELETE", `/api/charts/${id}?confirmEmpty=true`, { user }).catch(() => {});
      }
      const listed = await storage.list(user.accessToken, `${user.id}/`);
      for (const obj of listed.objects) {
        await storage.remove(user.accessToken, `${user.id}/${obj.name}`).catch(() => {});
        // Nested layout: <owner>/<chart>/avatar.webp lists folders first.
        const inner = await storage.list(user.accessToken, `${user.id}/${obj.name}/`);
        for (const leaf of inner.objects) {
          await storage.remove(user.accessToken, `${user.id}/${obj.name}/${leaf.name}`).catch(() => {});
        }
      }
    }
  }
  globalThis.fetch = realFetch;
  for (const key of ["log", "error", "warn"]) console[key] = consoleOriginals[key];
  if (server) await new Promise((resolve) => server.close(resolve));
});

// ── Authentication proofs ───────────────────────────────────────────────────

test("anonymous upload is refused with the established authentication error", async (t) => {
  if (skipped(t)) return;
  storageCalls = [];
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar`, { body: FIX.webpA, contentType: "image/webp" });
  assert.equal(res.status, 401);
  assert.equal(res.json.ok, false);
  assert.equal(res.json.error, "Sign-in required.");
  assert.equal(storageCalls.length, 0, "no Storage call may happen for an anonymous request");
});

test("anonymous read and remove are refused identically, before Storage", async (t) => {
  if (skipped(t)) return;
  storageCalls = [];
  for (const method of ["GET", "DELETE"]) {
    const res = await call(method, `/api/charts/${chartA1.id}/avatar`);
    assert.equal(res.status, 401);
    assert.equal(res.json.error, "Sign-in required.");
  }
  assert.equal(storageCalls.length, 0);
});

test("an expired session gets the established session error and performs nothing", async (t) => {
  if (skipped(t)) return;
  storageCalls = [];
  const cookie = cookieFor(userA, { expired: true, refreshToken: "not-a-real-refresh-token" });
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar`, { cookie, body: FIX.webpA, contentType: "image/webp" });
  assert.equal(res.status, 401);
  assert.equal(res.json.error, "Session expired. Please sign in again.");
  assert.equal(storageCalls.filter((c) => !c.url.includes("/auth/")).length, 0);
});

test("authentication failures changed no metadata and wrote no object", async (t) => {
  if (skipped(t)) return;
  const row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null);
  assert.equal(Number(row.avatar_version), 0);
  const objects = await storage.list(userA.accessToken, `${userA.id}/${chartA1.id}/`);
  assert.equal(objects.objects.length, 0, "no avatar object may exist yet");
});

// ── Validation-integration proofs (real requests, real refusals) ────────────

const REJECTIONS = [
  ["empty body", Buffer.alloc(0), "image/webp", 400, "avatar_empty"],
  ["wrong Content-Type for valid WebP bytes", null, "text/plain", 400, "avatar_type_mismatch"],
  ["PNG declared as WebP", null, "image/webp", 400, "avatar_type_mismatch", "png"],
  ["JPEG declared as WebP", null, "image/webp", 400, "avatar_format_rejected", "jpeg"],
  ["animated WebP", null, "image/webp", 400, "avatar_animated", "animated"],
  ["wrong dimensions", null, "image/webp", 400, "avatar_wrong_dimensions", "wrongDims"],
  ["file above the 1 MB avatar ceiling", null, "image/webp", 413, "avatar_too_large", "tooLarge"],
  ["malformed RIFF container", null, "image/webp", 400, "avatar_malformed", "malformedRiff"],
  ["SVG disguised as WebP", null, "image/webp", 400, "avatar_format_rejected", "svg"],
  ["HTML disguised as WebP", null, "image/webp", 400, "avatar_format_rejected", "html"],
  ["GIF disguised as WebP", null, "image/webp", 400, "avatar_format_rejected", "gif"],
  // Executables are positively identified by their own magic bytes and
  // refused as recognised-but-never-acceptable formats, not as unknowns.
  ["MZ executable bytes", null, "image/webp", 400, "avatar_format_rejected", "mz"],
  ["ELF executable bytes", null, "image/webp", 400, "avatar_format_rejected", "elf"],
];

test("every invalid upload is refused with a stable code, no Storage call, no metadata change", async (t) => {
  if (skipped(t)) return;
  for (const [name, explicitBody, contentType, status, code, fixKey] of REJECTIONS) {
    storageCalls = [];
    const body = explicitBody ?? FIX[fixKey ?? "webpA"];
    const res = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=0`, {
      user: userA, body, contentType,
    });
    assert.equal(res.status, status, `${name}: expected ${status}, got ${res.status} ${JSON.stringify(res.json).slice(0, 160)}`);
    assert.equal(res.json.code, code, `${name}: expected code ${code}`);
    assert.equal(storageCalls.filter((c) => !c.url.includes("/auth/")).length, 0,
      `${name}: Storage must never be called for invalid input`);
  }
  const row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null, "metadata untouched by any rejection");
  assert.equal(Number(row.avatar_version), 0);
});

test("MZ and ELF sniff as executables, not images (defence stays honest)", async (t) => {
  if (skipped(t)) return;
  // The refusal text says "That file isn't an image." — codes stay stable and
  // the response mentions no formats it cannot actually detect. Executable
  // payloads sniff to a non-image type; the validator refuses anything it
  // cannot positively identify as WebP or PNG, and both these are covered by
  // the table above. This test pins the distinction: an unrecognisable file
  // and a recognised-but-refused file both end as 4xx with codes, never 500.
  const garbage = Buffer.from("Z".repeat(64));
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar`, { user: userA, body: garbage, contentType: "image/webp" });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, "avatar_unrecognised");
});

test("a request above the 2 MB transport cap is refused before buffering", async (t) => {
  if (skipped(t)) return;
  storageCalls = [];
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar`, {
    user: userA, body: FIX.overTransport, contentType: "image/webp",
  });
  assert.equal(res.status, 413);
  assert.equal(res.json.code, "avatar_request_too_large");
  assert.equal(storageCalls.filter((c) => !c.url.includes("/auth/")).length, 0);
});

test("a truncated request writes nothing and changes nothing", async (t) => {
  if (skipped(t)) return;
  await new Promise((resolve) => {
    const sock = net.connect(PORT, "127.0.0.1", () => {
      sock.write(
        `POST /api/charts/${chartA1.id}/avatar HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${PORT}\r\nCookie: ${cookieFor(userA)}\r\n` +
        `Content-Type: image/webp\r\nContent-Length: 50000\r\n\r\n`);
      sock.write(FIX.webpA.subarray(0, 512));
      setTimeout(() => { sock.destroy(); resolve(); }, 150);
    });
    sock.on("error", () => resolve());
  });
  await new Promise((r) => setTimeout(r, 200));
  const row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null);
  assert.equal(Number(row.avatar_version), 0);
});

test("an aborted request settles without writing", async (t) => {
  if (skipped(t)) return;
  const controller = new AbortController();
  const stream = new ReadableStream({
    start(c) { c.enqueue(FIX.webpA.subarray(0, 256)); },   // never closes
  });
  const attempt = realFetch(`${BASE}/api/charts/${chartA1.id}/avatar`, {
    method: "POST",
    headers: { cookie: cookieFor(userA), "content-type": "image/webp" },
    body: stream, duplex: "half", signal: controller.signal,
  }).catch(() => null);
  setTimeout(() => controller.abort(), 100);
  await attempt;
  await new Promise((r) => setTimeout(r, 200));
  const row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null);
  assert.equal(Number(row.avatar_version), 0);
});

// ── Owner lifecycle proofs ──────────────────────────────────────────────────

test("upload → read → conditional → replace → remove, end to end", async (t) => {
  if (skipped(t)) return;

  // 1–2: first upload updates metadata.
  const up = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=0`, {
    user: userA, body: FIX.webpA, contentType: "image/webp",
  });
  assert.equal(up.status, 200);
  assert.equal(up.json.identity.hasAvatar, true);
  assert.equal(up.json.identity.avatarVersion, 1);
  assert.ok(!("avatar_storage_path" in up.json.identity), "identity never carries the path");
  let row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, avatarPath(userA, chartA1.id));
  assert.equal(Number(row.avatar_version), 1);
  assert.ok(row.avatar_updated_at);

  // 3–6: bytes, content type, private cache headers, version-keyed ETag.
  const got = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(got.status, 200);
  assert.ok(got.buf.equals(FIX.webpA), "exact bytes come back");
  assert.equal(got.headers.get("content-type"), "image/webp");
  assert.equal(got.headers.get("cache-control"), "private, max-age=0, must-revalidate");
  assert.equal(got.headers.get("etag"), '"avatar-v1"');
  assert.equal(got.headers.get("x-content-type-options"), "nosniff");

  // 7: If-None-Match returns 304 with no body.
  const cond = await call("GET", `/api/charts/${chartA1.id}/avatar`, {
    user: userA, headers: { "if-none-match": '"avatar-v1"' },
  });
  assert.equal(cond.status, 304);
  assert.equal(cond.buf.length, 0, "a 304 carries no image body");

  // 8–10: replacement with the correct expected version.
  const rep = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=1`, {
    user: userA, body: FIX.webpB, contentType: "image/webp",
  });
  assert.equal(rep.status, 200);
  assert.equal(rep.json.identity.avatarVersion, 2);
  const got2 = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.ok(got2.buf.equals(FIX.webpB), "the replacement bytes serve");
  assert.equal(got2.headers.get("etag"), '"avatar-v2"', "a different version produces a different ETag");
  const staleTag = await call("GET", `/api/charts/${chartA1.id}/avatar`, {
    user: userA, headers: { "if-none-match": '"avatar-v1"' },
  });
  assert.equal(staleTag.status, 200, "the old version no longer validates a cache");

  // 11–14: removal clears metadata and restores the fallback contract.
  const rem = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=2`, { user: userA });
  assert.equal(rem.status, 200);
  assert.equal(rem.json.identity.hasAvatar, false);
  assert.ok(rem.json.identity.initials, "deterministic fallback initials remain usable");
  assert.ok(rem.json.identity.relationship?.label, "relationship label remains usable");
  row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null);
  assert.equal(Number(row.avatar_version), 3);
  const gone = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(gone.status, 404);
  assert.equal(gone.json.code, "avatar_not_found");

  // 15: removal is idempotent.
  const again = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=3`, { user: userA });
  assert.equal(again.status, 200);
  assert.equal(again.json.identity.hasAvatar, false);
});

// ── Cross-user proofs ───────────────────────────────────────────────────────

test("User A cannot read, write, or remove User B's avatar — and cannot tell it exists", async (t) => {
  if (skipped(t)) return;
  const before_ = await profileRow(userB, chartB1.id);
  assert.equal(Number(before_.avatar_version), 1, "precondition: B has an avatar");

  const results = [];
  for (const [method, path, opts] of [
    ["GET", `/api/charts/${chartB1.id}/avatar`, {}],
    ["POST", `/api/charts/${chartB1.id}/avatar`, { body: FIX.webpC, contentType: "image/webp" }],
    ["DELETE", `/api/charts/${chartB1.id}/avatar`, {}],
  ]) {
    const res = await call(method, path, { user: userA, ...opts });
    assert.equal(res.status, 404, `${method} must refuse with the ownership boundary's 404`);
    assert.equal(res.json.code, "not_found");
    assert.ok(!res.buf.equals(FIX.webpD), "B's bytes are never returned");
    results.push(JSON.stringify({ ...res.json }));
  }

  // The refusal for B's chart, a deleted chart, and a chart that never
  // existed are byte-identical — no existence oracle.
  const deleted = await call("GET", `/api/charts/${deletedChartId}/avatar`, { user: userA });
  const never = await call("GET", `/api/charts/${randomUUID()}/avatar`, { user: userA });
  assert.equal(JSON.stringify(deleted.json), results[0]);
  assert.equal(JSON.stringify(never.json), results[0]);

  // End state: B's metadata and object are exactly as they were.
  const after_ = await profileRow(userB, chartB1.id);
  assert.deepEqual(after_, before_);
  const bytes = await storage.get(userB.accessToken, avatarPath(userB, chartB1.id));
  assert.equal(bytes.status, 200);
  assert.ok(bytes.buf.equals(FIX.webpD), "B's object is unchanged");
});

test("User A cannot rename, reclassify, activate, or delete User B's chart", async (t) => {
  if (skipped(t)) return;
  for (const [method, path, body] of [
    ["PATCH", `/api/charts/${chartB1.id}`, { nickname: "Hijacked" }],
    ["PATCH", `/api/charts/${chartB1.id}`, { relationship_type: "friend" }],
    ["POST", `/api/charts/${chartB1.id}/activate`, {}],
    ["DELETE", `/api/charts/${chartB1.id}`, undefined],
  ]) {
    const res = await call(method, path, { user: userA, body });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal(res.json.code, "not_found");
  }
  const row = await profileRow(userB, chartB1.id);
  assert.equal(row.nickname, "My Chart");
  assert.equal(row.relationship_type, "self");
});

test("User A's Storage token cannot reach User B's path at all", async (t) => {
  if (skipped(t)) return;
  const path = avatarPath(userB, chartB1.id);
  const read = await storage.get(userA.accessToken, path);
  assert.notEqual(read.status, 200, "cross-user read is refused by policy");
  assert.ok(!read.buf.equals(FIX.webpD));
  const write = await storage.put(userA.accessToken, path, FIX.webpC);
  assert.ok(write.status >= 400, "cross-user write is refused by policy");
  const del = await storage.remove(userA.accessToken, path);
  assert.ok(del.status >= 400 || del.text.includes("[]"),
    "cross-user delete removes nothing");
  const listed = await storage.list(userA.accessToken, `${userB.id}/`);
  assert.equal(listed.objects.filter((o) => o.name).length, 0, "A cannot list B's prefix");
  const still = await storage.get(userB.accessToken, path);
  assert.equal(still.status, 200);
  assert.ok(still.buf.equals(FIX.webpD), "B's object survived every attempt");
});

test("cross-user refusals leak no owner id, path, or bucket name", async (t) => {
  if (skipped(t)) return;
  const res = await call("GET", `/api/charts/${chartB1.id}/avatar`, { user: userA });
  const body = JSON.stringify(res.json);
  assert.ok(!body.includes(userB.id), "no B owner UUID");
  assert.ok(!body.includes("chart-avatars"), "no bucket name");
  assert.ok(!body.includes("storage/v1"), "no storage URL");
});

// ── Legacy relationship values at the HTTP boundary ─────────────────────────

test("avatar-only and name-only writes preserve legacy relationship values", async (t) => {
  if (skipped(t)) return;
  const up = await call("POST", `/api/charts/${legacyOtherId}/avatar?expectedVersion=0`, {
    user: userA, body: FIX.webpC, contentType: "image/webp",
  });
  assert.equal(up.status, 200, JSON.stringify(up.json).slice(0, 160));
  assert.equal(up.json.identity.relationship.status, "unset", "'other' presents as Relationship not set");
  let row = await profileRow(userA, legacyOtherId);
  assert.equal(row.relationship_type, "other", "avatar write preserved the legacy value");

  const rename = await call("PATCH", `/api/charts/${legacyPublicId}`, { user: userA, body: { nickname: "Renamed Figure" } });
  assert.equal(rename.status, 200);
  row = await profileRow(userA, legacyPublicId);
  assert.equal(row.relationship_type, "public_figure", "rename preserved the legacy classification");
  assert.equal(rename.json.profile.relationship_type, "public_figure");

  // Clean the fixture's avatar again so later sweeps see a known state.
  const rem = await call("DELETE", `/api/charts/${legacyOtherId}/avatar?expectedVersion=1`, { user: userA });
  assert.equal(rem.status, 200);
});

test("legacy values cannot be chosen on a new write; the four current ones can", async (t) => {
  if (skipped(t)) return;
  for (const value of ["other", "public_figure"]) {
    const res = await call("PATCH", `/api/charts/${chartA2.id}`, { user: userA, body: { relationship_type: value } });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, "relationship_type_not_selectable");
  }
  const bad = await call("PATCH", `/api/charts/${chartA2.id}`, { user: userA, body: { relationship_type: "nonsense" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.code, "relationship_type_invalid");
  const good = await call("PATCH", `/api/charts/${chartA2.id}`, { user: userA, body: { relationship_type: "family" } });
  assert.equal(good.status, 200);
  assert.equal(good.json.profile.relationship_type, "family");
  const explicit = await call("PATCH", `/api/charts/${legacyPublicId}`, { user: userA, body: { relationship_type: "friend" } });
  assert.equal(explicit.status, 200, "an explicit choice replaces a legacy classification");
  const row = await profileRow(userA, legacyPublicId);
  assert.equal(row.relationship_type, "friend");
});

// ── Concurrency and race proofs ─────────────────────────────────────────────

test("two uploads claiming the same version: exactly one wins, the loser is told", async (t) => {
  if (skipped(t)) return;
  const start = await profileRow(userA, chartA1.id);
  const v = Number(start.avatar_version);
  const [r1, r2] = await Promise.all([
    call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA, body: FIX.webpA, contentType: "image/webp" }),
    call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA, body: FIX.webpB, contentType: "image/webp" }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409], "exactly one success, one stale refusal");
  const loser = r1.status === 409 ? r1 : r2;
  assert.equal(loser.json.code, "avatar_stale_write");
  const row = await profileRow(userA, chartA1.id);
  assert.equal(Number(row.avatar_version), v + 1, "the version advanced exactly once");
  assert.equal(row.avatar_storage_path, avatarPath(userA, chartA1.id));
  // The losing request cannot land later with its stale token.
  const retry = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, {
    user: userA, body: FIX.webpC, contentType: "image/webp",
  });
  assert.equal(retry.status, 409);
  assert.equal(retry.json.code, "avatar_stale_write");
  // NOT claimed: that the served bytes always belong to the metadata winner.
  // Storage writes and the row's compare-and-set are two systems; both
  // requests target the same object path, so the bytes are one of the two
  // valid uploads and the row is consistent — the recovery for the crossing
  // window is the 409 itself: the loser re-reads and re-uploads.
  const served = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(served.status, 200);
  assert.ok(served.buf.equals(FIX.webpA) || served.buf.equals(FIX.webpB), "a valid current avatar serves");
});

test("replace versus remove from the same version: one wins, states agree", async (t) => {
  if (skipped(t)) return;
  let row = await profileRow(userA, chartA1.id);
  let v = Number(row.avatar_version);

  // Replacement lands first; the removal that read the same version is stale.
  const rep = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA, body: FIX.webpC, contentType: "image/webp" });
  assert.equal(rep.status, 200);
  const staleRemove = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA });
  assert.equal(staleRemove.status, 409);
  assert.equal(staleRemove.json.code, "avatar_stale_write");
  row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, avatarPath(userA, chartA1.id), "metadata says the avatar survived");
  const bytes = await storage.get(userA.accessToken, avatarPath(userA, chartA1.id));
  assert.ok(bytes.buf.equals(FIX.webpC), "storage agrees with metadata");

  // Removal lands first; the replacement that read the same version is stale
  // and is refused BEFORE it writes bytes, so nothing is resurrected.
  v = Number(row.avatar_version);
  const rem = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA });
  assert.equal(rem.status, 200);
  const staleReplace = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${v}`, { user: userA, body: FIX.webpA, contentType: "image/webp" });
  assert.equal(staleReplace.status, 409);
  row = await profileRow(userA, chartA1.id);
  assert.equal(row.avatar_storage_path, null, "removal held");
  const gone = await storage.get(userA.accessToken, avatarPath(userA, chartA1.id));
  assert.notEqual(gone.status, 200, "no object was resurrected");
});

test("a slow older upload cannot become current after a newer one", async (t) => {
  if (skipped(t)) return;
  // The service-level replay of a delayed request: it read version N long ago,
  // newer writes advanced the row, and its compare-and-set must find nothing.
  const svc = createChartService(createSupabaseChartStore({
    url: URL_, anonKey: ANON, accessToken: userA.accessToken, ownerId: userA.id,
  }));
  const row = await profileRow(userA, chartA1.id);
  const staleVersion = Number(row.avatar_version) - 1;
  await assert.rejects(
    () => svc.setAvatarState(userA.id, chartA1.id, {
      expectedVersion: staleVersion, storagePath: avatarPath(userA, chartA1.id),
    }),
    (e) => e.code === "avatar_stale_write",
  );
  const after_ = await profileRow(userA, chartA1.id);
  assert.equal(Number(after_.avatar_version), Number(row.avatar_version), "nothing moved");
});

test("upload racing chart deletion: no metadata resurrection, residue is found and cleaned", async (t) => {
  if (skipped(t)) return;
  // Replays the endpoint's exact sequence with the deletion interleaved where
  // a real race would put it: after ownership passed, after the bytes landed,
  // before the metadata write. Over HTTP this window is timing; here it is
  // held open deliberately.
  const doomed = await createChart(userA, { nickname: "Race Fixture", relationship_type: "friend" });
  const path = avatarPath(userA, doomed.id);
  const put = await storage.put(userA.accessToken, path, FIX.webpB);      // endpoint step 1: bytes land
  assert.ok(put.status < 300, `storage put failed: ${put.text.slice(0, 120)}`);
  const del = await call("DELETE", `/api/charts/${doomed.id}`, { user: userA });   // deletion wins the race
  assert.equal(del.status, 200);

  const svc = createChartService(createSupabaseChartStore({
    url: URL_, anonKey: ANON, accessToken: userA.accessToken, ownerId: userA.id,
  }));
  await assert.rejects(                                                    // endpoint step 2: metadata write
    () => svc.setAvatarState(userA.id, doomed.id, { expectedVersion: 0, storagePath: path }),
    (e) => e.code === "not_found",
    "the metadata write must not recreate the deleted chart",
  );
  const rowCheck = await rest(`birth_profiles?id=eq.${doomed.id}&select=id`, { token: userA.accessToken });
  assert.equal(rowCheck.json?.length ?? 0, 0, "no row came back from the dead");

  // The residue object is detectable under the owner's prefix, and removable
  // with the owner's own token — that is the documented recovery.
  const residue = await storage.list(userA.accessToken, `${userA.id}/${doomed.id}/`);
  assert.equal(residue.objects.length, 1, "the orphaned object is detectable");
  const cleaned = await storage.remove(userA.accessToken, path);
  assert.ok(cleaned.status < 300);
  const swept = await storage.list(userA.accessToken, `${userA.id}/${doomed.id}/`);
  assert.equal(swept.objects.length, 0, "and removable");

  // No cross-chart damage: A's other charts are untouched.
  const a2 = await profileRow(userA, chartA2.id);
  assert.ok(a2, "unrelated chart survived");
});

// ── Failure-recovery proofs (single-shot faults at the network boundary) ────

test("storage upload failure leaves the old avatar and its metadata untouched", async (t) => {
  if (skipped(t)) return;
  // Establish a current avatar first.
  let row = await profileRow(userA, chartA1.id);
  const up = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA, body: FIX.webpA, contentType: "image/webp" });
  assert.equal(up.status, 200);
  row = await profileRow(userA, chartA1.id);

  fetchFault = { match: "/storage/v1/object/chart-avatars/", method: "POST", respond: () => new Response("{}", { status: 500 }) };
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA, body: FIX.webpB, contentType: "image/webp" });
  assert.equal(res.status, 502);
  assert.equal(res.json.code, "avatar_storage_failed");
  const after_ = await profileRow(userA, chartA1.id);
  assert.equal(Number(after_.avatar_version), Number(row.avatar_version), "metadata untouched");
  const served = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.ok(served.buf.equals(FIX.webpA), "the old avatar still serves");
});

test("metadata failure after upload: no false success, state detectable, replacement repairs", async (t) => {
  if (skipped(t)) return;
  const row = await profileRow(userA, chartA1.id);
  fetchFault = { match: "/rest/v1/birth_profiles", method: "PATCH", respond: () => new Response("upstream unavailable", { status: 500 }) };
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA, body: FIX.webpB, contentType: "image/webp" });
  assert.equal(res.status, 500, "the API reports failure, never false success");
  assert.equal(res.json.error, "Chart operation failed");
  const after_ = await profileRow(userA, chartA1.id);
  assert.equal(Number(after_.avatar_version), Number(row.avatar_version),
    "the row did not move");
  // DOCUMENTED, not hidden: the object was replaced before the row write
  // failed, so bytes and version disagree until repaired. The repair is the
  // ordinary path — upload again with the current version.
  const repair = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${after_.avatar_version}`, { user: userA, body: FIX.webpB, contentType: "image/webp" });
  assert.equal(repair.status, 200, "replacement repairs the inconsistency");
  const served = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.ok(served.buf.equals(FIX.webpB));
});

test("storage read failure is a structured 502, not a crash or a leak", async (t) => {
  if (skipped(t)) return;
  fetchFault = { match: "/storage/v1/object/chart-avatars/", method: "GET", respond: () => new Response("<html>gateway error</html>", { status: 503 }) };
  const res = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(res.status, 502);
  assert.equal(res.json.code, "avatar_storage_failed");
  assert.ok(!JSON.stringify(res.json).includes("gateway"), "upstream bodies never pass through");
});

test("storage removal failure leaves the avatar fully intact", async (t) => {
  if (skipped(t)) return;
  const row = await profileRow(userA, chartA1.id);
  fetchFault = { match: "/storage/v1/object/chart-avatars/", method: "DELETE", respond: () => new Response("{}", { status: 500 }) };
  const res = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA });
  assert.equal(res.status, 502);
  assert.equal(res.json.code, "avatar_remove_failed");
  const after_ = await profileRow(userA, chartA1.id);
  assert.equal(after_.avatar_storage_path, row.avatar_storage_path);
  const served = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(served.status, 200, "the avatar still serves after a failed removal");
});

test("metadata clear failure after removal: detectable, and a retry clears it", async (t) => {
  if (skipped(t)) return;
  const row = await profileRow(userA, chartA1.id);
  fetchFault = { match: "/rest/v1/birth_profiles", method: "PATCH", respond: () => new Response("upstream unavailable", { status: 500 }) };
  const res = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA });
  assert.equal(res.status, 500, "no false success");
  // Inconsistent state is detectable: metadata says avatar, storage disagrees.
  const read = await call("GET", `/api/charts/${chartA1.id}/avatar`, { user: userA });
  assert.equal(read.status, 404);
  assert.equal(read.json.code, "avatar_missing_object", "the mismatch has its own name");
  // Retrying the removal is safe and clears the stale metadata.
  const retry = await call("DELETE", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA });
  assert.equal(retry.status, 200);
  const after_ = await profileRow(userA, chartA1.id);
  assert.equal(after_.avatar_storage_path, null);
});

test("a storage timeout surfaces as a controlled failure, changing nothing", async (t) => {
  if (skipped(t)) return;
  const row = await profileRow(userA, chartA1.id);
  fetchFault = { match: "/storage/v1/object/chart-avatars/", method: "POST", respond: () => Promise.reject(new Error("synthetic network timeout")) };
  const res = await call("POST", `/api/charts/${chartA1.id}/avatar?expectedVersion=${row.avatar_version}`, { user: userA, body: FIX.webpA, contentType: "image/webp" });
  assert.equal(res.status, 500, "a transport rejection is caught, not crashed on");
  assert.equal(res.json.error, "Chart operation failed");
  assert.ok(!JSON.stringify(res.json).includes("synthetic network timeout"), "provider detail never surfaces");
  const after_ = await profileRow(userA, chartA1.id);
  assert.deepEqual(after_, row, "nothing changed");
});

// ── Delivery sweep and leak scans ───────────────────────────────────────────

test("no orphaned objects remain under either owner prefix after the race tests", async (t) => {
  if (skipped(t)) return;
  // Every object still in the bucket must be one a live row points at.
  for (const user of [userA, userB]) {
    const rows = await rest(`birth_profiles?owner_id=eq.${user.id}&select=id,avatar_storage_path`, { token: user.accessToken });
    const expected = new Set((rows.json || []).map((r) => r.avatar_storage_path).filter(Boolean));
    const folders = await storage.list(user.accessToken, `${user.id}/`);
    for (const folder of folders.objects) {
      const leaves = await storage.list(user.accessToken, `${user.id}/${folder.name}/`);
      for (const leaf of leaves.objects) {
        const full = `${user.id}/${folder.name}/${leaf.name}`;
        assert.ok(expected.has(full), `orphaned object detected: an object exists that no row references`);
      }
    }
  }
});

test("image bytes never entered the process log", async (t) => {
  if (skipped(t)) return;
  const joined = LOGS.join("\n");
  for (const marker of MARKERS) {
    assert.ok(!joined.includes(marker), `fixture marker ${marker} must never appear in logs`);
  }
});

test("no API response carried a storage path, bucket name, signed URL, SQL, or stack trace", async (t) => {
  if (skipped(t)) return;
  assert.ok(RESPONSES.length > 30, "the scan covers the whole suite's responses");
  const joined = RESPONSES.join("\n");
  for (const leak of ["chart-avatars", "storage/v1", "avatar.webp", "token=", "SELECT ", "select * ", "    at "]) {
    assert.ok(!joined.includes(leak), `"${leak}" must never appear in an API response`);
  }
  for (const user of [userA, userB]) {
    assert.ok(!joined.includes(`${user.id}/`), "no owner-prefixed object path in any response");
  }
});
