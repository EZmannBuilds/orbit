// Orbit :: charts / sky HTTP dispatch (transport-agnostic).
//
// Returns { status, body } so server.js can stay thin. Ownership comes from the
// authenticated server identity (currentOwnerId), never from the client. IDs are
// validated. Errors map to structured JSON without leaking internals.

import { createChartService, previewChart, ChartError } from "./service.js";
import { supabaseChartStore, currentOwnerId, isConfigured } from "./store.js";
import { currentSky } from "../astro/current-sky.js";

const svc = createChartService(supabaseChartStore);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status, error, extra = {}) { return { status, body: { ok: false, error, ...extra } }; }
function ok(body) { return { status: 200, body: { ok: true, ...body } }; }

function mapError(e) {
  if (e instanceof ChartError) {
    const status = { not_found: 404, invalid_input: 400, last_chart: 409 }[e.code] || 400;
    return err(status, e.message, { code: e.code });
  }
  return err(500, "Chart operation failed");
}

function requireOwner() {
  const owner = currentOwnerId();
  if (!owner || !isConfigured()) {
    return { owner: null, guard: err(401, "Sign-in required. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, and SUPABASE_OWNER_ID for the current user.") };
  }
  return { owner, guard: null };
}

// route: pathname (already known to start with the handled prefixes)
// Returns null if this module doesn't own the route.
export async function handleChartsRoute(method, route, query, body) {
  // ── current sky (public astronomy, no owner needed) ──
  if (route === "/api/sky/current" && method === "GET") {
    return ok({ sky: currentSky() });
  }
  if (route === "/api/moon/current" && method === "GET") {
    const sky = currentSky();
    return ok({ moon: sky.moon, instant_utc: sky.instant_utc, timezone: "UTC" });
  }

  // Stateless natal preview (no persistence, no owner needed).
  if (route === "/api/chart/preview" && method === "POST") {
    try { return ok({ chart: previewChart(body || {}) }); }
    catch (e) { return mapError(e); }
  }

  if (!route.startsWith("/api/charts")) return null;

  const { owner, guard } = requireOwner();
  if (guard) return guard;

  // /api/charts
  if (route === "/api/charts") {
    if (method === "GET") { return ok(await svc.list(owner)); }
    if (method === "POST") {
      try { return ok(await svc.create(owner, body || {})); }
      catch (e) { return mapError(e); }
    }
    return err(405, "Method not allowed");
  }

  // /api/charts/:id[/action]
  const rest = route.slice("/api/charts/".length);
  const [id, action] = rest.split("/");
  if (!UUID_RE.test(id)) return err(400, "Invalid chart id");

  try {
    if (!action) {
      if (method === "GET") return ok(await svc.get(owner, id));
      if (method === "PATCH") return ok(await svc.update(owner, id, body || {}));
      if (method === "DELETE") {
        const confirmEmpty = query.get("confirmEmpty") === "true" || body?.confirmEmpty === true;
        return ok(await svc.remove(owner, id, { confirmEmpty }));
      }
      return err(405, "Method not allowed");
    }
    if (action === "activate" && method === "POST") return ok(await svc.activate(owner, id));
    if (action === "calculate" && method === "POST") return ok(await svc.calculate(owner, id, { force: body?.force === true }));
    return err(404, "Unknown chart route");
  } catch (e) {
    return mapError(e);
  }
}
