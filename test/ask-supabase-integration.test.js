// Orbit Axis :: Ask Orbit REAL Supabase integration + RLS tests (Update 4.0.1).
//
// These are INTEGRATION tests, not unit tests. They run against a LOCAL Supabase
// stack only and are skipped automatically when one isn't reachable, so
// `npm test` stays green on machines without Docker.
//
//   supabase start && supabase migration up --local
//   ORBIT_TEST_SUPABASE_URL=http://127.0.0.1:55321 \
//   ORBIT_TEST_SUPABASE_ANON_KEY=<local anon key> npm test
//
// Safety: refuses to run against anything that is not a loopback host, so it can
// never touch a hosted/production project. Users are disposable and synthetic;
// no real birth data or real passwords are used.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createSupabaseAskStore } from "../lib/ask-orbit/store.js";
import { createAskService } from "../lib/ask-orbit/service.js";
import { ASK_ENGINE_VERSION } from "../lib/ask-orbit/context-engine.js";
import { classifyDatabaseTarget } from "../lib/env/environment.js";

const URL_ = process.env.ORBIT_TEST_SUPABASE_URL || "http://127.0.0.1:55321";
const ANON = process.env.ORBIT_TEST_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Hard safety rail: loopback only. Never a hosted project.
const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(URL_.replace(/\/+$/, ""));

// Update 4.0.2, defence in depth: the shared classifier must also agree this is
// not production, so this file can never be pointed at the hosted project even
// if the regex above is later loosened.
const classified = classifyDatabaseTarget(URL_);
if (classified.target === "production") {
  throw new Error("Refusing to run integration tests against the hosted production database.");
}

let reachable = false;
let userA = null, userB = null;

async function reachableCheck() {
  if (!isLoopback) return false;
  try {
    const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(2500) });
    return res.status < 500;
  } catch { return false; }
}

// Create a disposable synthetic user on the LOCAL stack and return its session.
async function makeUser() {
  const email = `orbit-test-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}`; // synthetic, never a real credential
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`local signup failed: ${JSON.stringify(data).slice(0, 200)}`);
  return { id: data.user.id, email, accessToken: data.access_token };
}

function authFor(user) {
  return { url: URL_, anonKey: ANON, accessToken: user.accessToken, ownerId: user.id };
}

// Create a REAL synthetic birth_profiles row for a disposable user, so
// ask_conversations.birth_profile_id satisfies its foreign key exactly as it
// does in production. Entirely synthetic data — never real birth information.
async function makeSyntheticProfile(user, nickname = "Synthetic Chart", timeAccuracy = "exact") {
  const row = {
    id: randomUUID(),
    owner_id: user.id,
    nickname,
    birth_date: "1990-06-15",
    birth_time: timeAccuracy === "unknown" ? null : "12:00:00",
    time_accuracy: timeAccuracy,
    birthplace_name: "Synthetic City",
    latitude: 40.7128,
    longitude: -74.006,
    timezone_name: "America/New_York",
    utc_offset_at_birth: "-04:00",
  };
  const res = await rest("birth_profiles", { token: user.accessToken, method: "POST", body: row, prefer: "return=representation" });
  if (res.status >= 400) throw new Error(`synthetic profile insert failed: ${res.status} ${res.text.slice(0, 200)}`);
  return Array.isArray(res.json) ? res.json[0] : res.json;
}

// Raw REST helper so we can assert on status codes directly.
async function rest(path, { token = null, method = "GET", body = null, prefer = null } = {}) {
  const headers = { apikey: ANON, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (prefer) headers.prefer = prefer;
  const res = await fetch(`${URL_}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json, text };
}

before(async () => {
  reachable = await reachableCheck();
  if (!reachable) return;
  userA = await makeUser();
  userB = await makeUser();
});

after(async () => {
  // Best-effort cleanup of this run's rows (RLS-scoped to each owner).
  for (const u of [userA, userB]) {
    if (!u) continue;
    await rest(`ask_messages?owner_id=eq.${u.id}`, { token: u.accessToken, method: "DELETE" }).catch(() => {});
    await rest(`ask_conversations?owner_id=eq.${u.id}`, { token: u.accessToken, method: "DELETE" }).catch(() => {});
    await rest(`birth_profiles?owner_id=eq.${u.id}`, { token: u.accessToken, method: "DELETE" }).catch(() => {});
  }
});

function skipMsg() {
  return `local Supabase not reachable at ${URL_} — start it with "supabase start && supabase migration up --local"`;
}

// ── Schema reachability ──────────────────────────────────────────────────────
test("integration: ask tables are reachable on the local stack", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const res = await rest("ask_conversations?limit=1", { token: userA.accessToken });
  assert.equal(res.status, 200, "authenticated select works (table exists, grants ok)");
  assert.ok(Array.isArray(res.json));
});

// ── RLS: anonymous ───────────────────────────────────────────────────────────
test("integration RLS: anonymous cannot read ask data", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const res = await rest("ask_conversations?limit=5", {});
  // Either an explicit auth error, or an empty set (RLS hides every row).
  assert.ok(res.status === 401 || res.status === 403 || (res.status === 200 && res.json?.length === 0),
    `anon read must be blocked or empty (got ${res.status} ${res.text.slice(0, 80)})`);
});

test("integration RLS: anonymous cannot insert ask data", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const res = await rest("ask_conversations", {
    method: "POST",
    body: { id: randomUUID(), owner_id: userA.id, title: "anon attempt" },
  });
  assert.ok(res.status >= 400, `anon insert must fail (got ${res.status})`);
});

// ── RLS: cross-user isolation ────────────────────────────────────────────────
test("integration RLS: a user cannot insert a conversation owned by someone else", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const res = await rest("ask_conversations", {
    token: userA.accessToken,
    method: "POST",
    body: { id: randomUUID(), owner_id: userB.id, title: "spoofed owner" },
  });
  assert.ok(res.status >= 400, `with_check must reject a spoofed owner_id (got ${res.status})`);
  assert.match(res.text, /row-level security|violates/i);
});

test("integration RLS: a user cannot read or modify another user's conversation", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  // A creates a conversation + message through the real store.
  const storeA = createSupabaseAskStore(authFor(userA));
  const convId = randomUUID();
  const stamp = new Date().toISOString();
  await storeA.createConversation(userA.id, { id: convId, title: "A private", birth_profile_id: null, created_at: stamp, updated_at: stamp });
  await storeA.insertMessage(userA.id, {
    id: randomUUID(), conversation_id: convId, question: "A secret question",
    answer: "A answer", answer_parts: {}, evidence: [{ label: "Natal Venus in Gemini" }],
    themes: [], question_type: ["natal-placement"], birth_time_reliability: "exact",
    detail_mode: "Simple", active_chart_id: null, provider: "deterministic",
    engine_version: ASK_ENGINE_VERSION, status: "ok", created_at: stamp,
  });

  // B must not see it.
  const bReadConv = await rest(`ask_conversations?id=eq.${convId}`, { token: userB.accessToken });
  assert.equal(bReadConv.status, 200);
  assert.equal(bReadConv.json.length, 0, "B must not read A's conversation");

  const bReadMsgs = await rest(`ask_messages?conversation_id=eq.${convId}`, { token: userB.accessToken });
  assert.equal(bReadMsgs.json.length, 0, "B must not read A's messages");

  // B must not update or delete it.
  const bUpdate = await rest(`ask_conversations?id=eq.${convId}`, { token: userB.accessToken, method: "PATCH", body: { title: "hijacked" }, prefer: "return=representation" });
  assert.ok(bUpdate.status >= 400 || (bUpdate.json || []).length === 0, "B must not update A's conversation");

  const bDelete = await rest(`ask_conversations?id=eq.${convId}`, { token: userB.accessToken, method: "DELETE", prefer: "return=representation" });
  assert.ok(bDelete.status >= 400 || (bDelete.json || []).length === 0, "B must not delete A's conversation");

  // A still sees it intact.
  const aRead = await rest(`ask_conversations?id=eq.${convId}`, { token: userA.accessToken });
  assert.equal(aRead.json.length, 1);
  assert.equal(aRead.json[0].title, "A private", "A's conversation survived B's attempts");

  // The service layer also refuses to hand it to B.
  const svcB = makeService(userB);
  await assert.rejects(() => svcB.getConversation(userB.id, convId), /not found/i);
});

// ── Real persistence through the service (survives a new service instance) ───
function makeService(user, { chart = null, sky = null, detail = "Simple" } = {}) {
  const store = createSupabaseAskStore(authFor(user));
  const chartSvc = {
    async getActive() {
      return chart ? { profile: { id: chart.profileId, nickname: chart.nickname, time_accuracy: chart.chart.time_accuracy }, chart: chart.chart } : null;
    },
  };
  return createAskService({
    store, chartSvc,
    getDetail: async () => detail,
    getSky: async () => sky,
    provider: null, useModel: false,
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  });
}

function syntheticChart(timeAccuracy = "exact") {
  // Entirely synthetic — no real birth data.
  const planets = {
    Sun: { sign: "Leo", degrees: 15, minutes: 0, longitude: 135, speed: 1, retrograde: false },
    Moon: { sign: "Scorpio", degrees: 3, minutes: 0, longitude: 213, speed: 13, retrograde: false },
    Mercury: { sign: "Virgo", degrees: 2, minutes: 0, longitude: 152, speed: 1.2, retrograde: false },
    Venus: { sign: "Gemini", degrees: 20, minutes: 0, longitude: 80, speed: 1.1, retrograde: false },
    Mars: { sign: "Aries", degrees: 10, minutes: 0, longitude: 10, speed: 0.6, retrograde: false },
    Jupiter: { sign: "Taurus", degrees: 5, minutes: 0, longitude: 35, speed: 0.1, retrograde: false },
    Saturn: { sign: "Pisces", degrees: 12, minutes: 0, longitude: 342, speed: -0.02, retrograde: true },
  };
  const known = timeAccuracy !== "unknown";
  return {
    time_known: known, time_accuracy: timeAccuracy,
    planets,
    planet_houses: known ? { Sun: 10, Moon: 1, Venus: 8, Saturn: 5 } : {},
    big_three: {
      sun: { sign: "Leo" }, moon: { sign: "Scorpio" },
      rising: known ? { sign: "Scorpio", degrees: 0, minutes: 0 } : { unavailable: true, reason: "Birth time required" },
    },
    angles: known ? { ascendant: { sign: "Scorpio" }, midheaven: { sign: "Leo" } } : { ascendant: null, midheaven: null },
    aspects: [{ a: "Venus", b: "Saturn", aspect: "Trine", orb: 0.5, exactAngle: 120 }],
    element_balance: { dominant: "Water", percentages: {} },
    modality_balance: { dominant: "Fixed", percentages: {} },
    chart_ruler: "Mars", retrogrades: ["Saturn"],
    warnings: known ? [] : ["birth_time_unknown", "houses_unavailable", "rising_unavailable"],
    calculation_status: known ? "complete" : "partial",
  };
}

test("integration: an answer persists and is readable by a NEW service instance", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const profile = await makeSyntheticProfile(userA, "Synthetic Chart", "exact");
  const chartId = profile.id;
  const svc = makeService(userA, { chart: { profileId: chartId, nickname: "Synthetic Chart", chart: syntheticChart("exact") } });
  const res = await svc.ask(userA.id, { question: "What does my Venus placement say about relationships?" });
  assert.ok(res.conversation.id);
  assert.equal(res.message.status, "ok");

  // A brand-new service instance (simulating a server restart) must see it.
  const fresh = makeService(userA, { chart: { profileId: chartId, nickname: "Synthetic Chart", chart: syntheticChart("exact") } });
  const reopened = await fresh.getConversation(userA.id, res.conversation.id);
  assert.equal(reopened.messages.length, 1, "message survived a new service instance");
  const m = reopened.messages[0];
  assert.equal(m.question, "What does my Venus placement say about relationships?");
  assert.ok(Array.isArray(m.evidence) && m.evidence.length > 0, "evidence persisted");
  assert.equal(m.engine_version, ASK_ENGINE_VERSION, "engine version persisted");
  assert.equal(m.active_chart_id, chartId, "active chart traceable");
  assert.ok(Array.isArray(m.question_type) && m.question_type.length > 0, "question type persisted");
  assert.equal(m.detail_mode, "Simple");
});

test("integration: message ordering is stable across turns", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const p = await makeSyntheticProfile(userA, "Ordering", "exact");
  const svc = makeService(userA, { chart: { profileId: p.id, nickname: "Ordering", chart: syntheticChart("exact") } });
  const first = await svc.ask(userA.id, { question: "First question about Venus" });
  await new Promise((r) => setTimeout(r, 25));
  await svc.ask(userA.id, { question: "Second question about Saturn", conversationId: first.conversation.id });
  const { messages } = await svc.getConversation(userA.id, first.conversation.id);
  assert.equal(messages.length, 2);
  assert.match(messages[0].question, /First/);
  assert.match(messages[1].question, /Second/, "messages come back oldest-first");
});

test("integration: unknown birth time never persists Rising, houses, or angles", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const p = await makeSyntheticProfile(userA, "NoTime", "unknown");
  const svc = makeService(userA, { chart: { profileId: p.id, nickname: "NoTime", chart: syntheticChart("unknown") } });
  const res = await svc.ask(userA.id, { question: "What house is my Sun in and what is my rising sign?" });
  const fresh = makeService(userA, { chart: { profileId: p.id, nickname: "NoTime", chart: syntheticChart("unknown") } });
  const { messages } = await fresh.getConversation(userA.id, res.conversation.id);
  const stored = messages[0];
  assert.equal(stored.birth_time_reliability, "unknown");
  const blob = JSON.stringify(stored.evidence);
  assert.ok(!/Rising sign [A-Z]/.test(blob), "no Rising sign in persisted evidence");
  assert.ok(!/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th) house\b/.test(blob), "no house in persisted evidence");
  assert.ok(!/Ascendant|Midheaven|\bMC\b/.test(blob), "no angles in persisted evidence");
  assert.match(blob, /Birth time is unknown/i, "the limitation is persisted");
});

test("integration: approximate birth time persists its caution", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const p = await makeSyntheticProfile(userA, "Approx", "approximate");
  const svc = makeService(userA, { chart: { profileId: p.id, nickname: "Approx", chart: syntheticChart("approximate") } });
  const res = await svc.ask(userA.id, { question: "What does my chart say about my career?" });
  const fresh = makeService(userA, { chart: { profileId: p.id, nickname: "Approx", chart: syntheticChart("approximate") } });
  const { messages } = await fresh.getConversation(userA.id, res.conversation.id);
  assert.equal(messages[0].birth_time_reliability, "approximate");
  assert.match(JSON.stringify(messages[0].evidence), /approximate/i, "approximate caution survived storage");
});

test("integration: a failed answer is persisted as failed and keeps the question", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const failProfile = await makeSyntheticProfile(userA, "FailCase", "exact");
  const store = createSupabaseAskStore(authFor(userA));
  const svc = createAskService({
    store,
    chartSvc: { async getActive() { return { profile: { id: failProfile.id, nickname: "FailCase", time_accuracy: "exact" }, chart: syntheticChart("exact") }; } },
    getDetail: async () => "Simple",
    getSky: async () => null,
    provider: null, useModel: false,
    generate: async () => { throw new Error("simulated generation failure"); },
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
  });
  await assert.rejects(() => svc.ask(userA.id, { question: "this will fail to generate" }), /couldn't generate/i);
  const convos = await svc.listConversations(userA.id, { limit: 50 });
  const found = [];
  for (const c of convos) {
    const msgs = await store.listMessages(userA.id, c.id);
    found.push(...msgs.filter((m) => m.question === "this will fail to generate"));
  }
  assert.equal(found.length, 1, "the failed turn was persisted exactly once");
  assert.equal(found[0].status, "failed", "stored as failed, not ok");
  assert.equal(found[0].answer, null, "no fabricated answer was saved");
});

test("integration: conversations list is owner-scoped", async (t) => {
  if (!reachable) return t.skip(skipMsg());
  const pA = await makeSyntheticProfile(userA, "ScopeA", "exact");
  const pB = await makeSyntheticProfile(userB, "ScopeB", "exact");
  const svcA = makeService(userA, { chart: { profileId: pA.id, nickname: "ScopeA", chart: syntheticChart("exact") } });
  const svcB = makeService(userB, { chart: { profileId: pB.id, nickname: "ScopeB", chart: syntheticChart("exact") } });
  const a = await svcA.ask(userA.id, { question: "A only question" });
  const bList = await svcB.listConversations(userB.id, { limit: 50 });
  assert.ok(!bList.some((c) => c.id === a.conversation.id), "B's list never contains A's conversation");
});
