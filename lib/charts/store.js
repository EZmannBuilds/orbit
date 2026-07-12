// Orbit :: saved-chart persistence (Supabase REST).
//
// Owner-scoped. Every query is filtered by owner_id server-side and RLS
// enforces it again at the database. The client's owner_id is never trusted.
// Writes require a signed-in user access token (SUPABASE_ACCESS_TOKEN); without
// one the store reports { ok:false, skipped:true } so callers can degrade
// cleanly instead of leaking or corrupting data.

import { supabaseConfig } from "../local-llm/config.js";

function base() {
  const { url, anonKey, accessToken, ownerId } = supabaseConfig();
  if (!url || !anonKey || !accessToken || !ownerId) {
    return { ready: false };
  }
  return {
    ready: true, ownerId,
    root: url.replace(/\/+$/, ""),
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  };
}

async function req(method, pathQuery, body, extraHeaders = {}) {
  const b = base();
  if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
  const res = await fetch(`${b.root}/rest/v1/${pathQuery}`, {
    method,
    headers: { ...b.headers, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  const text = await res.text();
  return { ok: true, data: text ? JSON.parse(text) : null };
}

// Return the configured owner id (used to stamp owner_id on inserts).
export function currentOwnerId() {
  return supabaseConfig().ownerId || null;
}

export function isConfigured() {
  return base().ready;
}

export const supabaseChartStore = {
  async listProfiles(ownerId) {
    const r = await req("GET", `birth_profiles?owner_id=eq.${ownerId}&order=created_at.asc`);
    return r.ok ? r.data : [];
  },
  async getProfile(ownerId, id) {
    const r = await req("GET", `birth_profiles?owner_id=eq.${ownerId}&id=eq.${id}&limit=1`);
    return r.ok && r.data?.length ? r.data[0] : null;
  },
  async countProfiles(ownerId) {
    const r = await req("GET", `birth_profiles?owner_id=eq.${ownerId}&select=id`);
    return r.ok ? r.data.length : 0;
  },
  async insertProfile(row) {
    const r = await req("POST", "birth_profiles", row, { prefer: "return=representation" });
    if (!r.ok) throw new Error(r.error || r.reason || "insert_failed");
    return Array.isArray(r.data) ? r.data[0] : r.data;
  },
  async updateProfile(ownerId, id, patch) {
    const r = await req("PATCH", `birth_profiles?owner_id=eq.${ownerId}&id=eq.${id}`, patch, { prefer: "return=representation" });
    if (!r.ok) throw new Error(r.error || r.reason || "update_failed");
    return Array.isArray(r.data) ? r.data[0] : r.data;
  },
  async deleteProfile(ownerId, id) {
    const r = await req("DELETE", `birth_profiles?owner_id=eq.${ownerId}&id=eq.${id}`);
    if (!r.ok) throw new Error(r.error || r.reason || "delete_failed");
    return true;
  },
  async getActiveId(ownerId) {
    const r = await req("GET", `profiles?user_id=eq.${ownerId}&select=active_birth_profile_id&limit=1`);
    return r.ok && r.data?.length ? r.data[0].active_birth_profile_id : null;
  },
  async setActiveId(ownerId, id) {
    // upsert the profiles row for this user
    const r = await req("POST", "profiles?on_conflict=user_id",
      { user_id: ownerId, active_birth_profile_id: id },
      { prefer: "resolution=merge-duplicates,return=minimal" });
    if (!r.ok) throw new Error(r.error || r.reason || "set_active_failed");
    return true;
  },
  async getCalculation(birthProfileId, calcVersion, inputHash) {
    const r = await req("GET",
      `chart_calculations?birth_profile_id=eq.${birthProfileId}&calculation_version=eq.${calcVersion}&input_hash=eq.${inputHash}&limit=1`);
    return r.ok && r.data?.length ? r.data[0] : null;
  },
  async insertCalculation(row) {
    const r = await req("POST", "chart_calculations", row, { prefer: "return=representation" });
    if (!r.ok) throw new Error(r.error || r.reason || "calc_insert_failed");
    return Array.isArray(r.data) ? r.data[0] : r.data;
  },
};
