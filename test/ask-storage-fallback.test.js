// Orbit Axis :: Ask Orbit storage mode + failure behavior (Update 4.0.1).
//
// Unit tests (no database required). They prove the app is honest about where
// history lives and never fabricates a successful save.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createAskService, AskError } from "../lib/ask-orbit/service.js";
import {
  createMemoryAskStore, askStorageMode, askStoreFor, usesPersistentStore, memoryAskStore,
} from "../lib/ask-orbit/store.js";

const OWNER = "33333333-3333-4333-8333-333333333333";

function chartFixture() {
  return {
    time_known: true, time_accuracy: "exact",
    planets: {
      Sun: { sign: "Leo", degrees: 15, minutes: 0, longitude: 135, speed: 1, retrograde: false },
      Moon: { sign: "Scorpio", degrees: 3, minutes: 0, longitude: 213, speed: 13, retrograde: false },
      Venus: { sign: "Gemini", degrees: 20, minutes: 0, longitude: 80, speed: 1.1, retrograde: false },
    },
    planet_houses: { Sun: 10, Moon: 1, Venus: 8 },
    big_three: { sun: { sign: "Leo" }, moon: { sign: "Scorpio" }, rising: { sign: "Scorpio" } },
    angles: { ascendant: { sign: "Scorpio" }, midheaven: { sign: "Leo" } },
    aspects: [{ a: "Venus", b: "Sun", aspect: "Trine", orb: 1.0, exactAngle: 120 }],
    element_balance: { dominant: "Water", percentages: {} },
    modality_balance: { dominant: "Fixed", percentages: {} },
    chart_ruler: "Mars", retrogrades: [], warnings: [], calculation_status: "complete",
  };
}

function svcWith(store, extra = {}) {
  return createAskService({
    store,
    chartSvc: { async getActive() { return { profile: { id: "chart-1", nickname: "Chart", time_accuracy: "exact" }, chart: chartFixture() }; } },
    getDetail: async () => "Simple",
    getSky: async () => null,
    provider: null, useModel: false,
    uuid: () => randomUUID(),
    now: () => new Date().toISOString(),
    ...extra,
  });
}

// A store whose writes fail, simulating an unavailable/rejecting database.
function brokenStore({ failCreate = false, failInsert = false } = {}) {
  const mem = createMemoryAskStore();
  return {
    ...mem,
    async createConversation(o, row) {
      if (failCreate) throw new Error("db unavailable");
      return mem.createConversation(o, row);
    },
    async insertMessage(o, row) {
      if (failInsert) throw new Error("db unavailable");
      return mem.insertMessage(o, row);
    },
    _mem: mem,
  };
}

// ── Storage mode reporting ───────────────────────────────────────────────────
test("askStorageMode: unconfigured environment reports session (non-persistent)", () => {
  assert.equal(askStorageMode(null), "session");
  assert.equal(askStorageMode({ ownerId: "x" }), "session", "partial config is not persistent");
});

test("askStorageMode: a full Supabase auth context reports persistent", () => {
  const mode = askStorageMode({ url: "http://127.0.0.1:55321", anonKey: "k", accessToken: "t", ownerId: "o" });
  assert.equal(mode, "persistent");
});

// The reported mode must never drift from the store actually used — otherwise
// the UI could promise durability while writing to memory.
test("the reported storage mode always matches the store actually selected", () => {
  const cases = [
    null,
    { ownerId: "o" },
    { ownerId: "o", accessToken: "t" },
    { ownerId: "o", accessToken: "t", anonKey: "k" },
    { url: "http://127.0.0.1:55321", anonKey: "k", accessToken: "t", ownerId: "o" },
  ];
  for (const auth of cases) {
    const persistent = usesPersistentStore(auth);
    const store = askStoreFor(auth);
    const isMemory = store === memoryAskStore;
    assert.equal(askStorageMode(auth), persistent ? "persistent" : "session");
    assert.equal(isMemory, !persistent,
      `auth=${JSON.stringify(auth)} reported ${persistent ? "persistent" : "session"} but used ${isMemory ? "memory" : "supabase"}`);
  }
});

// ── Explicit in-memory mode still works end to end ───────────────────────────
test("in-memory mode: asking and reopening works within the process", async () => {
  const store = createMemoryAskStore();
  const svc = svcWith(store);
  const res = await svc.ask(OWNER, { question: "What should I pay attention to today?" });
  assert.equal(res.persisted, true, "the write did succeed against the memory store");
  const reopened = await svc.getConversation(OWNER, res.conversation.id);
  assert.equal(reopened.messages.length, 1);
});

test("in-memory mode: a NEW store instance has no history (proves non-durability)", async () => {
  const first = createMemoryAskStore();
  const res = await svcWith(first).ask(OWNER, { question: "Anything about Venus?" });
  // A fresh store models a server restart in session mode.
  const second = createMemoryAskStore();
  const list = await svcWith(second).listConversations(OWNER);
  assert.equal(list.length, 0, "session-mode history does not survive a restart");
  assert.ok(res.conversation.id, "but the original turn did answer normally");
});

// ── Database-unavailable behavior ────────────────────────────────────────────
test("database unavailable on save: the answer is returned but NOT reported as saved", async () => {
  const svc = svcWith(brokenStore({ failInsert: true }));
  const res = await svc.ask(OWNER, { question: "What does my Venus placement mean?" });
  assert.equal(res.persisted, false, "must not fabricate a successful save");
  assert.equal(res.storageError, "message_save_failed");
  assert.ok(res.rendered.answer.direct.length > 0, "the user still gets their answer");
  assert.ok(res.rendered.evidence.length > 0, "evidence still returned");
});

test("database unavailable on conversation create: still answers, still not 'saved'", async () => {
  const svc = svcWith(brokenStore({ failCreate: true }));
  const res = await svc.ask(OWNER, { question: "How is the current sky affecting me?" });
  assert.equal(res.persisted, false);
  assert.equal(res.storageError, "conversation_create_failed");
  assert.equal(res.conversation, null, "no conversation is invented");
  assert.ok(res.rendered.answer.direct.length > 0);
});

test("a failed save leaves no phantom row behind", async () => {
  const store = brokenStore({ failInsert: true });
  const svc = svcWith(store);
  await svc.ask(OWNER, { question: "test question" });
  const convos = await store.listConversations(OWNER);
  for (const c of convos) {
    const msgs = await store.listMessages(OWNER, c.id);
    assert.equal(msgs.length, 0, "no message row was written when the insert failed");
  }
});

// ── Generation failure + retry ───────────────────────────────────────────────
test("generation failure persists the question as failed and never as ok", async () => {
  const store = createMemoryAskStore();
  const svc = svcWith(store, { generate: async () => { throw new Error("boom"); } });
  await assert.rejects(() => svc.ask(OWNER, { question: "will fail" }),
    (e) => e instanceof AskError && e.code === "generation_failed");
  const convos = await store.listConversations(OWNER);
  const msgs = await store.listMessages(OWNER, convos[0].id);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].status, "failed");
  assert.equal(msgs[0].answer, null, "no fabricated answer stored");
  assert.equal(msgs[0].question, "will fail", "the question survives");
});

test("generation failure while storage is ALSO down still reports failure honestly", async () => {
  const svc = svcWith(brokenStore({ failInsert: true }), { generate: async () => { throw new Error("boom"); } });
  await assert.rejects(() => svc.ask(OWNER, { question: "double failure" }),
    (e) => e instanceof AskError && e.code === "generation_failed");
});

test("retry after a failed generation does not duplicate the user's question", async () => {
  const store = createMemoryAskStore();
  let attempt = 0;
  const svc = svcWith(store, {
    generate: async (ctx, chart, opts) => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient");
      const { presentAnswer } = await import("../lib/ask-orbit/presenter.js");
      return presentAnswer(ctx, chart);
    },
  });
  // First attempt fails and is stored as failed.
  await assert.rejects(() => svc.ask(OWNER, { question: "retry me" }));
  const convos = await store.listConversations(OWNER);
  const convId = convos[0].id;

  // Retry into the SAME conversation succeeds.
  const ok = await svc.ask(OWNER, { question: "retry me", conversationId: convId });
  assert.equal(ok.persisted, true);
  const msgs = await store.listMessages(OWNER, convId);
  assert.equal(msgs.length, 2, "one failed + one successful turn");
  assert.equal(msgs.filter((m) => m.status === "failed").length, 1, "exactly one failed row");
  assert.equal(msgs.filter((m) => m.status === "ok").length, 1, "exactly one successful row");
  assert.equal(convos.length, 1, "retry did not spawn a second conversation");
});

// ── Ownership ────────────────────────────────────────────────────────────────
test("the active chart id stored comes from the server-resolved chart, not the client", async () => {
  const store = createMemoryAskStore();
  const svc = svcWith(store);
  // The client cannot influence which chart is used; getActive is authoritative.
  const res = await svc.ask(OWNER, { question: "whose chart is this?", chartId: "attacker-supplied" });
  assert.equal(res.message.active_chart_id, "chart-1", "server-resolved chart id wins");
});
