// Orbit Axis :: daily-fortune persistence (Supabase REST).
//
// Owner-scoped; RLS enforces ownership at the database. Writes need a signed-in
// user access token — without one the store reports { ok:false, skipped:true }
// so callers degrade cleanly (the deterministic fortune still composes; it just
// isn't cached to Supabase). Also reads/writes the detail-level preference on
// the existing profiles row (no duplicate settings system).

import { supabaseConfig } from "../local-llm/config.js";

function base() {
  const { url, anonKey, accessToken, ownerId } = supabaseConfig();
  if (!url || !anonKey || !accessToken || !ownerId) return { ready: false };
  return {
    ready: true, ownerId, root: url.replace(/\/+$/, ""),
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
  };
}

async function req(method, pathQuery, body, extraHeaders = {}) {
  const b = base();
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

export const supabaseFortuneStore = {
  async getFortune(birthProfileId, fortuneDate, engineVersion) {
    const r = await req("GET",
      `daily_fortunes?birth_profile_id=eq.${birthProfileId}&fortune_date=eq.${fortuneDate}&fortune_engine_version=eq.${engineVersion}&limit=1`);
    return r.ok && r.data?.length ? r.data[0] : null;
  },
  async insertFortune(row) {
    const r = await req("POST", "daily_fortunes", row, { prefer: "return=representation,resolution=merge-duplicates" });
    if (!r.ok) throw new Error(r.error || r.reason || "fortune_insert_failed");
    return Array.isArray(r.data) ? r.data[0] : r.data;
  },
  async listHistory(ownerId, { birthProfileId = null, limit = 30 } = {}) {
    let q = `daily_fortunes?owner_id=eq.${ownerId}&order=fortune_date.desc&limit=${limit}`;
    if (birthProfileId) q += `&birth_profile_id=eq.${birthProfileId}`;
    const r = await req("GET", q);
    return r.ok ? r.data : [];
  },
  async getDetailLevel(ownerId) {
    const r = await req("GET", `profiles?user_id=eq.${ownerId}&select=astrology_detail_level&limit=1`);
    return r.ok && r.data?.length ? r.data[0].astrology_detail_level : null;
  },
  async setDetailLevel(ownerId, level) {
    const r = await req("POST", "profiles?on_conflict=user_id",
      { user_id: ownerId, astrology_detail_level: level },
      { prefer: "resolution=merge-duplicates,return=minimal" });
    if (!r.ok) throw new Error(r.error || r.reason || "set_detail_failed");
    return true;
  },
};
