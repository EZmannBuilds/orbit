// Orbit Axis :: fortune / settings HTTP dispatch (transport-agnostic).
//
// Returns { status, body }. Owner derived from the authenticated server
// identity (never the client). A stateless /api/fortune/preview path composes a
// deterministic fortune from posted birth data with no persistence, so Today
// works in local dev before sign-in. Fortune responses carry per-level factor
// phrasings so the client renders Simple/Balanced/Advanced without extra calls.

import { createFortuneService, fortuneForProfile, FortuneError, DEFAULT_DETAIL } from "./service.js";
import { supabaseFortuneStore, currentOwnerId, isConfigured } from "./store.js";
import { createChartService } from "../charts/service.js";
import { supabaseChartStore } from "../charts/store.js";
import { sanitizePreviewInput } from "./sanitize.js";

const fortuneSvc = createFortuneService(supabaseFortuneStore);
const chartSvc = createChartService(supabaseChartStore);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status, error, extra = {}) { return { status, body: { ok: false, error, ...extra } }; }
function ok(body) { return { status: 200, body: { ok: true, ...body } }; }

function requireOwner() {
  const owner = currentOwnerId();
  if (!owner || !isConfigured()) {
    return { owner: null, guard: err(401, "Sign-in required. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, and SUPABASE_OWNER_ID for the current user.") };
  }
  return { owner, guard: null };
}

export async function handleFortuneRoute(method, route, query, body) {
  // ── stateless preview (no owner, no persistence) ──
  if (route === "/api/fortune/preview" && method === "POST") {
    let input;
    try { input = sanitizePreviewInput(body || {}); }
    catch (e) { return err(400, e.message); }
    const fortune = fortuneForProfile({ ...input, id: "local" }, new Date());
    return ok({ fortune, detail_level: (body && body.detail_level) || DEFAULT_DETAIL, cached: false, persisted: false });
  }

  // ── detail-level setting ──
  if (route === "/api/settings/detail") {
    const { owner, guard } = requireOwner();
    if (method === "GET") {
      if (!owner) return ok({ astrology_detail_level: DEFAULT_DETAIL, persisted: false });
      try { return ok({ astrology_detail_level: await fortuneSvc.getDetail(owner), persisted: true }); }
      catch { return ok({ astrology_detail_level: DEFAULT_DETAIL, persisted: false }); }
    }
    if (method === "PUT" || method === "POST") {
      if (guard) return guard;
      try { return ok(await fortuneSvc.setDetail(owner, body?.astrology_detail_level)); }
      catch (e) { return err(e instanceof FortuneError ? 400 : 500, e.message); }
    }
    return err(405, "Method not allowed");
  }

  if (!route.startsWith("/api/fortune")) return null;

  const { owner, guard } = requireOwner();
  if (guard) return guard;

  // ── today's fortune for the active chart ──
  if (route === "/api/fortune/today" && method === "GET") {
    let active;
    try { active = await chartSvc.getActive(owner); }
    catch (e) { return err(500, "Could not load active chart"); }
    if (!active) return err(404, "No active chart. Add a chart to see your daily fortune.", { code: "no_active_chart" });
    try {
      const [{ fortune, cached }, detail] = await Promise.all([
        fortuneSvc.today(owner, active.profile),
        fortuneSvc.getDetail(owner),
      ]);
      return ok({ fortune, cached, detail_level: detail, chart: { id: active.profile.id, nickname: active.profile.nickname } });
    } catch (e) {
      return err(e instanceof FortuneError ? 400 : 500, e.message);
    }
  }

  // ── history ──
  if (route === "/api/fortune/history" && method === "GET") {
    const scope = query.get("scope") || "active"; // active | all | specific
    let birthProfileId = null;
    if (scope === "active") {
      const active = await chartSvc.getActive(owner);
      birthProfileId = active?.profile?.id || null;
      if (!birthProfileId) return ok({ fortunes: [], scope, note: "No active chart yet." });
    } else if (scope === "specific") {
      birthProfileId = query.get("chart_id");
      if (!birthProfileId || !UUID_RE.test(birthProfileId)) return err(400, "scope=specific requires a valid chart_id");
    }
    const limit = Math.min(Number(query.get("limit")) || 30, 30);
    const fortunes = await fortuneSvc.history(owner, { birthProfileId, limit });
    return ok({ fortunes, scope, count: fortunes.length });
  }

  // ── single fortune by id ──
  const m = route.match(/^\/api\/fortune\/([^/]+)$/);
  if (m && method === "GET") {
    const id = m[1];
    if (!UUID_RE.test(id)) return err(400, "Invalid fortune id");
    const list = await fortuneSvc.history(owner, { limit: 30 });
    const found = list.find((f) => f.id === id);
    return found ? ok({ fortune: found }) : err(404, "Fortune not found");
  }

  return err(404, "Unknown fortune route");
}
