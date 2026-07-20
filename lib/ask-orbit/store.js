// Orbit Axis :: Ask Orbit conversation persistence (Update 4.0).
//
// Two interchangeable stores behind one interface:
//   - createSupabaseAskStore(auth): owner-scoped Supabase REST, RLS-enforced.
//   - createMemoryAskStore(): in-process, owner-scoped. Used by tests and as a
//     documented local-dev fallback when Supabase isn't configured, so Ask Orbit
//     history works locally without a database. The memory store is NOT a second
//     source of truth for signed-in users — when Supabase is configured it is the
//     authority; the memory store only holds data for the local/unconfigured case.
//
// Row shapes mirror the ask_conversations / ask_messages migration. Evidence and
// question_type are stored so a past answer stays reproducible.
//
// Update 4.0.3 adds a third case for serverless deployments. On Vercel a
// function instance can be destroyed between two requests, so the in-memory
// store is not a "fallback" there — it is data loss that looks like success.
// When the environment requires durable storage and Supabase is not usable,
// askStoreFor() returns a store that refuses every write. The Ask service
// already treats a write failure honestly (the answer is still generated and
// returned, `persisted` is false, and the user is told it was not saved), so
// the visible outcome is an accurate warning rather than a silent loss.

import { supabaseConfig } from "../local-llm/config.js";
import { resolveEnvironment } from "../env/environment.js";

function base(auth = null) {
  const config = supabaseConfig();
  const url = auth?.url || config.url;
  const anonKey = auth?.anonKey || config.anonKey;
  const accessToken = auth?.accessToken || config.accessToken;
  const ownerId = auth?.ownerId || config.ownerId;
  if (!url || !anonKey || !accessToken || !ownerId) return { ready: false };
  return {
    ready: true, ownerId, root: url.replace(/\/+$/, ""),
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  };
}

async function req(auth, method, pathQuery, body, extraHeaders = {}) {
  const b = base(auth);
  if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
  const res = await fetch(`${b.root}/rest/v1/${pathQuery}`, {
    method, headers: { ...b.headers, ...extraHeaders }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  const text = await res.text();
  return { ok: true, data: text ? JSON.parse(text) : null };
}

export function currentOwnerId() { return supabaseConfig().ownerId || null; }
export function isConfigured() { return base().ready; }

// Single source of truth for "will this request actually persist?".
// askStoreFor() and askStorageMode() are both derived from it so the reported
// mode can never drift from the store that is really used — the app must never
// imply permanence while it is writing to memory.
export function usesPersistentStore(auth = null) {
  return !!(auth?.ownerId && auth?.accessToken && auth?.anonKey && auth?.url);
}

// True when this process must not pretend that memory is storage: any Vercel
// deployment, plus explicit preview/production environments.
function requiresDurableStorage(env = null) {
  return Boolean((env ?? resolveEnvironment()).requiresPersistentStorage);
}

// "persistent"  — Supabase; conversations survive a restart.
// "session"     — in-memory fallback; history clears when the server stops.
//                 Only offered where a process actually outlives a request.
// "unavailable" — durable storage is required but not usable. Nothing is
//                 written, and the caller reports that plainly.
export function askStorageMode(auth = null, env = null) {
  if (usesPersistentStore(auth)) return "persistent";
  return requiresDurableStorage(env) ? "unavailable" : "session";
}

export function askStoreFor(auth = null, env = null) {
  if (usesPersistentStore(auth)) return createSupabaseAskStore(auth);
  if (requiresDurableStorage(env)) return unavailableAskStore;
  return memoryAskStore;
}

// ── refusing store ───────────────────────────────────────────────────────────
// Reads return empty (there is genuinely no history to show) and writes throw.
// Throwing is deliberate: the Ask service catches store failures, still returns
// the generated answer, and marks `persisted: false`, so the user sees their
// question and a truthful "this couldn't be saved" note instead of a history
// entry that will not exist on the next request.
export function createUnavailableAskStore() {
  const refuse = () => { throw new Error("ask_storage_unavailable"); };
  return {
    async createConversation() { return refuse(); },
    async listConversations() { return []; },
    async getConversation() { return null; },
    async listMessages() { return []; },
    async insertMessage() { return refuse(); },
    async touchConversation() { return refuse(); },
  };
}

export function createSupabaseAskStore(auth = null) {
  return {
    async createConversation(ownerId, row) {
      const r = await req(auth, "POST", "ask_conversations",
        { owner_id: ownerId, ...row },
        { prefer: "return=representation" });
      if (!r.ok) throw new Error(r.error || r.reason || "conversation_insert_failed");
      return Array.isArray(r.data) ? r.data[0] : r.data;
    },
    async listConversations(ownerId, { limit = 20 } = {}) {
      const r = await req(auth, "GET",
        `ask_conversations?owner_id=eq.${ownerId}&order=updated_at.desc&limit=${limit}`);
      return r.ok && Array.isArray(r.data) ? r.data : [];
    },
    async getConversation(ownerId, id) {
      const r = await req(auth, "GET",
        `ask_conversations?owner_id=eq.${ownerId}&id=eq.${id}&limit=1`);
      return r.ok && r.data?.length ? r.data[0] : null;
    },
    async listMessages(ownerId, conversationId, { limit = 100 } = {}) {
      const r = await req(auth, "GET",
        `ask_messages?owner_id=eq.${ownerId}&conversation_id=eq.${conversationId}&order=created_at.asc&limit=${limit}`);
      return r.ok && Array.isArray(r.data) ? r.data : [];
    },
    async insertMessage(ownerId, row) {
      const r = await req(auth, "POST", "ask_messages",
        { owner_id: ownerId, ...row },
        { prefer: "return=representation" });
      if (!r.ok) throw new Error(r.error || r.reason || "message_insert_failed");
      return Array.isArray(r.data) ? r.data[0] : r.data;
    },
    async touchConversation(ownerId, id, patch) {
      const r = await req(auth, "PATCH",
        `ask_conversations?owner_id=eq.${ownerId}&id=eq.${id}`,
        { ...patch, updated_at: new Date().toISOString() },
        { prefer: "return=minimal" });
      if (!r.ok) throw new Error(r.error || r.reason || "conversation_update_failed");
      return true;
    },
  };
}

// ── in-memory store (tests + local fallback) ─────────────────────────────────
// Deterministic ids are injected by the caller (service passes a uuid + now), so
// this stays free of ambient Date/random and is safe in the test runner.
export function createMemoryAskStore() {
  const conversations = new Map(); // id -> row
  const messages = [];             // rows
  const scoped = (ownerId, row) => row && row.owner_id === ownerId;
  return {
    _conversations: conversations,
    _messages: messages,
    async createConversation(ownerId, row) {
      const rec = { owner_id: ownerId, ...row };
      conversations.set(rec.id, rec);
      return rec;
    },
    async listConversations(ownerId, { limit = 20 } = {}) {
      return [...conversations.values()]
        .filter((c) => scoped(ownerId, c))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, limit);
    },
    async getConversation(ownerId, id) {
      const c = conversations.get(id);
      return scoped(ownerId, c) ? c : null;
    },
    async listMessages(ownerId, conversationId, { limit = 100 } = {}) {
      return messages
        .filter((m) => scoped(ownerId, m) && m.conversation_id === conversationId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, limit);
    },
    async insertMessage(ownerId, row) {
      const rec = { owner_id: ownerId, ...row };
      messages.push(rec);
      return rec;
    },
    async touchConversation(ownerId, id, patch) {
      const c = conversations.get(id);
      if (scoped(ownerId, c)) Object.assign(c, patch);
      return true;
    },
  };
}

// Process-wide memory store for the local/unconfigured runtime path.
export const memoryAskStore = createMemoryAskStore();
export const unavailableAskStore = createUnavailableAskStore();
export const supabaseAskStore = createSupabaseAskStore();
