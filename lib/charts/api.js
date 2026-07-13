// Orbit :: charts / sky HTTP dispatch (transport-agnostic).
//
// Returns { status, body } so server.js can stay thin. Ownership comes from the
// authenticated server identity (currentOwnerId), never from the client. IDs are
// validated. Errors map to structured JSON without leaking internals.

import { DateTime } from "luxon";
import { createChartService, previewChart, ChartError } from "./service.js";
import { createSupabaseChartStore, supabaseChartStore, currentOwnerId, isConfigured } from "./store.js";
import { currentSky } from "../astro/current-sky.js";
import { isValidIanaTimezone } from "../locations/timezone.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status, error, extra = {}) { return { status, body: { ok: false, error, ...extra } }; }
function ok(body) { return { status: 200, body: { ok: true, ...body } }; }

// Swiss Ephemeris runs a subprocess per call; the sky snapshot only needs
// minute-level freshness, so cache it briefly instead of shelling out on
// every request (e.g. Home polling, repeated tab renders).
const SKY_CACHE_MS = 60_000;
let skyCache = { at: 0, sky: null };
function cachedCurrentSky() {
  const now = Date.now();
  if (!skyCache.sky || now - skyCache.at > SKY_CACHE_MS) {
    skyCache = { at: now, sky: currentSky(new Date(now)) };
  }
  return skyCache.sky;
}

// Attach a display-only local time/date for the requested (validated) zone.
// Never changes the astronomy — purely a presentation convenience so the UI
// doesn't need its own timezone math for "what day/time is it right now".
function withLocalTime(sky, tzParam) {
  const timezone_name = isValidIanaTimezone(tzParam) ? tzParam : "UTC";
  const local = DateTime.fromISO(sky.instant_utc, { zone: "utc" }).setZone(timezone_name);
  return { timezone_name, local_date: local.toISODate(), local_time_iso: local.toISO() };
}

function mapError(e) {
  if (e instanceof ChartError) {
    const status = { not_found: 404, invalid_input: 400, last_chart: 409 }[e.code] || 400;
    return err(status, e.message, { code: e.code });
  }
  return err(500, "Chart operation failed");
}

function serviceFor(auth = null) {
  return createChartService(auth ? createSupabaseChartStore(auth) : supabaseChartStore);
}

function requireOwner(auth = null) {
  if (auth?.ownerId && auth?.accessToken && auth?.anonKey && auth?.url) {
    return { owner: auth.ownerId, guard: null };
  }
  const owner = currentOwnerId();
  if (!owner || !isConfigured()) {
    return { owner: null, guard: err(401, "Sign-in required. Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN, and SUPABASE_OWNER_ID for the current user.") };
  }
  return { owner, guard: null };
}

// route: pathname (already known to start with the handled prefixes)
// Returns null if this module doesn't own the route.
export async function handleChartsRoute(method, route, query, body, auth = null) {
  // ── current sky (public astronomy, no owner needed) ──
  // Accepts an optional ?tz=<IANA zone> for display-only local time/date;
  // the astronomy itself is always computed at the UTC instant.
  if (route === "/api/sky/current" && method === "GET") {
    const sky = cachedCurrentSky();
    return ok({ sky: { ...sky, ...withLocalTime(sky, query?.get?.("tz")) } });
  }
  if (route === "/api/moon/current" && method === "GET") {
    const sky = cachedCurrentSky();
    const { timezone_name, local_date, local_time_iso } = withLocalTime(sky, query?.get?.("tz"));
    return ok({ moon: sky.moon, instant_utc: sky.instant_utc, timezone_name, local_date, local_time_iso });
  }

  // Stateless natal preview (no persistence, no owner needed).
  if (route === "/api/chart/preview" && method === "POST") {
    try { return ok({ chart: previewChart(body || {}) }); }
    catch (e) { return mapError(e); }
  }

  if (!route.startsWith("/api/charts")) return null;

  const { owner, guard } = requireOwner(auth);
  if (guard) return guard;
  const svc = serviceFor(auth);

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
