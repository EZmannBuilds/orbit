// Orbit Axis :: chart-avatars Storage policy proofs (Dev Update 1.10).
//
// Direct requests against the LOCAL Supabase Storage API — no application code
// in the path — so what is proven here is the bucket and its four owner-scoped
// policies, exactly the second line of defence the endpoint relies on. Every
// check is behavioural: what an anonymous caller, the owner, and another
// signed-in user can actually do, not what a config file says they can do.
//
// Skips cleanly when no local stack is reachable; refuses non-loopback hosts;
// synthetic users and synthetic bytes only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { classifyDatabaseTarget } from "../lib/env/environment.js";

const URL_ = process.env.ORBIT_TEST_SUPABASE_URL || "http://127.0.0.1:55321";
const ANON = process.env.ORBIT_TEST_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const BUCKET = "chart-avatars";

const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(URL_.replace(/\/+$/, ""));
if (classifyDatabaseTarget(URL_).target === "production") {
  throw new Error("Refusing to run storage policy tests against the hosted production database.");
}

// A header-valid 512×512 WebP container (see avatar-endpoint-security.test.js).
function syntheticWebp(pad = 64) {
  const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const dims = 511 | (511 << 14);
  const payload = Buffer.alloc(5 + pad);
  payload[0] = 0x2f;
  payload.writeUInt32LE(dims >>> 0, 1);
  for (let i = 5; i < payload.length; i++) payload[i] = i % 249;
  const chunk = Buffer.concat([Buffer.from("VP8L"), u32le(payload.length), payload,
    payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  const body = Buffer.concat([Buffer.from("WEBP"), chunk]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}
const BYTES = syntheticWebp();

let reachable = false;
let userA = null, userB = null;
let chartIdA = null, chartIdB = null;

async function makeUser() {
  const email = `orbit-storage-suite-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}`;
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("local signup failed");
  return { id: data.user.id, email, accessToken: data.access_token };
}

function objectUrl(path) { return `${URL_}/storage/v1/object/${BUCKET}/${path}`; }

async function op(method, url, { token = null, body, contentType = "image/webp", upsert = false } = {}) {
  const headers = { apikey: ANON };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = contentType;
  if (upsert) headers["x-upsert"] = "true";
  const res = await fetch(url, { method, headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, text: buf.toString("utf8") };
}

async function list(token, prefix) {
  const headers = { apikey: ANON, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
    method: "POST", headers, body: JSON.stringify({ prefix, limit: 1000 }),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, objects: Array.isArray(data) ? data : [], raw: data };
}

const pathFor = (user, chartId) => `${user.id}/${chartId}/avatar.webp`;
const skipMsg = () => `local Supabase not reachable at ${URL_}`;
const skipped = (t) => { if (!reachable) { t.skip(skipMsg()); return true; } return false; };

before(async () => {
  if (!isLoopback) return;
  try {
    const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(2500) });
    reachable = res.status < 500;
  } catch { reachable = false; }
  if (!reachable) return;
  userA = await makeUser();
  userB = await makeUser();
  chartIdA = randomUUID();
  chartIdB = randomUUID();
  const seedA = await op("POST", objectUrl(pathFor(userA, chartIdA)), { token: userA.accessToken, body: BYTES, upsert: true });
  assert.ok(seedA.status < 300, `owner seed upload failed: ${seedA.text.slice(0, 120)}`);
  const seedB = await op("POST", objectUrl(pathFor(userB, chartIdB)), { token: userB.accessToken, body: BYTES, upsert: true });
  assert.ok(seedB.status < 300, `owner seed upload failed: ${seedB.text.slice(0, 120)}`);
});

after(async () => {
  if (!reachable) return;
  await op("DELETE", objectUrl(pathFor(userA, chartIdA)), { token: userA.accessToken }).catch(() => {});
  await op("DELETE", objectUrl(pathFor(userB, chartIdB)), { token: userB.accessToken }).catch(() => {});
});

// ── The bucket itself ───────────────────────────────────────────────────────

test("the bucket is private: the public-object route serves nothing", async (t) => {
  if (skipped(t)) return;
  const res = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${pathFor(userA, chartIdA)}`);
  assert.notEqual(res.status, 200, "a private bucket must not serve unauthenticated public reads");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(!buf.equals(BYTES), "and must never return the bytes");
});

test("the bucket enforces its 1 MB object limit", async (t) => {
  if (skipped(t)) return;
  const big = syntheticWebp(1_100_000);
  const res = await op("POST", objectUrl(pathFor(userA, chartIdA)), { token: userA.accessToken, body: big, upsert: true });
  assert.ok(res.status >= 400, `an over-limit object must be refused, got ${res.status}`);
  const still = await op("GET", objectUrl(pathFor(userA, chartIdA)), { token: userA.accessToken });
  assert.ok(still.buf.equals(BYTES), "the original object is untouched");
});

test("the bucket refuses content types outside its allow-list", async (t) => {
  if (skipped(t)) return;
  const res = await op("POST", objectUrl(pathFor(userA, chartIdA)), {
    token: userA.accessToken, body: Buffer.from("<html></html>"), contentType: "text/html", upsert: true,
  });
  assert.ok(res.status >= 400, "text/html is not an allowed avatar type");
});

// ── Anonymous callers ───────────────────────────────────────────────────────

test("anonymous select, insert, update, and delete are all refused", async (t) => {
  if (skipped(t)) return;
  const path = pathFor(userA, chartIdA);
  const read = await op("GET", objectUrl(path));
  assert.notEqual(read.status, 200);
  assert.ok(!read.buf.equals(BYTES));
  const insert = await op("POST", objectUrl(`${userA.id}/${randomUUID()}/avatar.webp`), { body: BYTES });
  assert.ok(insert.status >= 400);
  const update = await op("POST", objectUrl(path), { body: BYTES, upsert: true });
  assert.ok(update.status >= 400);
  const del = await op("DELETE", objectUrl(path));
  assert.ok(del.status >= 400 || del.text.includes("[]"));
  const still = await op("GET", objectUrl(path), { token: userA.accessToken });
  assert.ok(still.buf.equals(BYTES), "the object survived every anonymous attempt");
});

// ── Owner scoping ───────────────────────────────────────────────────────────

test("each owner can operate only inside their own first path segment", async (t) => {
  if (skipped(t)) return;
  // Own path: full round trip.
  const own = `${userA.id}/${randomUUID()}/avatar.webp`;
  const put = await op("POST", objectUrl(own), { token: userA.accessToken, body: BYTES });
  assert.ok(put.status < 300);
  const read = await op("GET", objectUrl(own), { token: userA.accessToken });
  assert.ok(read.buf.equals(BYTES));
  const del = await op("DELETE", objectUrl(own), { token: userA.accessToken });
  assert.ok(del.status < 300);

  // A forged first segment — B's id in A's request — fails on every verb.
  const forged = pathFor(userB, chartIdB);
  assert.ok((await op("POST", objectUrl(forged), { token: userA.accessToken, body: BYTES, upsert: true })).status >= 400);
  const steal = await op("GET", objectUrl(forged), { token: userA.accessToken });
  assert.notEqual(steal.status, 200);
  assert.ok(!steal.buf.equals(BYTES));
  const wipe = await op("DELETE", objectUrl(forged), { token: userA.accessToken });
  const still = await op("GET", objectUrl(forged), { token: userB.accessToken });
  assert.equal(still.status, 200, `B's object must survive (delete answered ${wipe.status})`);
});

test("listing is scoped: no cross-user names, no root enumeration", async (t) => {
  if (skipped(t)) return;
  const cross = await list(userA.accessToken, `${userB.id}/`);
  assert.equal(cross.objects.filter((o) => o.name).length, 0, "A sees nothing under B's prefix");
  const root = await list(userA.accessToken, "");
  const names = root.objects.map((o) => String(o.name || ""));
  assert.ok(!names.some((n) => n.includes(userB.id)), "root listing reveals no other owner's folder");
  const anonRoot = await list(null, "");
  assert.equal(anonRoot.objects.filter((o) => o.name).length, 0, "anonymous root listing is empty");
});

test("a forged chart id inside the owner's own prefix is a policy pass but an application refusal", async (t) => {
  if (skipped(t)) return;
  // The policies compare ONLY the first segment, so an owner can write under a
  // chart id they do not own — which is exactly why the application verifies
  // chart ownership BEFORE Storage on every avatar route (proven in
  // avatar-endpoint-security.test.js). This test pins the division of labour
  // so nobody later mistakes the policy for the whole defence.
  const foreignChart = `${userA.id}/${chartIdB}/avatar.webp`;    // B's CHART id, A's OWNER segment
  const put = await op("POST", objectUrl(foreignChart), { token: userA.accessToken, body: BYTES });
  assert.ok(put.status < 300, "storage alone accepts it — first segment matches");
  const cleanup = await op("DELETE", objectUrl(foreignChart), { token: userA.accessToken });
  assert.ok(cleanup.status < 300);
});

test("no service role is present or needed anywhere in this suite", async (t) => {
  if (skipped(t)) return;
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined,
    "the suite runs entirely on user JWTs, like the endpoints themselves");
});
