// Orbit :: charts / sky HTTP dispatch (transport-agnostic).
//
// Returns { status, body } so server.js can stay thin. Ownership comes from the
// authenticated server identity (currentOwnerId), never from the client. IDs are
// validated. Errors map to structured JSON without leaking internals.

import { createChartService, previewChart, ChartError } from "./service.js";
import { buildChartReading } from "../interpretation/service.js";
import { composeHighlights, moonState } from "../home/highlights.js";
import { composePositions, composeSkySummary, calculationDetails } from "../positions/positions.js";
import { findTransits, groupTransits, summarise, birthTimeNotice } from "../transits/transits.js";
import { LocationError } from "../locations/geoapify.js";
import { createSupabaseChartStore, supabaseChartStore, currentOwnerId, isConfigured } from "./store.js";
import { currentSky, nextLunarEvents } from "../astro/current-sky.js";
import { createCurrentSkyContext } from "../astro/current-sky-context.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function err(status, error, extra = {}) { return { status, body: { ok: false, error, ...extra } }; }
function ok(body) { return { status: 200, body: { ok: true, ...body } }; }

// Swiss Ephemeris runs a subprocess per call; the sky snapshot only needs
// minute-level freshness, so cache it briefly instead of shelling out on
// every request (e.g. Home polling, repeated tab renders).
const SKY_CACHE_MS = 60_000;
let skyCache = { at: 0, sky: null, lunarEvents: null };
function cachedCurrentSkyContext(timezoneName) {
  const now = Date.now();
  if (!skyCache.sky || now - skyCache.at > SKY_CACHE_MS) {
    const instant = new Date(now);
    skyCache = {
      at: now,
      sky: currentSky(instant),
      lunarEvents: nextLunarEvents(instant),
    };
  }
  return createCurrentSkyContext({
    at: new Date(skyCache.sky.instant_utc),
    timezoneName,
    timezoneSource: "request",
    skySnapshot: skyCache.sky,
    lunarEventsSnapshot: skyCache.lunarEvents,
  });
}

function mapError(e) {
  if (e instanceof ChartError) {
    const status = { not_found: 404, invalid_input: 400, last_chart: 409 }[e.code] || 400;
    return err(status, e.message, { code: e.code });
  }
  // Saving a chart verifies the birthplace signature, and that verification
  // needs the same provider key the search used. When the key is absent the
  // signer raises a LocationError, which is a configuration answer — not a
  // crash — and used to surface as a bare 500 "Chart operation failed". That
  // told the person nothing and told the operator nothing either.
  if (e instanceof LocationError) {
    return err(e.status || 400, e.message, { code: e.code });
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
    // Highlights and Moon state are composed here, server-side, for the same
    // reason the chart reading is: one ranker, one Moon accessor, and no way
    // for the browser to grow a second opinion about either.
    const sky = cachedCurrentSkyContext(query?.get?.("tz"));
    return ok({
      sky,
      highlights: composeHighlights(sky),
      moon: moonState(sky),
      // Positions reads the same snapshot Home does, so the two pages cannot
      // disagree about the Sun, the Moon, or the retrograde count.
      positions: composePositions(sky),
      summary: composeSkySummary(sky),
      calculation: calculationDetails(sky),
    });
  }
  if (route === "/api/moon/current" && method === "GET") {
    const context = cachedCurrentSkyContext(query?.get?.("tz"));
    return ok({
      context_version: context.context_version,
      moon: context.moon,
      calculated_at_utc: context.calculated_at_utc,
      instant_utc: context.instant_utc,
      timezone_name: context.timezone_name,
      timezone_source: context.timezone_source,
      timezone_fallback: context.timezone_fallback,
      local_date: context.local_date,
      local_date_time: context.local_date_time,
      local_time_iso: context.local_time_iso,
      next_full_moon: context.next_full_moon,
      next_new_moon: context.next_new_moon,
      source: context.source,
    });
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
      if (method === "GET") {
        // The reading is composed here, server-side, so the browser has exactly
        // one source for interpretation text and no way to invent a second.
        const result = await svc.get(owner, id);
        return ok({ ...result, reading: buildChartReading(result.chart, result.profile) });
      }
      if (method === "PATCH") return ok(await svc.update(owner, id, body || {}));
      if (method === "DELETE") {
        const confirmEmpty = query.get("confirmEmpty") === "true" || body?.confirmEmpty === true;
        return ok(await svc.remove(owner, id, { confirmEmpty }));
      }
      return err(405, "Method not allowed");
    }
    // Personal transits: the shared sky measured against ONE owned chart.
    // Ownership is enforced by svc.get, so a chart id belonging to someone
    // else fails here exactly as it does everywhere else.
    if (action === "transits" && method === "GET") {
      const { chart } = await svc.get(owner, id);
      const sky = cachedCurrentSkyContext(query?.get?.("tz"));
      const groups = groupTransits(findTransits(sky, chart));
      return ok({
        calculatedAt: sky.local_time_iso || null,
        timezone: sky.timezone_name || null,
        localDate: sky.local_date || null,
        summary: summarise(groups),
        immediate: groups.immediate,
        background: groups.background,
        all: groups.all,
        limitation: birthTimeNotice(chart),
      });
    }
    if (action === "activate" && method === "POST") return ok(await svc.activate(owner, id));
    if (action === "calculate" && method === "POST") return ok(await svc.calculate(owner, id, { force: body?.force === true }));
    return err(404, "Unknown chart route");
  } catch (e) {
    return mapError(e);
  }
}
