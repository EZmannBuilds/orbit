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

import { supabaseConfig } from "../local-llm/config.js";

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
export const supabaseAskStore = createSupabaseAskStore();
