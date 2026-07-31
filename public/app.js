/* ============================================================================
   Orbit — Application Controller
   ----------------------------------------------------------------------------
   Drives the app shell: workspace router, data loading, render functions,
   command palette, toasts, and persisted appearance settings. All business
   logic lives server-side and is untouched — this file only reads the existing
   JSON API and paints the design-system components.
   ========================================================================== */

import { renderMoonSVG } from "./moon-phase.js";
import { decideStartupView, STARTUP_VIEW } from "./startup-state.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  symbols: [],
  chart: null,
  events: [],
  activeKind: "",
  atlasQuery: "",
  ready: false,
  activeChartName: "My Chart",
  auth: { restoring: true, user: null },
  charts: [],
  activeChartId: null,
  activeProfile: null,
  activeNatalChart: null,
  // Saved-chart request outcome. This is what onboarding keys off — an empty
  // `charts` array is NOT enough, because a failed request also leaves it empty
  // and a returning user must never be mistaken for a new one.
  chartsStatus: "idle", // idle | loading | ready | error
  // Startup phase: loading -> ready. Onboarding may only appear once startup
  // has resolved, which is what prevents the setup form from flashing.
  startup: "loading", // loading | ready
  onboardingDismissed: false, // session-only; stops it reopening after a close
  places: { selections: {}, controllers: {} },
};

/**
 * Read an API response without ever handing non-JSON to JSON.parse.
 *
 * THIS EXISTS BECAUSE OF A REAL FAILURE. On the deployed Preview, every /api
 * request was redirected away by a routing rule and answered by Vercel's own
 * "The page could not be found" page. The old wrapper called response.json()
 * unconditionally, so the browser tried to parse that sentence as JSON and the
 * user was shown the parser's complaint:
 *
 *   Chromium: Unexpected token 'T', "The page c"... is not valid JSON
 *   WebKit:   The string did not match the expected pattern.
 *
 * Neither message tells anyone what went wrong, and both leak the shape of the
 * infrastructure. A response that is not JSON is an infrastructure failure, and
 * it should read like one.
 *
 * @returns {{ ok: boolean, status: number, data: object|null, kind: string }}
 */
async function readApiResponse(response) {
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  const isJson = type.includes("application/json") || type.includes("+json");

  // A redirect that survived to here means the request left the application —
  // a login wall or a rewrite — and whatever came back is not Orbit's answer.
  if (response.redirected && !isJson) {
    return { ok: false, status: response.status, data: null, kind: "redirected" };
  }

  if (!isJson) {
    // Read and DISCARD the body. It is HTML or prose from something that is not
    // Orbit, and putting it in front of a user would show them a stack trace, a
    // login page, or a hosting provider's 404 dressed as an Orbit error.
    await response.text().catch(() => "");
    return {
      ok: false,
      status: response.status,
      data: null,
      kind: response.status === 404 ? "missing-route" : (type ? "not-json" : "empty"),
    };
  }

  const body = await response.text();
  if (!body.trim()) return { ok: response.ok, status: response.status, data: null, kind: "empty" };
  try {
    return { ok: response.ok, status: response.status, data: JSON.parse(body), kind: "json" };
  } catch {
    // Claimed JSON, was not. Still not the user's problem to decode.
    return { ok: false, status: response.status, data: null, kind: "malformed-json" };
  }
}

/** What to tell a person when the response was not the application's. */
function apiTransportMessage(kind, status) {
  switch (kind) {
    case "missing-route":
      return "Orbit could not reach the sign-in service. Please refresh and try again.";
    case "redirected":
      return "Your session with the preview expired. Refresh the page and sign in again.";
    case "empty":
      return "Orbit did not receive a reply. Please check your connection and try again.";
    default:
      return `Orbit could not reach the service (status ${status}). Please refresh and try again.`;
  }
}

async function request(path, { method = "GET", body = null } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      // same-origin keeps the Orbit session cookie AND, on a protected Vercel
      // Preview, the Vercel access cookie attached. A cross-origin call would
      // lose both and be answered by a login page instead of the application.
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error("Orbit could not be reached. Check your connection and try again.");
    error.status = 0;
    error.kind = "network";
    throw error;
  }

  const result = await readApiResponse(response);

  if (result.kind !== "json") {
    const error = new Error(apiTransportMessage(result.kind, result.status));
    error.status = result.status;
    error.kind = result.kind;   // diagnosable without exposing the body
    throw error;
  }

  const data = result.data ?? {};
  if (!result.ok) {
    const error = new Error(data.error || data.validation?.errors?.join("; ") || `HTTP ${result.status}`);
    error.data = data;
    error.status = result.status; // lets callers distinguish 401 from a real failure
    throw error;
  }
  return data;
}
async function get(path) { return request(path); }
async function post(path, body) { return request(path, { method: "POST", body }); }
async function put(path, body) { return request(path, { method: "PUT", body }); }
async function patch(path, body) { return request(path, { method: "PATCH", body }); }
async function del(path, body = null) { return request(path, { method: "DELETE", body }); }

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function clearPlaceSelection(prefix, message = "") {
  delete state.places.selections[prefix];
  const status = $(`#${prefix}-place-status`);
  const results = $(`#${prefix}-place-results`);
  if (status) status.textContent = message;
  if (results) results.innerHTML = "";
}

function setPlaceSelection(prefix, place, { existing = false } = {}) {
  state.places.selections[prefix] = { ...place, existing, label: place.label || place.birthplace_name || "" };
  const input = $(`#${prefix}-place`);
  const status = $(`#${prefix}-place-status`);
  const results = $(`#${prefix}-place-results`);
  if (input) input.value = state.places.selections[prefix].label;
  if (status) status.textContent = existing ? "Saved location will be reused." : "Location selected. Timezone will be detected automatically.";
  if (results) results.innerHTML = "";
}

function chartPlace(chart) {
  if (!chart?.birthplace_name || chart.latitude == null || chart.longitude == null) return null;
  return {
    label: chart.birthplace_name,
    latitude: chart.latitude,
    longitude: chart.longitude,
    provider: chart.geo_provider || "stored",
    provider_place_id: chart.geo_place_id || chart.id || "stored",
    city: chart.birthplace_city || "",
    region: chart.birthplace_region || "",
    country: chart.birthplace_country || "",
    country_code: chart.birthplace_country_code || "",
  };
}

function requireSelectedPlace(prefix, { allowExisting = false } = {}) {
  const place = state.places.selections[prefix];
  if (!place) throw new Error("Choose a birthplace from the search results.");
  const value = $(`#${prefix}-place`)?.value.trim() || "";
  if (value !== place.label) throw new Error("Choose a birthplace from the search results.");
  if (place.selection_token) return { birthplace: place };
  if (allowExisting && place.existing) return {};
  throw new Error("Choose a birthplace from the search results.");
}

function setupPlaceSearch(prefix) {
  const input = $(`#${prefix}-place`);
  const results = $(`#${prefix}-place-results`);
  const status = $(`#${prefix}-place-status`);
  if (!input || !results) return;
  let timer = null;
  input.addEventListener("input", () => {
    const selected = state.places.selections[prefix];
    if (selected && input.value.trim() !== selected.label) clearPlaceSelection(prefix, "Select a result to continue.");
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) {
      results.innerHTML = "";
      if (status) status.textContent = q ? "Keep typing to search." : "";
      return;
    }
    timer = setTimeout(async () => {
      state.places.controllers[prefix]?.abort();
      const controller = new AbortController();
      state.places.controllers[prefix] = controller;
      if (status) status.textContent = "Searching...";
      try {
        const response = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}&limit=5`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const parsed = await readApiResponse(response);
        if (parsed.kind !== "json") throw new Error(apiTransportMessage(parsed.kind, parsed.status));
        const data = parsed.data ?? {};
        if (!parsed.ok) throw new Error(data.error || "Location search failed");
        const items = data.results || [];
        results.innerHTML = items.length
          ? items.map((place, index) => `<button type="button" class="place-result" data-index="${index}" aria-label="Select ${esc(place.label)}">${esc(place.label)}</button>`).join("")
          : '<div class="place-empty">No matches found.</div>';
        results._places = items;
        if (status) status.textContent = items.length ? "Select the matching birthplace." : "";
      } catch (error) {
        if (error.name === "AbortError") return;
        results.innerHTML = "";
        if (status) status.textContent = error.message;
      }
    }, 300);
  });
  results.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button) return;
    const place = results._places?.[Number(button.dataset.index)];
    if (place) setPlaceSelection(prefix, place);
  });
}

/* ── Inline icon set (stroke, 24-grid) ─────────────────────────────────── */
const ICONS = {
  home: '<circle cx="12" cy="13" r="4"/><path d="M12 3v2M5.5 6.5l1.4 1.4M18.5 6.5l-1.4 1.4M3 13h2M19 13h2M4 20h16"/>',
  me: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  tarot: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M12 7l1.2 3.2L16 12l-2.8 1.8L12 17l-1.2-3.2L8 12l2.8-1.8z"/>',
  ask: '<circle cx="12" cy="12" r="3"/><path d="M4 12c2.5-4 13.5-4 16 0M4 12c2.5 4 13.5 4 16 0"/><path d="M12 2l1.1 3.2L16 6l-2.9.8L12 10l-1.1-3.2L8 6l2.9-.8z"/>',
  learn: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  news: '<path d="M4 5h13a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h8M8 17h5"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  tools: '<path d="M3 7h7M3 12h4M3 17h9"/><circle cx="14" cy="7" r="2.5"/><circle cx="11" cy="17" r="2.5"/><path d="M17 12h4M16.5 12a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z"/>',
  transits: '<path d="M12 3a9 9 0 1 0 9 9"/><circle cx="12" cy="12" r="3"/><path d="M20 4l-6 6"/>',
  atlas: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  mychart: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  today: '<circle cx="12" cy="13" r="4"/><path d="M12 3v2M5.5 6.5l1.4 1.4M18.5 6.5l-1.4 1.4M3 13h2M19 13h2M4 20h16"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  intelligence: '<path d="M12 2l1.9 5.8L20 9l-5.1 1.8L12 16l-1.9-5.2L5 9l6.1-1.2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.2 8.6l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12H21a2 2 0 1 1 0 4h-.09z"/>',
};
const icon = (name, cls = "rail__icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

/* ── Workspace registry — the single source of the navigation model ──────
   Dev Update 1.3 made this canonical. Five primary destinations, in this order,
   with ONE name each. Phone bottom bar, desktop sidebar, page heading, document
   title, and screen-reader name all read from these entries, so they cannot
   disagree with each other.

     Home · My Chart · Today's Transits · Tools · More

   Everything else is a secondary destination reached from one of those five.
   `mobileLabel` exists only where the full name will not fit a phone tab; it is
   an abbreviation of the same name, never a different word. */
const WORKSPACES = [
  { id: "home", label: "Home", crumb: "Your day", icon: "home", primary: true },
  { id: "me", label: "My Chart", crumb: "Your chart", icon: "mychart", primary: true },
  { id: "transits", label: "Today’s Transits", mobileLabel: "Transits", crumb: "Your moving sky", icon: "transits", primary: true },
  { id: "tools", label: "Tools", crumb: "What Orbit Axis can do", icon: "tools", primary: true },
  { id: "more", label: "More", crumb: "Account & settings", icon: "more", primary: true },

  // Secondary destinations. Reached from Tools, More, or Technical Sky — they
  // are real pages with real headings, they simply do not earn a sixth tab.
  { id: "history", label: "History", crumb: "Past readings", icon: "history", primary: false },
  { id: "symbol-atlas", label: "Symbol Atlas", crumb: "What the symbols mean", icon: "atlas", primary: false },
  { id: "settings", label: "Settings", crumb: "Appearance", icon: "settings", primary: false },

  // Unfinished features. Absent from production entirely; a flag alone is not
  // enough, the markup has to be present too (see availableWorkspaces).
  { id: "tarot", label: "Tarot", crumb: "Daily cards", icon: "tarot", primary: false, feature: "tarot" },
  { id: "learn", label: "Learn", crumb: "Courses", icon: "learn", primary: false, feature: "learn" },
  { id: "news", label: "News", crumb: "Verified articles", icon: "news", primary: false, feature: "news" },
];

/**
 * Retired routes, and where someone holding one should land instead.
 *
 * These hashes were real destinations in earlier versions, so bookmarks, notes,
 * and old links still carry them. Silently dropping someone on Home would look
 * like the app forgot the page; a redirect plus one plain sentence explains it
 * without an error page. The destination is always a working page that does the
 * nearest equivalent thing.
 */
const RETIRED_ROUTES = Object.freeze({
  ask: { to: "home", notice: "Ask Orbit has been retired. Your saved conversations are still yours — you can export or delete them from More." },
  dashboard: { to: "home", notice: "Overview is now simply Home." },
  research: { to: "symbol-atlas", notice: "Research is now the Symbol Atlas." },
  charts: { to: "tools", notice: "Chart tools now live under Tools." },
  chat: { to: "home", notice: "That page has been retired." },
  intelligence: { to: "more", notice: "That page has been retired." },
});

/* ── Personal Transits (Update 5.2b) ───────────────────────────────────────
   The moving sky measured against the active saved chart.

   All geometry comes from the engine via the fortune's transit factors — the
   browser never computes an aspect. Viewing this page performs no write, so
   opening Transits cannot create a reading-history record. */

/**
 * Ordering, stated once so the UI and the tests agree:
 *
 *   1. applying before separating   — something building beats something fading
 *   2. tighter orb first            — a 0.4° contact is more pointed than 5°
 *   3. personal bodies before slow  — Moon..Mars land in a day, Pluto does not
 *   4. transiting then natal name   — a stable, deterministic tie-break
 *
 * The last rule matters: without it two equal transits could swap places
 * between renders, and a list that reorders itself is a list nobody trusts.
 */
const PERSONAL_BODIES = ["Moon", "Mercury", "Venus", "Sun", "Mars"];

function transitRank(t) {
  const personal = PERSONAL_BODIES.indexOf(t.transiting);
  return {
    applying: t.applying ? 0 : 1,
    orb: Number.isFinite(t.orb) ? t.orb : 99,
    speed: personal === -1 ? PERSONAL_BODIES.length : personal,
    name: `${t.transiting}|${t.natal}|${t.aspect}`,
  };
}

function sortTransits(list) {
  return [...list].sort((a, b) => {
    const x = transitRank(a), y = transitRank(b);
    return x.applying - y.applying
      || x.orb - y.orb
      || x.speed - y.speed
      || x.name.localeCompare(y.name);
  });
}

const TRANSIT_FILTERS = ["all", "applying", "separating", "personal", "long-term"];

function filterTransits(list, filter) {
  // An unknown filter shows everything rather than an empty page: a stale link
  // should degrade to the full list, not look like "you have no transits".
  switch (filter) {
    case "applying": return list.filter((t) => t.applying);
    case "separating": return list.filter((t) => !t.applying);
    case "personal": return list.filter((t) => PERSONAL_BODIES.includes(t.transiting));
    case "long-term": return list.filter((t) => !PERSONAL_BODIES.includes(t.transiting));
    default: return list;
  }
}

const transitState = { filter: "all" };

function transitsFromFortune() {
  // factors[] already carries engine-computed transits with plain and technical
  // phrasing. Reusing them avoids a second calculation and guarantees the page
  // agrees with the fortune it sits behind.
  return (AXIS.lastFortune?.factors || [])
    .filter((f) => f.type === "transit" && f.transit)
    .map((f) => ({ ...f.transit, plain: f.simple, technical: f.advanced }));
}

/**
 * Re-render whichever secondary destination is on screen.
 *
 * renderRoute() runs during boot, before restoreSession() and before the daily
 * fortune arrives. A refresh landing directly on #transits therefore rendered
 * the signed-out state and never corrected itself, telling a signed-in user to
 * sign in. Anything that fills in that data calls this afterwards.
 */
function refreshSecondaryRoute() {
  const id = currentWorkspace();
  if (id === "transits") renderTransits();
  if (id === "symbol-atlas") loadSymbolAtlas();
}

function renderTransits() {
  const body = $("#transits-body");
  if (!body) return;

  if (!state.auth.user) {
    body.innerHTML = `<div class="tr-empty"><p>Sign in to see transits for your chart.</p></div>`;
    return;
  }
  if (!state.activeChartId) {
    body.innerHTML = `
      <div class="tr-empty">
        <p>Create or select a chart to view personal transits.</p>
        <button type="button" class="o-btn o-btn--primary" data-goto="me">Manage charts</button>
      </div>`;
    return;
  }

  const all = sortTransits(transitsFromFortune());
  const shown = filterTransits(all, transitState.filter);

  const timeKnown = state.activeProfile?.time_accuracy && state.activeProfile.time_accuracy !== "unknown";
  const houseNote = timeKnown ? "" : `
    <p class="tr-note">Your birth time is not recorded, so house and angle contacts are not shown.
       Planet-to-planet transits below are unaffected — they do not depend on the time of day.</p>`;

  if (!all.length) {
    body.innerHTML = `
      ${houseNote}
      <div class="tr-empty">
        <p>No transits are close enough to list right now.</p>
        <p class="u-caption">The sky is still moving — nothing is currently within the orb Orbit reports on.</p>
      </div>`;
    return;
  }

  const cards = shown.map((t) => {
    const state_ = t.applying ? "Applying" : "Separating";
    const orb = Number.isFinite(t.orb) ? `${t.orb.toFixed(1)}° orb` : "";
    return `
      <article class="tr-card">
        <h3 class="tr-card__title">${esc(t.plain || `${t.transiting} ${t.aspect} ${t.natal}`)}</h3>
        <p class="tr-card__meta">
          <span class="tr-badge tr-badge--${t.applying ? "applying" : "separating"}">
            <span aria-hidden="true">${t.applying ? "→" : "←"}</span> ${state_}
          </span>
          ${orb ? `<span class="tr-orb">${esc(orb)}</span>` : ""}
        </p>
        <details class="tr-card__details">
          <summary>Technical detail</summary>
          <p class="tr-card__technical">${esc(t.technical || "")}</p>
          <p class="u-caption">
            <a href="#symbol-atlas">What do these symbols mean?</a>
          </p>
        </details>
      </article>`;
  }).join("");

  body.innerHTML = `
    ${houseNote}
    <div class="tr-filters" role="group" aria-label="Filter transits">
      ${TRANSIT_FILTERS.map((f) => `
        <button type="button" class="o-tab tr-filter" data-filter="${f}"
                aria-pressed="${String(f === transitState.filter)}">
          ${f === "all" ? "All" : f === "long-term" ? "Long-term" : f[0].toUpperCase() + f.slice(1)}
        </button>`).join("")}
    </div>
    <p class="u-caption" role="status" aria-live="polite">${shown.length} of ${all.length} shown · strongest first</p>
    <div class="tr-grid">${cards || `<div class="tr-empty"><p>No transits match that filter.</p></div>`}</div>`;
}

function wireTransits() {
  const panel = $("#panel-transits");
  if (!panel || panel._wiredTransits) return;
  panel._wiredTransits = true;
  panel.addEventListener("click", (event) => {
    const btn = event.target.closest(".tr-filter");
    if (!btn) return;
    transitState.filter = TRANSIT_FILTERS.includes(btn.dataset.filter) ? btn.dataset.filter : "all";
    renderTransits();
  });
}

/* ── Symbol Atlas (Update 5.2b) ────────────────────────────────────────────
   A reference for symbols already on screen elsewhere in Orbit — not a course.

   Every glyph is paired with a visible text name. A glyph alone is meaningless
   to anyone who has not already learned it, which is precisely the audience
   this page exists for, and a font that fails to load would otherwise leave a
   grid of empty boxes.

   Search runs entirely in the browser over data already fetched. No request
   leaves the page as somebody types. */

const SYMBOL_KINDS = Object.freeze({
  zodiac_sign: "Sign",
  planet: "Planet",
  angle: "Angle",
  aspect: "Aspect",
  house: "Houses",
  moon: "Moon phase",
  other: "Notation",
});

/** Where in Orbit each kind of symbol actually appears. */
const SYMBOL_SEEN_IN = Object.freeze({
  zodiac_sign: "Technical Sky, your chart placements, and transits",
  planet: "Technical Sky positions, placements, and transits",
  angle: "The Keys to Your Chart, when your birth time is known",
  aspect: "Transits and chart aspect details",
  house: "Chart placements, when your birth time is known",
  moon: "Technical Sky",
  other: "Technical Sky and transit details",
});

const atlasState = { all: [], kind: "", query: "" };

async function loadSymbolAtlas() {
  const results = $("#sa-results");
  if (!results) return;
  if (atlasState.all.length) return renderSymbolAtlas();

  results.innerHTML = `<p class="u-caption" role="status">Loading symbols…</p>`;
  try {
    const data = await get("/api/symbols");
    atlasState.all = Array.isArray(data.symbols) ? data.symbols : [];
    renderSymbolAtlas();
  } catch (error) {
    results.innerHTML = `
      <div class="sa-error" role="alert">
        <p>${esc(error.message || "The symbol list could not be loaded.")}</p>
        <button type="button" class="o-btn o-btn--secondary" id="sa-retry">Try again</button>
      </div>`;
  }
}

/** Case-insensitive, whitespace-trimmed, across name, keywords, kind and meaning. */
function filterSymbols({ all, kind, query }) {
  const q = String(query || "").trim().toLowerCase();
  return all.filter((symbol) => {
    // An unknown kind matches nothing rather than throwing — a stale link or a
    // typed URL should show an empty state, not break the page.
    if (kind && symbol.kind !== kind) return false;
    if (!q) return true;
    const haystack = [
      symbol.name, symbol.slug, symbol.kind, symbol.glyph,
      SYMBOL_KINDS[symbol.kind] || "",
      (symbol.keywords || []).join(" "),
      symbol.interpretation || "",
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function renderSymbolAtlas() {
  const results = $("#sa-results");
  const count = $("#sa-count");
  if (!results) return;

  const matches = filterSymbols(atlasState);

  if (count) {
    count.textContent = matches.length
      ? `${matches.length} symbol${matches.length === 1 ? "" : "s"}`
      : "No symbols match that search.";
  }

  if (!matches.length) {
    results.innerHTML = `
      <div class="sa-empty">
        <p>Nothing matched${atlasState.query.trim() ? ` “${esc(atlasState.query.trim())}”` : ""}.</p>
        <button type="button" class="o-btn o-btn--secondary" id="sa-clear">Clear search</button>
      </div>`;
    return;
  }

  results.innerHTML = matches.map((symbol) => `
    <article class="sa-card" id="symbol-${esc(symbol.slug)}">
      <div class="sa-card__head">
        <span class="sa-card__glyph" aria-hidden="true">${esc(symbol.glyph)}</span>
        <div class="sa-card__ident">
          <h2 class="sa-card__name">${esc(symbol.name)}</h2>
          <p class="sa-card__kind">${esc(SYMBOL_KINDS[symbol.kind] || symbol.kind)}</p>
        </div>
      </div>
      <p class="sa-card__meaning">${esc(symbol.interpretation)}</p>
      <p class="sa-card__seen"><span class="sa-card__seen-label">Seen in Orbit Axis:</span> ${esc(SYMBOL_SEEN_IN[symbol.kind] || "Throughout the application")}</p>
    </article>`).join("");
}

function wireSymbolAtlas() {
  const panel = $("#panel-symbol-atlas");
  if (!panel || panel._wired) return;
  panel._wired = true;

  $("#sa-search")?.addEventListener("input", (event) => {
    atlasState.query = event.target.value;
    renderSymbolAtlas();
  });

  $("#sa-filters")?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-kind]");
    if (!tab) return;
    atlasState.kind = tab.dataset.kind || "";
    for (const b of $$("#sa-filters [data-kind]")) {
      b.setAttribute("aria-selected", String(b === tab));
    }
    renderSymbolAtlas();
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest("#sa-retry")) return loadSymbolAtlas();
    if (event.target.closest("#sa-clear")) {
      atlasState.query = "";
      const input = $("#sa-search");
      if (input) { input.value = ""; input.focus(); }
      renderSymbolAtlas();
    }
  });
}

/* ── Feature flags ─────────────────────────────────────────────────────────
   Tarot, Learn, and News are built but unfinished, and are not part of version
   one. The server decides — this is a cache of its answer, defaulting to OFF so
   that a failed or slow /api/features never briefly reveals a feature that
   should be hidden. Failing open here would show an unfinished page for exactly
   as long as the request took, which is the one moment nobody is watching. */
const featureState = { tarot: false, learn: false, news: false };

async function loadFeatureFlags() {
  try {
    const res = await fetch("/api/features");
    const parsed = await readApiResponse(res);
    if (parsed.kind !== "json" || !parsed.ok) return;   // keep the safe defaults
    const data = parsed.data ?? {};
    for (const key of Object.keys(featureState)) {
      featureState[key] = data?.features?.[key] === true;   // strictly true
    }
  } catch {
    // Keep the safe defaults. Hiding an unfinished feature because the app
    // could not ask is the right way to be wrong.
  }
}

/**
 * Fetch and inject the markup for any enabled feature.
 *
 * The panels were moved out of public/ so they cannot reach the production
 * artifact. That makes them genuinely absent rather than removed-after-load,
 * and it means an enabled feature has to ask for its markup before the router
 * can render it.
 */
async function loadFeaturePanels() {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;
  for (const [id, on] of Object.entries(featureState)) {
    if (!on || document.getElementById(`panel-${id}`)) continue;
    try {
      const res = await fetch(`/api/features/panel/${id}`);
      if (!res.ok) continue;                       // production answers 404; that is correct
      const markup = await res.text();
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      const panel = holder.querySelector(`#panel-${id}`);
      if (panel) { panel.hidden = true; workspace.appendChild(panel); }
    } catch {
      // A feature that cannot load its own markup simply stays unavailable.
    }
  }
}

/**
 * Workspaces this environment may show. Ungated ones always pass.
 *
 * A gated workspace needs BOTH its flag and its markup. The fragments are kept
 * out of the deployed artifact entirely, so a deployment that switched a flag
 * on would otherwise show a navigation item leading to an empty panel. Tying
 * availability to the markup actually being present means the worst case is a
 * feature that stays hidden, rather than one that appears and does nothing.
 */
function availableWorkspaces() {
  return WORKSPACES.filter(ws => {
    if (!ws.feature) return true;
    return featureState[ws.feature] === true && Boolean(document.getElementById(`panel-${ws.id}`));
  });
}

function workspaceAvailable(id) {
  return availableWorkspaces().some(ws => ws.id === id);
}

/* ── Router ──────────────────────────────────────────────────────────────
   One registry, one rail builder, one render pass. The mobile bar and the
   desktop sidebar are the same DOM in different CSS, which is what guarantees
   they list the same destinations in the same order.

   The links are ordinary anchors with real hrefs, not tabs. Back, forward,
   refresh, open-in-new-tab, and copy-link all work because the hash IS the
   route rather than a side effect of a click handler. */
function buildRail() {
  $("#rail-nav").innerHTML = availableWorkspaces().filter(ws => ws.primary).map(ws => `
    <a class="rail__link" id="tab-${ws.id}" href="#${ws.id}" data-ws="${ws.id}">
      ${icon(ws.icon)}<span class="rail__label" data-mobile-label="${esc(ws.mobileLabel || ws.label)}">${esc(ws.label)}</span>
    </a>`).join("");
}

/** The hash as written, with the leading "#" and any query junk removed. */
function requestedRoute() {
  return location.hash.replace(/^#/, "").split("?")[0].trim();
}

function currentWorkspace() {
  const hash = requestedRoute();
  // A disabled feature's hash falls back to Home rather than rendering a panel
  // that navigation deliberately hides. Someone with an old bookmark, or a
  // guessed URL, gets the working app instead of an unfinished shell.
  return workspaceAvailable(hash) ? hash : "home";
}

function navigate(id) {
  if (requestedRoute() !== id) { location.hash = id; return; }
  renderRoute();
}

/**
 * Resolve a retired or unknown hash before anything renders.
 *
 * Returns true when it redirected, in which case the hashchange it caused will
 * render the real destination and this pass should stop. An empty hash is not a
 * redirect — it is simply Home, and rewriting it would push a history entry for
 * opening the app.
 */
function resolveLegacyRoute() {
  const hash = requestedRoute();
  if (!hash) return false;
  if (workspaceAvailable(hash)) return false;

  const retired = RETIRED_ROUTES[hash];
  const target = retired?.to ?? "home";
  // replaceState-style: retired routes must not accumulate in history, or Back
  // walks someone through pages that no longer exist.
  location.replace(`${location.pathname}${location.search}#${target}`);
  routeNotice = retired
    ? retired.notice
    : "That page isn't part of Orbit Axis. Here's your day instead.";
  return true;
}

// Set by resolveLegacyRoute(), shown once by renderRoute() on arrival.
let routeNotice = "";

function showRouteNotice() {
  if (!routeNotice) return;
  const message = routeNotice;
  routeNotice = "";
  toast(message);
}

function renderRoute() {
  if (resolveLegacyRoute()) return;

  const id = currentWorkspace();
  // Secondary destinations load their own data on arrival, so a direct link or
  // a refresh lands on a populated page rather than an empty one.
  if (id === "symbol-atlas") { wireSymbolAtlas(); loadSymbolAtlas(); }
  if (id === "transits") { wireTransits(); renderTransits(); }
  if (id === "history") axisLoadHistory($("#history-scope")?.value || "active");
  const ws = WORKSPACES.find(w => w.id === id);

  // A disabled feature's panel is normally never in the document at all: the
  // markup lives outside public/ and is only fetched when the flag is on. This
  // stays as a safety net for a feature switched off during a session, so a
  // panel injected earlier cannot linger.
  for (const gated of WORKSPACES.filter(w => w.feature && !featureState[w.feature])) {
    $(`#panel-${gated.id}`)?.remove();
    $(`#tab-${gated.id}`)?.remove();
  }

  WORKSPACES.forEach(w => {
    const panel = $(`#panel-${w.id}`);
    const link = $(`#tab-${w.id}`);
    const active = w.id === id;
    if (panel) panel.hidden = !active;
    // aria-current is the whole current-page story for a list of links. It is
    // removed rather than set to "false" when inactive, because "false" is
    // still an announced value in some screen readers.
    if (link) {
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  });

  $("#workspace-title").textContent = ws.label;
  $("#workspace-crumb").textContent = `Orbit Axis · ${ws.crumb}`;
  document.title = `Orbit Axis — ${ws.label}`;
  $("#workspace").scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  showRouteNotice();
}

/* ── Upcoming sky events → the Today's Transits timeline ───────────────── */
function renderEvents(events) {
  $("#events-count").textContent = `${events.length} upcoming`;
  $("#events-timeline").innerHTML = events.map(e => `
    <div class="o-timeline__item">
      <div class="o-timeline__date">${esc(formatLocalDateKey(e.date))}</div>
      <div class="o-timeline__body">
        <div class="o-timeline__title">${esc(e.title)}</div>
        <div class="o-timeline__detail">${esc(e.detail)}</div>
      </div>
    </div>`).join("");
}

/* ── Global actions ──────────────────────────────────────────────────────
   Every in-page button that changes destination carries data-goto and is
   delegated from here, so a card action and a navigation link cannot drift
   apart. Bound once, after the first data load. */
function wireGlobalActions() {
  $("#transits-refresh")?.addEventListener("click", () => refreshData(true));
  $("#history-scope")?.addEventListener("change", (event) => axisLoadHistory(event.target.value));
  $$("[data-goto]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.goto)));
}

/* ── Auth + saved charts ───────────────────────────────────────────────── */
const REL_LABELS = {
  self: "Self",
  partner: "Partner",
  friend: "Friend",
  family: "Family",
  public_figure: "Public Figure",
  other: "Other",
};

/* ── Modal utility ─────────────────────────────────────────────────────────
   One shared dialog behavior for the chart form, the delete confirmation, and
   the onboarding gate: focus moves in, Tab is trapped, Escape closes, and focus
   returns to the element that opened it. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const modalStack = [];

function focusables(root) {
  return $$(FOCUSABLE, root).filter(el => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Everything the dialog is layered over.
 *
 * A focus trap stops Tab from LEAVING the dialog. It does nothing about the
 * other ways focus gets behind one: a screen reader's virtual cursor, a
 * browser's find-in-page, a touch-screen swipe through the reading order, or
 * simply clicking. `inert` is what actually removes those, and it takes the
 * subtree out of the accessibility tree at the same time, so a screen reader
 * cannot narrate the obscured application either.
 *
 * Deliberately excludes the dialogs themselves — they live outside .app-shell
 * — so opening one does not make it inert along with the page behind it.
 */
function backgroundRegions() {
  return $$(".app-shell");
}

function setBackgroundInert(on) {
  for (const region of backgroundRegions()) {
    if (on) {
      region.setAttribute("inert", "");
      region.setAttribute("aria-hidden", "true");
    } else {
      region.removeAttribute("inert");
      region.removeAttribute("aria-hidden");
    }
  }
}

/**
 * @param {object} options
 * @param {boolean} [options.dismissible=true]
 *   false for a dialog with nothing behind it to return to — the signed-out
 *   authentication gate. Escape there would dismiss the only usable surface on
 *   the page and leave the person on an inert shell. Every other dialog in
 *   Orbit closes on Escape.
 */
function openModal(el, { onClose = null, initialFocus = null, dismissible = true } = {}) {
  if (!el || modalStack.some(m => m.el === el)) return;
  const entry = { el, onClose, dismissible, restoreTo: document.activeElement };
  modalStack.push(entry);
  el.hidden = false;
  // Only the first dialog needs to do this; nested ones are already covered,
  // and clearing it on the inner close would expose the shell behind the outer.
  if (modalStack.length === 1) setBackgroundInert(true);

  entry.keydown = (event) => {
    if (modalStack[modalStack.length - 1]?.el !== el) return;
    if (event.key === "Escape") {
      if (!dismissible) return;
      event.preventDefault();
      closeModal(el);
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(el);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener("keydown", entry.keydown, true);

  entry.click = (event) => { if (event.target.closest("[data-modal-close]")) closeModal(el); };
  el.addEventListener("click", entry.click);

  (initialFocus || focusables(el)[0])?.focus();
}

function closeModal(el) {
  const index = modalStack.findIndex(m => m.el === el);
  if (index === -1) return;
  const [entry] = modalStack.splice(index, 1);
  document.removeEventListener("keydown", entry.keydown, true);
  el.removeEventListener("click", entry.click);
  el.hidden = true;
  // Released only when the last dialog closes. Restoring focus while the shell
  // is still inert silently drops it to the body, which is how "focus returns
  // to the button you opened this from" quietly stops being true.
  if (!modalStack.length) setBackgroundInert(false);
  entry.onClose?.();
  // Restore focus to whatever opened the dialog (falls back to the body).
  if (entry.restoreTo && document.contains(entry.restoreTo)) entry.restoreTo.focus();
}

// Accessible replacement for window.confirm — prevents accidental deletion and
// is fully keyboard operable. Resolves true only on an explicit confirm.
function confirmDialog({ title = "Are you sure?", body = "", confirmLabel = "Delete" } = {}) {
  const modal = $("#confirm-modal");
  if (!modal) return Promise.resolve(false);
  $("#confirm-modal-title").textContent = title;
  $("#confirm-modal-body").textContent = body;
  const accept = $("#confirm-accept");
  const cancel = $("#confirm-cancel");
  accept.textContent = confirmLabel;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      accept.removeEventListener("click", onAccept);
      cancel.removeEventListener("click", onCancel);
      resolve(value);
    };
    const onAccept = () => { closeModal(modal); finish(true); };
    const onCancel = () => { closeModal(modal); finish(false); };
    accept.addEventListener("click", onAccept);
    cancel.addEventListener("click", onCancel);
    // Escape / backdrop close resolve as "cancelled".
    openModal(modal, { onClose: () => finish(false), initialFocus: cancel });
  });
}

function authSignedIn() {
  return !!state.auth.user;
}

function activeChart() {
  return state.charts.find(chart => chart.id === state.activeChartId) || state.charts.find(chart => chart.is_active) || null;
}

function wireAuth() {
  const form = $("#auth-form");
  if (!form) return;
  const modeButtons = $$("[data-auth-mode]");
  let mode = "signin";

  const setMode = (next) => {
    mode = next;
    modeButtons.forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.authMode === mode)));
    $("#auth-confirm-wrap").hidden = mode !== "signup";
    $("#auth-submit").textContent = mode === "signup" ? "Create account" : "Sign in";
    $("#auth-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("#auth-message").textContent = "";
    // Offering a password reset while someone is creating an account is noise.
    const forgot = $("#auth-forgot-wrap");
    if (forgot) forgot.hidden = mode === "signup";
  };

  modeButtons.forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.authMode)));
  $("#auth-toggle-password")?.addEventListener("click", () => {
    const input = $("#auth-password");
    const button = $("#auth-toggle-password");
    // `showing` is the state BEFORE the click, so every assignment below is the
    // state after it. Reading it the other way round is how a visibility toggle
    // ends up announcing the opposite of what it did.
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    button.setAttribute("aria-pressed", String(!showing));
    // Toggling visibility should not cost the person their place in the form.
    input.focus();
  });

  // Guards a double-click, an impatient second Enter, and a slow network from
  // sending the same credentials twice. Sign-up is the one that matters: two
  // in-flight requests race, and the loser reports "an account already exists"
  // for the account the winner just created.
  let submitting = false;
  const submitButton = $("#auth-submit");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting) return;
    const message = $("#auth-message");
    submitting = true;
    if (submitButton) submitButton.disabled = true;
    message.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    try {
      const payload = {
        email: $("#auth-email").value,
        password: $("#auth-password").value,
        confirm_password: $("#auth-confirm").value,
      };
      const data = await post(mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", payload);
      message.textContent = data.message || "Signed in.";
      if (data.signed_in) await applySignedIn(data.user);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      // Always restored, including after applySignedIn throws — otherwise a
      // failure mid-sign-in leaves the form permanently unusable.
      submitting = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  // ── Forgot password ───────────────────────────────────────────────────────
  // The response is identical whether or not the address has an account, so
  // this cannot be used to discover who has one.
  $("#auth-forgot")?.addEventListener("click", async () => {
    const message = $("#auth-message");
    const email = $("#auth-email").value.trim();
    if (!email) {
      message.textContent = "Enter your email address above, then choose “Forgot your password?”.";
      $("#auth-email").focus();
      return;
    }
    const button = $("#auth-forgot");
    button.disabled = true;
    message.textContent = "Sending a reset link…";
    try {
      const data = await post("/api/auth/password/request", { email });
      message.textContent = data.message || "If an account exists for that email, a reset link is on its way.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("#account-signout")?.addEventListener("click", async () => {
    await post("/api/auth/signout", {});
    clearPrivateState();
    toast("Signed out");
  });

  wireAccountExport();
  wireAccountPasswordReset();
  wireAccountDeletion();
}

/* ── Export my data ────────────────────────────────────────────────────────
   Free, and reachable in two clicks from Settings. Deletion without a way to
   take your data first is not ownership, so this sits beside it rather than
   somewhere a person has to go looking. */
function wireAccountExport() {
  const button = $("#account-export");
  const message = $("#account-export-message");
  if (!button || !message) return;

  let running = false;
  button.addEventListener("click", async () => {
    if (running) return;
    running = true;
    button.disabled = true;
    message.textContent = "Gathering your data…";
    let url = null;
    try {
      // The timezone is a courtesy — it only decides the readable local
      // timestamp printed beside the UTC one inside the file.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(`/api/v1/account/export?timezone=${encodeURIComponent(timezone)}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      // Through the shared reader, so a login wall, a rewrite, or a hosting
      // provider's HTML 404 is reported as a transport problem rather than
      // being parsed as if it were the export.
      const result = await readApiResponse(res);
      if (result.kind !== "json") {
        message.textContent = apiTransportMessage(result.kind, result.status);
        return;
      }
      const payload = result.data || {};
      if (!result.ok || payload.error) {
        message.textContent = payload?.error?.message || "Your data could not be exported just now.";
        return;
      }

      // Named from the response header rather than rebuilt here, so the file a
      // person receives is the one the server said it was sending.
      const disposition = res.headers.get("content-disposition") || "";
      const named = /filename="([^"]+)"/.exec(disposition);
      const filename = named ? named[1] : "orbit-axis-export.json";

      const blob = new Blob([JSON.stringify(payload.data, null, 2)], { type: "application/json" });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.textContent = `Downloaded ${filename}.`;
    } catch {
      message.textContent = "Your data could not be exported just now. Check your connection and try again.";
    } finally {
      // The blob URL holds the whole export in memory and would keep it alive
      // for the life of the document. Revoked after the click has been handled.
      if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
      running = false;
      button.disabled = false;
    }
  });
}

/* ── Reset password from a signed-in session ───────────────────────────────
   Reuses the same email flow as "Forgot your password?". Someone who is signed
   in but wants to change their password should not have to sign out and
   pretend to have forgotten it. */
function wireAccountPasswordReset() {
  const button = $("#account-password-reset");
  const message = $("#account-export-message");
  if (!button || !message) return;

  button.addEventListener("click", async () => {
    const email = state.auth.user?.email;
    if (!email) {
      message.textContent = "Sign in first.";
      return;
    }
    button.disabled = true;
    message.textContent = "Sending a reset link…";
    try {
      const data = await post("/api/auth/password/request", { email });
      message.textContent = data.message || "A reset link is on its way to your email.";
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

/**
 * Return the app to a signed-out state, leaving nothing of the previous account
 * on screen or in memory.
 *
 * Shared by sign-out and deletion so the two can never drift — if a new piece
 * of private state is added and only one path clears it, that is exactly the
 * kind of leak nobody notices until someone else uses the same browser.
 *
 * @param {{ purgeLocalData?: boolean }} options
 *   purgeLocalData additionally clears locally cached birth details. Sign-out
 *   deliberately does NOT: the person is coming back, and wiping their cached
 *   chart on every sign-out would be hostile. Deletion always does.
 */
function clearPrivateState({ purgeLocalData = false } = {}) {
  state.auth.user = null;
  state.charts = [];
  state.activeChartId = null;
  state.activeProfile = null;
  state.activeNatalChart = null;
  state.chartsStatus = "idle";
  state.onboardingDismissed = false; // a fresh sign-in gets a fresh decision

  if (purgeLocalData) {
    // oa_birth holds birth date, time, and coordinates. It is the most personal
    // thing Orbit stores anywhere, and it lives in localStorage, which no
    // server-side deletion can reach. Missing it would leave a deleted user's
    // birth details sitting in the browser.
    try {
      localStorage.removeItem("oa_birth");
      localStorage.removeItem("oa_detail");
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("orbit.")) localStorage.removeItem(key);
      }
      sessionStorage.clear();
    } catch { /* storage can be unavailable; deletion still succeeded */ }
  }

  // In-memory caches of the account's own content. These survive a re-render,
  // so leaving them populated would keep a deleted account's reading on screen
  // until something happened to overwrite it.
  AXIS.lastFortune = null;
  AXIS.lastSky = null;
  AXIS.loadedOnce = false;

  renderAccount();
  renderSavedCharts();
  if (!$("#onboarding-gate").hidden) closeModal($("#onboarding-gate"));
  if (!$("#chart-modal").hidden) closeModal($("#chart-modal"));
  $("#today-chart-error").hidden = true;
  showAuthGate();
}

/* ── Permanent account deletion ────────────────────────────────────────────
   Typed confirmation, not a yes/no button. The friction is deliberate: this
   is the one action in Orbit that cannot be undone. */
function wireAccountDeletion() {
  const modal = $("#delete-account-modal");
  const form = $("#delete-account-form");
  if (!modal || !form) return;

  const input = $("#delete-account-confirm");
  const submit = $("#delete-account-submit");
  const message = $("#delete-account-message");
  const REQUIRED = "DELETE";
  let deleting = false;

  const reset = () => {
    input.value = "";
    submit.disabled = true;
    message.textContent = "";
    deleting = false;
  };

  // openModal already restores focus to whatever opened the dialog, so
  // cancelling returns the person to the Delete account button they came from.
  $("#account-delete-open")?.addEventListener("click", () => {
    reset();
    openModal(modal, { onClose: reset, initialFocus: input });
  });
  $("#delete-account-cancel")?.addEventListener("click", () => closeModal(modal));
  $("#delete-account-close")?.addEventListener("click", () => closeModal(modal));

  // The button stays disabled until the typed value is exactly right. Trimmed
  // so a trailing space from a paste is not a confusing dead end, but not
  // upper-cased — typing it in capitals is part of the deliberateness.
  input.addEventListener("input", () => {
    submit.disabled = input.value.trim() !== REQUIRED || deleting;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deleting || input.value.trim() !== REQUIRED) return;

    deleting = true;
    submit.disabled = true;
    $("#delete-account-cancel").disabled = true;
    message.textContent = "Deleting your account…";

    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: REQUIRED }),
      });
      const parsed = await readApiResponse(res);
      const payload = parsed.data;

      if (parsed.kind !== "json") {
        // Non-JSON from the deletion endpoint means the request never reached
        // Orbit. Saying so beats a parser error on the one screen where a
        // confusing message is least acceptable.
        message.textContent = apiTransportMessage(parsed.kind, parsed.status);
        deleting = false;
        submit.disabled = input.value.trim() !== REQUIRED;
        $("#delete-account-cancel").disabled = false;
        return;
      }

      if (!parsed.ok || !payload?.data?.deleted) {
        // Never a fake success. The person is told what actually happened and,
        // where it is worth retrying, given the request id to quote.
        const error = payload?.error;
        const reference = payload?.meta?.requestId ? ` (reference ${payload.meta.requestId})` : "";
        message.textContent = (error?.message || "Your account could not be deleted.") + reference;
        deleting = false;
        submit.disabled = input.value.trim() !== REQUIRED;
        $("#delete-account-cancel").disabled = false;
        return;
      }

      closeModal(modal);
      clearPrivateState({ purgeLocalData: true });
      // replaceState so the browser Back button cannot return to a private view
      // rendered before the account was deleted.
      if (history.replaceState) history.replaceState(null, "", "#home");
      navigate("home");
      toast("Your account has been permanently deleted.");
    } catch {
      message.textContent = "Could not reach Orbit. Your account was not deleted. Check your connection and try again.";
      deleting = false;
      submit.disabled = input.value.trim() !== REQUIRED;
      $("#delete-account-cancel").disabled = false;
    }
  });
}

/* ── The authentication gate ───────────────────────────────────────────────
   Routed through the same dialog machinery as every other modal so that focus
   trapping, background inertness, and accessibility-tree removal cannot drift
   apart from the rest of the app. It is opened and closed by exactly two
   functions, because five scattered `hidden = ...` assignments is how three of
   them end up forgetting the inert shell. */
function showAuthGate() {
  const gate = $("#auth-gate");
  if (!gate || !gate.hidden) return;
  // Nothing behind this to go back to, so Escape must not dismiss it.
  openModal(gate, { dismissible: false, initialFocus: $("#auth-email") });
}

function hideAuthGate() {
  const gate = $("#auth-gate");
  if (!gate || gate.hidden) return;
  closeModal(gate);
}

// Startup runs in a fixed order: resolve auth -> load saved charts -> decide.
// Onboarding is only ever a *decision*, never a default, so a returning user is
// never asked to set up a chart they already have.
async function restoreSession() {
  state.auth.restoring = true;
  setStartupStatus("Restoring your Orbit…");
  hideAuthGate();
  try {
    const data = await get("/api/auth/session");
    if (data.signed_in) {
      await applySignedIn(data.user, { quiet: true });
    } else {
      // Signed-out local preview: existing behavior, untouched.
      state.auth.user = null;
      state.charts = [];
      state.activeChartId = null;
      state.activeProfile = null;
      state.activeNatalChart = null;
      state.chartsStatus = "idle";
      showAuthGate();
      renderAccount();
      renderSavedCharts();
    }
  } catch {
    // Couldn't even resolve the session — show the sign-in gate, not onboarding.
    state.auth.user = null;
    showAuthGate();
  } finally {
    state.auth.restoring = false;
    finishStartup();
  }
}

async function applySignedIn(user, { quiet = false } = {}) {
  state.auth.user = user;
  // Auth is resolved the moment we have the user — record that before the chart
  // decision runs, otherwise it would still read as "loading".
  state.auth.restoring = false;
  hideAuthGate();
  renderAccount();
  setStartupStatus("Loading your charts…");
  await loadSavedCharts();
  await resolveChartState();
  if (!quiet) toast("Signed in");
}

// The single place that decides what a signed-in user sees after their charts
// resolve. The decision itself lives in startup-state.js so it can be unit
// tested; this function only paints the result.
async function resolveChartState() {
  const onboarding = $("#onboarding-gate");
  const errorBox = $("#today-chart-error");

  const view = decideStartupView({
    authResolved: !state.auth.restoring,
    signedIn: authSignedIn(),
    chartsStatus: state.chartsStatus,
    chartCount: state.charts.length,
    onboardingDismissed: state.onboardingDismissed,
  });

  // Recoverable failure: offer a retry. NEVER claim the user has no chart.
  if (view === STARTUP_VIEW.ERROR) {
    if (onboarding && !onboarding.hidden) closeModal(onboarding);
    if (errorBox) errorBox.hidden = false;
    await axisLoadToday(); // Current Sky still renders; Home is never left blank.
    return;
  }
  if (errorBox) errorBox.hidden = true;

  // Genuinely zero saved charts on a successful request → first-run onboarding.
  if (view === STARTUP_VIEW.ONBOARDING) {
    if (onboarding && onboarding.hidden) {
      openModal(onboarding, { initialFocus: $("#ob-first") });
    }
    renderSavedCharts();
    return;
  }

  // Returning user. The server already resolved (and persisted) the active
  // chart, so we just load their experience. No popup, ever.
  if (onboarding && !onboarding.hidden) closeModal(onboarding);
  await refreshActiveExperience();
}

function setStartupStatus(text) {
  const el = $("#startup-status");
  if (el) el.textContent = text;
}

// Drop the startup gate once auth + charts have resolved. Guarded so it only
// runs once and can never re-block the interface.
function finishStartup() {
  if (state.startup === "ready") return;
  state.startup = "ready";
  const gate = $("#startup-gate");
  if (gate) gate.hidden = true;
  // The startup gate covers the auth gate during restore, so focus placed at
  // open time would land on a field nobody can see yet. Place it once the
  // cover is actually gone.
  const auth = $("#auth-gate");
  if (auth && !auth.hidden) $("#auth-email")?.focus();
}

function renderAccount() {
  $("#account-email").textContent = state.auth.user?.email || "Not signed in";
}

function chartFormPayload(prefix, { forceMyChart = false, allowExistingPlace = false } = {}) {
  const accuracy = $(`#${prefix}-accuracy`).value;
  const allowExisting = allowExistingPlace;
  const placePayload = requireSelectedPlace(prefix, { allowExisting });
  const payload = {
    nickname: forceMyChart ? "My Chart" : ($(`#${prefix}-nickname`)?.value.trim() || undefined),
    first_name: $(`#${prefix}-first`)?.value.trim() || null,
    last_name: $(`#${prefix}-last`)?.value.trim() || null,
    relationship_type: forceMyChart ? "self" : ($(`#${prefix}-relationship`)?.value || "other"),
    birth_date: $(`#${prefix}-date`).value,
    birth_time: accuracy === "unknown" ? null : ($(`#${prefix}-time`).value || null),
    time_accuracy: accuracy,
    ...placePayload,
  };
  if (accuracy === "unknown") payload.birth_time = null;
  return payload;
}

/* ── Chart modal (create / edit) ───────────────────────────────────────────
   Once a user has a chart, creating another is a deliberate action from the
   Home "+" — not an automatic popup. The same modal edits/renames an existing
   chart, so there is one chart form instead of several. */
function openChartModal(chart = null) {
  const modal = $("#chart-modal");
  if (!modal) return;
  $("#chart-modal-form").reset();
  $("#cm-id").value = chart?.id || "";
  $("#chart-modal-title").textContent = chart ? "Edit chart" : "Add a chart";
  $("#chart-modal-save").textContent = chart ? "Save changes" : "Save chart";
  $("#chart-modal-hint").textContent = "";

  if (chart) {
    $("#cm-nickname").value = chart.nickname || "";
    $("#cm-first").value = chart.first_name || "";
    $("#cm-last").value = chart.last_name || "";
    $("#cm-relationship").value = chart.relationship_type || "other";
    $("#cm-date").value = chart.birth_date || "";
    $("#cm-time").value = chart.birth_time ? String(chart.birth_time).slice(0, 5) : "";
    $("#cm-accuracy").value = chart.time_accuracy || "unknown";
    const place = chartPlace(chart);
    if (place) setPlaceSelection("cm", place, { existing: true });
    else clearPlaceSelection("cm");
  } else {
    if (authSignedIn() && state.charts.length === 0) {
      $("#chart-modal-title").textContent = "Create your chart";
      $("#cm-nickname").value = "My Chart";
      $("#cm-relationship").value = "self";
    }
    clearPlaceSelection("cm");
  }

  openModal(modal, { initialFocus: $("#cm-nickname") });
}

function wireChartModal() {
  const modal = $("#chart-modal");
  if (!modal) return;
  $("#chart-modal-close")?.addEventListener("click", () => closeModal(modal));
  $("#chart-modal-cancel")?.addEventListener("click", () => closeModal(modal));

  $("#chart-modal-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = $("#cm-id").value;
    const hint = $("#chart-modal-hint");
    const save = $("#chart-modal-save");
    hint.textContent = id ? "Saving changes…" : "Saving chart…";
    save.disabled = true;
    try {
      if (id) await patch(`/api/charts/${id}`, chartFormPayload("cm"));
      else await post("/api/charts", chartFormPayload("cm"));
      closeModal(modal);
      await loadSavedCharts();
      await resolveChartState();
      toast(id ? "Chart updated" : "Chart added");
    } catch (error) {
      hint.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
}

// Home-level chart actions: add (+), manage, and retry after a load failure.
function wireHomeChartActions() {
  $("#today-chart-add")?.addEventListener("click", () => openChartModal(null));
  $("#today-chart-manage")?.addEventListener("click", () => navigate("me"));
  $("#today-chart-retry")?.addEventListener("click", () => retryLoadSavedCharts());
}

function wireOnboarding() {
  // Dismissing onboarding must not re-trigger it for the rest of the session.
  // The Home "+" action is the obvious way back in.
  $("#onboarding-dismiss")?.addEventListener("click", () => {
    state.onboardingDismissed = true;
    closeModal($("#onboarding-gate"));
    toast("You can add a chart any time with the + beside Viewing.");
  });

  $("#onboarding-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("#onboarding-message");
    message.textContent = "Saving My Chart…";
    try {
      await post("/api/charts", chartFormPayload("ob", { forceMyChart: true }));
      message.textContent = "My Chart saved.";
      closeModal($("#onboarding-gate"));
      await loadSavedCharts();
      await resolveChartState();
    } catch (error) {
      message.textContent = error.message;
    }
  });
}

function wireSavedCharts() {
  const routeChartClick = async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "retry-charts") {
      await retryLoadSavedCharts();
      return;
    }
    if (button.dataset.action === "add-chart") {
      openChartModal(null);
      return;
    }
    const id = button.dataset.id;
    const chart = state.charts.find(item => item.id === id);
    if (!chart) return;
    await handleSavedChartAction(button, chart);
  };
  $("#me-saved-charts-list")?.addEventListener("click", routeChartClick);
  $("#me-overview")?.addEventListener("click", routeChartClick);
  $("#me-add-chart")?.addEventListener("click", () => openChartModal(null));
  $("#me-saved-chart-add")?.addEventListener("click", () => openChartModal(null));
}

async function handleSavedChartAction(button, chart) {
  const id = chart.id;
  if (button.dataset.action === "activate") {
    const previousId = state.activeChartId;
    button.disabled = true;
    button.textContent = "Activating…";
    try {
      await post(`/api/charts/${id}/activate`, {});
      await loadSavedCharts();
      await refreshActiveExperience();
      toast(`${chart.nickname} is active`);
    } catch (error) {
      state.activeChartId = previousId;
      renderSavedCharts();
      toast(error.message);
    }
    return;
  }

  // Edit/rename opens the shared chart modal.
  if (button.dataset.action === "edit") {
    openChartModal(chart);
    return;
  }

  if (button.dataset.action === "delete") {
    const isLast = state.charts.length === 1;
    const ok = await confirmDialog({
      title: `Delete ${chart.nickname}?`,
      body: isLast
        ? "This is your only chart. Deleting it means Orbit can't show your daily reading until you add a new one. This can't be undone."
        : "This chart and its saved readings will be removed. This can't be undone.",
      confirmLabel: "Delete chart",
    });
    if (!ok) return;
    button.disabled = true;
    try {
      await del(`/api/charts/${id}${isLast ? "?confirmEmpty=true" : ""}`, { confirmEmpty: isLast });
      // The server promotes a replacement active chart when the active one is
      // deleted, and reports an empty state only when nothing remains.
      await loadSavedCharts();
      await resolveChartState();
      toast(`${chart.nickname} deleted`);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  }
}

// Supabase (owner-scoped) is the source of truth for a signed-in user's charts.
// Critically, a failed request sets status "error" and leaves the previously
// known charts intact — it must never look like "this account has no charts",
// which is what caused returning users to be re-onboarded.
async function loadSavedCharts() {
  if (!authSignedIn()) {
    state.charts = [];
    state.activeChartId = null;
    state.activeProfile = null;
    state.activeNatalChart = null;
    state.chartsStatus = "idle";
    renderSavedCharts();
    return state.chartsStatus;
  }
  state.chartsStatus = "loading";
  try {
    const data = await get("/api/charts");
    state.charts = data.charts || [];
    // The server resolves and persists the active chart (including healing a
    // missing or stale one), so we trust it rather than guessing locally.
    state.activeChartId = data.active_chart_id || state.charts.find(chart => chart.is_active)?.id || null;
    state.chartsStatus = "ready";
    const active = activeChart();
    setActiveChartName(active?.nickname || "My Chart");
    renderSavedCharts();
  } catch {
    state.chartsStatus = "error";
    renderSavedCharts();
  }
  return state.chartsStatus;
}

// Retry entry point for the recoverable error state.
async function retryLoadSavedCharts() {
  const errorBox = $("#today-chart-error");
  const button = $("#today-chart-retry");
  if (button) { button.disabled = true; button.textContent = "Trying…"; }
  try {
    await loadSavedCharts();
    await resolveChartState();
  } finally {
    if (button) { button.disabled = false; button.textContent = "Try again"; }
    if (errorBox && state.chartsStatus !== "error") errorBox.hidden = true;
  }
}

// Home's "Viewing" selector — lists only the signed-in owner's charts
// (already server-scoped by /api/charts) and mirrors the active one. A single
// chart still shows its identity via a disabled select rather than hiding it.
function axisRenderChartPicker() {
  const picker = $("#today-chart-picker");
  const select = $("#today-chart-select");
  const label = picker?.querySelector('label[for="today-chart-select"]');
  const manage = $("#today-chart-manage");
  if (!picker || !select) return;

  // Signed-out (local preview) keeps the picker out of the way entirely.
  if (!authSignedIn()) {
    picker.hidden = true;
    return;
  }

  // Signed in with zero charts: the "+" stays reachable so a user who dismissed
  // onboarding still has an obvious way to create their chart.
  if (!state.charts.length) {
    picker.hidden = state.chartsStatus !== "ready";
    select.hidden = true;
    if (label) label.hidden = true;
    if (manage) manage.hidden = true;
    return;
  }

  picker.hidden = false;
  select.hidden = false;
  if (label) label.hidden = false;
  if (manage) manage.hidden = false;
  select.innerHTML = state.charts.map(chart =>
    `<option value="${esc(chart.id)}" ${chart.id === state.activeChartId ? "selected" : ""}>${esc(chart.nickname || "Untitled Chart")}</option>`
  ).join("");
  // One chart still shows its name via a disabled select; "+" remains active.
  select.disabled = state.charts.length <= 1;
}

function renderSavedCharts() {
  const statusTargets = [$("#me-saved-charts-status")].filter(Boolean);
  const listTargets = [$("#me-saved-charts-list")].filter(Boolean);
  axisRenderChartPicker();
  if (!statusTargets.length || !listTargets.length) return;
  const setStatus = (text) => statusTargets.forEach((status) => { status.textContent = text; });
  const setLists = (html) => listTargets.forEach((list) => { list.innerHTML = html; });
  if (!authSignedIn()) {
    setStatus("Sign in to save and restore charts.");
    setLists("");
    renderMeOverview(null, null, "");
    return;
  }
  if (state.chartsStatus === "loading" && !state.charts.length) {
    setStatus("Loading your charts…");
    setLists("");
    return;
  }
  // An error must not read as "you have no charts".
  if (state.chartsStatus === "error" && !state.charts.length) {
    setStatus("We couldn't load your saved charts. Check your connection and try again.");
    setLists(`<button type="button" class="o-btn o-btn--secondary" data-action="retry-charts">Retry</button>`);
    renderMeOverview(null, null, "");
    return;
  }
  if (!state.charts.length) {
    setStatus("No saved charts yet. Create your chart to begin.");
    setLists(`<div class="me-empty me-empty--compact"><p>No saved charts yet.</p><button type="button" class="o-btn o-btn--primary" data-action="add-chart">Create your chart</button></div>`);
    renderMeOverview(null, null, "");
    return;
  }
  setStatus(`${state.charts.length} saved chart${state.charts.length === 1 ? "" : "s"}`);
  setLists(state.charts.map(savedChartCardHtml).join(""));
}

function savedChartCardHtml(chart) {
  const summary = chart.summary || {};
  const rising = summary.time_known === false || !summary.rising ? "Rising needs birth time" : `Rising ${esc(summary.rising)}`;
  const legalName = [chart.first_name, chart.last_name].filter(Boolean).join(" ");
  const meta = [
    REL_LABELS[chart.relationship_type] || chart.relationship_type || "Other",
    legalName,
    chart.birth_date ? formatBirthDate(chart.birth_date) : "",
    chart.birthplace_name,
  ].filter(Boolean).join(" · ");
  const timeInfo = timeAccuracyInfo(chart.time_accuracy || (summary.time_known === false ? "unknown" : "exact"));
  return `<article class="saved-chart-card" data-active="${chart.is_active}">
    <div class="saved-chart-card__top">
      <div class="saved-chart-card__name">${esc(chart.nickname || "Untitled Chart")}</div>
      <div class="saved-chart-card__badges">
        ${chart.is_active ? '<span class="o-pill o-pill--success">Active</span>' : ""}
        ${chart.is_primary ? '<span class="o-badge">Primary</span>' : ""}
        <span class="o-badge">${esc(timeInfo.label)}</span>
      </div>
    </div>
    <div class="saved-chart-card__meta">${esc(meta)}</div>
    <div class="saved-chart-card__summary">Sun ${esc(summary.sun || "—")} · Moon ${esc(summary.moon || "—")} · ${rising}</div>
    <div class="saved-chart-card__actions">
      <button type="button" data-action="activate" data-id="${esc(chart.id)}" ${chart.is_active ? "disabled" : ""}>${chart.is_active ? "Active" : "Set active"}</button>
      <button type="button" data-action="edit" data-id="${esc(chart.id)}">Edit</button>
      <button type="button" data-action="delete" data-id="${esc(chart.id)}">Delete</button>
    </div>
  </article>`;
}

async function refreshActiveExperience() {
  const active = activeChart();
  if (active) {
    setActiveChartName(active.nickname);
    axisShowReadingFor(active.nickname);
    try {
      const data = await get(`/api/charts/${active.id}`);
      renderChart(data.chart, data.profile?.nickname || active.nickname, data.profile);
    } catch { /* Home still owns the failure state */ }
  } else {
    renderMeOverview(null, null, "");
  }
  await axisLoadToday();
  if (currentWorkspace() === "history") await axisLoadHistory($("#history-scope")?.value || "active");
}

/* ── Toasts ────────────────────────────────────────────────────────────── */
function toast(message) {
  const el = document.createElement("div");
  el.className = "o-toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  $("#toast-region").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 220); }, 2400);
}

/* ── Theme ───────────────────────────────────────────────────────────────
   Three choices — System, Light, Dark — with System as the default.

   PREFERENCE vs RESOLVED THEME. The stored preference is what the person chose;
   the resolved theme is what the pixels do. They differ only under "system",
   where the device decides. Both are on <html>: data-theme-preference records the
   choice (so the control can show it), data-theme drives every token in the
   stylesheets. Conflating the two is how a "System" selection silently becomes
   a hard "Dark" the first time it is written back.

   The FIRST resolution does not happen here. It happens in a tiny inline script
   in index.html, before the stylesheets paint, because a theme applied after
   first paint is a white flash for every dark-mode user (and vice versa). This
   module takes over afterwards, and must agree with it exactly. */
const THEME_CHOICES = ["system", "light", "dark"];
const THEME_STORAGE_KEY = "orbit.theme";
const THEME_COLORS = { light: "#f5f6f8", dark: "#0a0c0f" };

/** Storage can throw in private mode. A theme is never worth an exception. */
function readStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_CHOICES.includes(raw) ? raw : "system";
  } catch { return "system"; }
}

function storeTheme(choice) {
  try { localStorage.setItem(THEME_STORAGE_KEY, choice); } catch { /* session-only */ }
}

const lightMediaQuery = window.matchMedia?.("(prefers-color-scheme: light)") ?? null;

function systemTheme() {
  return lightMediaQuery?.matches ? "light" : "dark";
}

function resolveTheme(choice) {
  return choice === "system" ? systemTheme() : choice;
}

/** Paint a resolved theme. Also updates the browser chrome colour. */
function applyResolvedTheme(choice) {
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = choice;
  const meta = document.getElementById("meta-theme-color");
  if (meta) meta.setAttribute("content", THEME_COLORS[resolved] || THEME_COLORS.dark);
  return resolved;
}

/* ── Persisted appearance settings ─────────────────────────────────────── */
const settings = {
  keys: {
    theme: { attr: "data-theme", default: "system" },
    density: { attr: "data-density", default: "comfortable" },
    text: { attr: "data-text", default: "default" },
    contrast: { attr: "data-contrast", default: "normal" },
    motion: { attr: "data-motion", default: "full" },
  },
  load() {
    this.apply("theme", readStoredTheme());
    for (const [key, cfg] of Object.entries(this.keys)) {
      if (key === "theme") continue;
      let val = cfg.default;
      try { val = localStorage.getItem(`orbit.${key}`) ?? cfg.default; } catch { /* private mode */ }
      this.apply(key, val);
    }
  },
  apply(key, val) {
    const cfg = this.keys[key];
    if (key === "theme") {
      applyResolvedTheme(THEME_CHOICES.includes(val) ? val : "system");
    } else if (val === cfg.default && (key === "text" || key === "contrast" || key === "motion")) {
      document.documentElement.removeAttribute(cfg.attr);
    } else {
      document.documentElement.setAttribute(cfg.attr, val);
    }
    // Reflect into the segmented control, so the selected state is visible,
    // announced, and never communicated by colour alone.
    const seg = { theme: "#set-theme", density: "#set-density", text: "#set-text", contrast: "#set-contrast", motion: "#set-motion" }[key];
    if (seg) $$(`${seg} button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === val)));
  },
  set(key, val) {
    if (key === "theme") storeTheme(THEME_CHOICES.includes(val) ? val : "system");
    else { try { localStorage.setItem(`orbit.${key}`, val); } catch { /* session-only */ } }
    this.apply(key, val);
  },
};

function wireSettings() {
  const map = { "#set-theme": "theme", "#set-density": "density", "#set-text": "text", "#set-contrast": "contrast", "#set-motion": "motion" };
  for (const [sel, key] of Object.entries(map)) {
    $(sel)?.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn) return;
      settings.set(key, btn.dataset.value);
    });
  }

  // While the choice is "system", a device switching to dark at sunset must be
  // followed live. Once someone picks Light or Dark explicitly, the device no
  // longer gets a vote — that is what "override" means.
  const onSystemChange = () => {
    if (readStoredTheme() === "system") applyResolvedTheme("system");
  };
  lightMediaQuery?.addEventListener?.("change", onSystemChange);
}

/* ── Global keyboard behaviour ──────────────────────────────────────────
   Dev Update 1.3 removed the command palette and its Cmd+K / number-key
   shortcuts. Nothing replaced them because nothing needed to: every
   destination is a real link in a real navigation landmark, reachable by Tab
   and by the skip link, which is the accessible path the shortcuts were
   shadowing rather than providing. */

/* ── Data ──────────────────────────────────────────────────────────────── */
async function refreshData(notify = false) {
  const timezone = axisResolveTimezone();
  const [chart, symbolsData, eventsData] = await Promise.all([
    get(`/api/chart/now?tz=${encodeURIComponent(timezone)}`),
    get("/api/symbols"),
    get(`/api/events?count=9&tz=${encodeURIComponent(timezone)}`),
  ]);

  state.chart = chart;
  state.symbols = symbolsData.symbols;
  state.events = eventsData.events;

  renderEvents(state.events);
  if (!state.ready) { wireGlobalActions(); state.ready = true; }

  $("#settings-disclaimer").textContent = chart.disclaimer
    ? `${chart.disclaimer} Sky timing is computed from mean cycles and is approximate.`
    : $("#settings-disclaimer").textContent;

  if (notify) toast("Transits refreshed");
}

/* ── Boot ──────────────────────────────────────────────────────────────── */
async function boot() {
  settings.load();
  // Flags first: the rail is built from them, and building it twice would make
  // hidden features flash on screen before disappearing.
  await loadFeatureFlags();
  await loadFeaturePanels();
  buildRail();
  wireSettings();
  wireAuth();
  setupPlaceSearch("ob");
  setupPlaceSearch("cm");
  wireOnboarding();
  wireSavedCharts();
  wireChartModal();
  wirePlacementDetails();
  wireHomeChartActions();

  $("#topnav-date").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  window.addEventListener("hashchange", renderRoute);
  renderRoute();

  try {
    await restoreSession();
    refreshSecondaryRoute();
  } finally {
    // Belt and braces: whatever happens above, the startup gate comes down so
    // the interface is never permanently blocked.
    finishStartup();
  }

  // Orbit Axis daily experience (Today + History + detail levels).
  await axisInit();

  await refreshData();
}

// ── My Chart ─────────────────────────────────────────────────────────────────
const SIGN_GLYPH = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};
const PLACEMENT_GLYPHS = {
  Rising: "ASC", Sun: "☉", Moon: "☾", Mercury: "☿", Venus: "♀", Mars: "♂",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};
const ELEMENT_CLASS = { Fire: "fire", Earth: "earth", Air: "air", Water: "water" };
const PLACEMENT_ROLES = {
  Rising: { role: "Chart ruler and outward style", meaning: "How you approach life, first impressions, and new situations.", advanced: "Sets the house layout and orients the whole chart when birth time is reliable." },
  Sun: { role: "Core identity", meaning: "Where you develop confidence, vitality, and purpose.", advanced: "A luminary weighted strongly in element and modality balance." },
  Moon: { role: "Emotional nature", meaning: "What helps you feel secure, understood, and restored.", advanced: "A luminary that can shift noticeably when birth time is unknown." },
  Mercury: { role: "Communication and thinking", meaning: "How you process ideas, speak, learn, and make decisions.", advanced: "Shows mental style, information flow, and practical interpretation patterns." },
  Venus: { role: "Attraction, taste, and relating", meaning: "How you seek ease, pleasure, beauty, and connection.", advanced: "Highlights relational style, creative preference, and receptive values." },
  Mars: { role: "Drive, conflict, and action", meaning: "How you pursue goals, protect energy, and handle friction.", advanced: "Shows directness, urgency, motivation, and conflict rhythm." },
  Jupiter: { role: "Growth and faith", meaning: "Where you seek meaning, confidence, and wider possibility.", advanced: "Points to expansion, trust, study, and opportunity patterns." },
  Saturn: { role: "Boundaries, discipline, and responsibility", meaning: "Where life asks for patience, structure, and maturity.", advanced: "Shows pressure points, commitments, and long-term mastery." },
  Uranus: { role: "Change, freedom, and disruption", meaning: "Where you need room to innovate and break stale patterns.", advanced: "A generational planet that becomes personal through house, aspects, and chart emphasis." },
  Neptune: { role: "Dreams, intuition, and ideals", meaning: "Where imagination, longing, and spiritual sensitivity gather.", advanced: "A generational planet refined through house placement, aspects, and chart context." },
  Pluto: { role: "Power, depth, and transformation", meaning: "Where intensity, release, and deep renewal tend to unfold.", advanced: "A generational planet made personal by house position, aspects, and emphasis." },
};
const CHART_KEY_PLACEMENTS = ["Rising", "Sun", "Moon"];
const PLANET_GRID_PLACEMENTS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const STANDARD_PLANET_ORDER = ["Sun", "Moon", ...PLANET_GRID_PLACEMENTS];
const TIME_ACCURACY_COPY = {
  exact: { label: "Exact birth time", note: "Rising sign, houses, and angles can be read with confidence." },
  reported: { label: "Reported birth time", note: "Rising sign, houses, and angles use the saved reported time." },
  approximate: { label: "Approximate birth time", note: "Your Rising sign and houses may shift because the birth time is approximate." },
  unknown: { label: "Unknown birth time", note: "A birth time is needed to calculate your Rising sign and houses reliably." },
};

function degLabel(p) {
  if (!p || p.unavailable) return "";
  return `${p.degrees}° ${String(p.minutes).padStart(2, "0")}′`;
}

function formatBirthDate(value) {
  if (!value) return "Birth date not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatBirthTime(profile) {
  if (!profile || profile.time_accuracy === "unknown" || !profile.birth_time) return "Time unknown";
  const time = String(profile.birth_time).slice(0, 5);
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isFinite(hour) && Number.isFinite(minute)) {
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return time;
}

function timeAccuracyInfo(value) {
  return TIME_ACCURACY_COPY[value] || TIME_ACCURACY_COPY.unknown;
}

function houseLabel(chart, bodyName) {
  const house = chart?.planet_houses?.[bodyName];
  return house ? `House ${house}` : "House unavailable";
}

function modalityElement(sign) {
  return [elementOfSign(sign), modalityOfSign(sign)].filter(Boolean).join(" · ");
}

function elementOfSign(sign) {
  if (["Aries", "Leo", "Sagittarius"].includes(sign)) return "Fire";
  if (["Taurus", "Virgo", "Capricorn"].includes(sign)) return "Earth";
  if (["Gemini", "Libra", "Aquarius"].includes(sign)) return "Air";
  if (["Cancer", "Scorpio", "Pisces"].includes(sign)) return "Water";
  return "";
}

function modalityOfSign(sign) {
  if (["Aries", "Cancer", "Libra", "Capricorn"].includes(sign)) return "Cardinal";
  if (["Taurus", "Leo", "Scorpio", "Aquarius"].includes(sign)) return "Fixed";
  if (["Gemini", "Virgo", "Sagittarius", "Pisces"].includes(sign)) return "Mutable";
  return "";
}

function reliableHouseLabel(chart, bodyName) {
  if (!chart?.time_known) return "House unavailable";
  return houseLabel(chart, bodyName);
}

function placementData(chart, name) {
  const info = PLACEMENT_ROLES[name] || { role: "", meaning: "", advanced: "" };
  if (name === "Rising") {
    const rising = chart?.big_three?.rising;
    if (!rising || rising.unavailable) {
      return {
        name,
        glyph: PLACEMENT_GLYPHS.Rising,
        title: "Rising unavailable",
        sign: null,
        degree: "Birth time needed",
        house: "House unavailable",
        meta: "Birth time needed",
        role: info.role,
        meaning: info.meaning,
        advanced: info.advanced,
        unavailable: true,
        warning: TIME_ACCURACY_COPY.unknown.note,
      };
    }
    const chartRuler = chart.chart_ruler ? `${chart.chart_ruler} chart ruler` : "Chart ruler";
    return {
      name,
      glyph: PLACEMENT_GLYPHS.Rising,
      title: `Rising in ${rising.sign}`,
      sign: rising.sign,
      degree: degLabel(rising),
      house: "Chart angle",
      meta: `${degLabel(rising)} · ${chartRuler}`,
      role: info.role,
      meaning: info.meaning,
      advanced: [modalityElement(rising.sign), chart.angles?.ascendant?.longitude != null ? `${Number(chart.angles.ascendant.longitude).toFixed(2)}° absolute longitude` : ""].filter(Boolean).join(" · "),
      source: chart.angles?.ascendant || rising,
      unavailable: false,
    };
  }

  const body = chart?.planets?.[name];
  if (!body) {
    return {
      name,
      glyph: PLACEMENT_GLYPHS[name] || name.slice(0, 2),
      title: `${name} unavailable`,
      sign: null,
      degree: "Degree unavailable",
      house: "House unavailable",
      meta: "Placement unavailable",
      role: info.role,
      meaning: info.meaning || "This placement is not available in the current calculation.",
      advanced: info.advanced,
      unavailable: true,
    };
  }
  const house = reliableHouseLabel(chart, name);
  const titleHouse = house === "House unavailable" ? "" : ` · ${house}`;
  const degree = degLabel(body);
  const retro = body.retrograde ? " · Retrograde" : "";
  return {
    name,
    glyph: PLACEMENT_GLYPHS[name] || name.slice(0, 2),
    title: `${name} in ${body.sign}${titleHouse}`,
    sign: body.sign,
    degree,
    house,
    meta: `${degree}${retro}`,
    role: info.role,
    meaning: info.meaning,
    advanced: [info.advanced, modalityElement(body.sign), body.longitude != null ? `${Number(body.longitude).toFixed(2)}° absolute longitude` : ""].filter(Boolean).join(" · "),
    retrograde: !!body.retrograde,
    source: body,
    unavailable: false,
  };
}

function placementCardHtml(chart, name, { group }) {
  const data = placementData(chart, name);
  const technical = data.sign
    ? [elementOfSign(data.sign), modalityOfSign(data.sign), data.retrograde ? "Retrograde" : ""].filter(Boolean).join(" · ")
    : "";
  const warning = data.warning ? `<span class="placement-card__warning">${esc(data.warning)}</span>` : "";
  return `<button type="button" class="placement-card${data.unavailable ? " is-unavailable" : ""}" data-placement-name="${esc(name)}" data-placement-group="${esc(group)}" aria-label="${esc(data.title)} details">
    <span class="placement-card__glyph" aria-hidden="true">${esc(data.glyph)}</span>
    <span class="placement-card__main">
      <span class="placement-card__title">${esc(data.title)}</span>
      <span class="placement-card__meta">${esc(data.meta || data.degree)}</span>
      <span class="placement-card__role">${esc(data.role)}</span>
      ${warning}
      ${technical ? `<span class="placement-card__tech advanced-only">${esc(technical)}</span>` : ""}
    </span>
    <span class="placement-card__chevron" aria-hidden="true">›</span>
  </button>`;
}

function renderBigThree(bt) {
  const chart = state.activeNatalChart;
  const target = $("#bigthree");
  if (!target || !chart) return;
  target.innerHTML = CHART_KEY_PLACEMENTS.map((name) => placementCardHtml(chart, name, { group: "keys" })).join("");
}

function renderBars(elId, percentages, classMap) {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = Object.entries(percentages).map(([key, pct]) => `
    <div class="bar-row">
      <span class="bar-key">${esc(key)}</span>
      <span class="bar-track"><span class="bar-fill ${classMap ? (classMap[key] || "") : ""}" style="width:${pct}%"></span></span>
      <span class="bar-pct">${pct}%</span>
    </div>`).join("");
}

function renderKeyPlacements(chart) {
  const target = $("#key-placements");
  if (!target) return;
  target.innerHTML = PLANET_GRID_PLACEMENTS.map((name) => placementCardHtml(chart, name, { group: "planets" })).join("");
}

function placementDetailBodyHtml(chart, name) {
  const data = placementData(chart, name);
  const timeInfo = timeAccuracyInfo(chart.time_accuracy);
  const detailRows = [
    ["Sign", data.sign || "Unavailable"],
    ["Exact degree", data.degree || "Unavailable"],
    ["House", data.house || "House unavailable"],
    ["Retrograde", data.retrograde ? "Yes" : "No"],
  ];
  const reliability = [];
  if (chart.time_accuracy === "reported") reliability.push(TIME_ACCURACY_COPY.reported.note);
  if (chart.time_accuracy === "approximate") reliability.push(TIME_ACCURACY_COPY.approximate.note);
  if (chart.time_accuracy === "unknown" || data.unavailable || data.house === "House unavailable") reliability.push(TIME_ACCURACY_COPY.unknown.note);
  if (chart.warnings?.includes("moon_approximate") && name === "Moon") reliability.push("Moon may shift signs without a birth time.");
  return `
    <div class="placement-detail-hero">
      <span class="placement-detail-glyph" aria-hidden="true">${esc(data.glyph)}</span>
      <div>
        <p class="u-eyebrow">${esc(timeInfo.label)}</p>
        <h3>${esc(data.title)}</h3>
        <p>${esc(data.role)}</p>
      </div>
    </div>
    <dl class="placement-detail-facts">
      ${detailRows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
    </dl>
    ${reliability.length ? `<div class="placement-detail-warnings">${[...new Set(reliability)].map((item) => `<span class="warn-chip">${esc(item)}</span>`).join("")}</div>` : ""}
    <section class="placement-detail-section">
      <h3>Simple interpretation</h3>
      <p>${esc(data.meaning)}</p>
    </section>
    <section class="placement-detail-section advanced-only">
      <h3>Advanced notes</h3>
      <p>${esc(data.advanced || "No additional technical notes are available for this placement.")}</p>
    </section>`;
}

function openPlacementDetail(button) {
  const modal = $("#placement-detail-modal");
  const chart = state.activeNatalChart;
  const name = button?.dataset?.placementName;
  if (!modal || !chart || !name) return;
  const data = placementData(chart, name);
  $("#placement-detail-kicker").textContent = button.dataset.placementGroup === "keys" ? "Chart Key" : "Planet";
  $("#placement-detail-title").textContent = data.title;
  $("#placement-detail-body").innerHTML = placementDetailBodyHtml(chart, name);
  if (document.activeElement !== button) button.focus({ preventScroll: true });
  openModal(modal, { initialFocus: $("#placement-detail-close") });
}

function wirePlacementDetails() {
  const panel = $("#panel-me");
  if (!panel || panel._placementDetailsWired) return;
  panel._placementDetailsWired = true;
  panel.addEventListener("click", (event) => {
    const button = event.target.closest(".placement-card[data-placement-name]");
    if (!button) return;
    openPlacementDetail(button);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const button = event.target.closest(".placement-card[data-placement-name]");
    if (!button) return;
    event.preventDefault();
    openPlacementDetail(button);
  });
}

function renderPlacements(chart) {
  const target = $("#chart-placements");
  if (!target) return;
  const orderedPlanets = STANDARD_PLANET_ORDER.map((name) => chart.planets?.[name]).filter(Boolean);
  const rows = orderedPlanets.map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${SIGN_GLYPH[p.sign] || ""} ${esc(p.sign)}</td><td>${degLabel(p)}</td><td>${p.retrograde ? "Retrograde" : ""}</td><td>${chart.planet_houses[p.name] ? "H" + chart.planet_houses[p.name] : "—"}</td></tr>`
  ).join("");
  const asp = chart.aspects.slice(0, 12).map((a) =>
    `<li>${esc(a.a)} ${esc(a.aspect.toLowerCase())} ${esc(a.b)} <span class="orb">(orb ${a.orb}°)</span></li>`
  ).join("");
  const houseRows = chart.houses?.length ? chart.houses.map((h) =>
    `<tr><td>House ${h.house}</td><td>${SIGN_GLYPH[h.sign] || ""} ${esc(h.sign)}</td><td>${h.degrees}°${String(h.minutes).padStart(2, "0")}′</td></tr>`
  ).join("") : "";
  const angleRows = chart.time_known && chart.angles ? Object.entries(chart.angles).map(([name, angle]) =>
    angle ? `<tr><td>${name === "midheaven" ? "Midheaven" : "Ascendant"}</td><td>${SIGN_GLYPH[angle.sign] || ""} ${esc(angle.sign)}</td><td>${degLabel(angle)}</td></tr>` : ""
  ).join("") : "";
  const retro = chart.retrogrades?.length ? chart.retrogrades.join(", ") : "None";
  target.innerHTML = `
    <details class="chart-details">
      <summary>All planetary placements</summary>
      <table class="placements">
        <thead><tr><th>Body</th><th>Sign</th><th>Degree</th><th>Status</th><th>House</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
    <details class="chart-details">
      <summary>Houses</summary>
      ${houseRows ? `<table class="placements"><thead><tr><th>House</th><th>Sign</th><th>Cusp</th></tr></thead><tbody>${houseRows}</tbody></table>` : `<p class="me-muted">A birth time is needed to calculate houses reliably.</p>`}
    </details>
    <details class="chart-details">
      <summary>Major aspects</summary>
      <ul class="aspect-list">${asp || "<li>No major aspects in the current calculation.</li>"}</ul>
    </details>
    <details class="chart-details">
      <summary>Angles</summary>
      ${angleRows ? `<table class="placements"><thead><tr><th>Angle</th><th>Sign</th><th>Degree</th></tr></thead><tbody>${angleRows}</tbody></table>` : `<p class="me-muted">A birth time is needed to calculate angles reliably.</p>`}
    </details>
    <details class="chart-details">
      <summary>Elements, modalities, and retrogrades</summary>
      <div class="chart-meta">Chart ruler: ${esc(chart.chart_ruler || "—")} · Dominant: ${esc(chart.element_balance.dominant)} / ${esc(chart.modality_balance.dominant)} · Retrograde: ${esc(retro)} · ${esc(chart.calculation_version)}</div>
    </details>`;
}

function renderMeOverview(profile, chart, name) {
  const target = $("#me-overview");
  const status = $("#me-status");
  if (!target) return;
  if (!profile || !chart) {
    if (status) status.textContent = authSignedIn() && state.chartsStatus === "error"
      ? "We couldn't load your saved charts. Try again from Home."
      : "No active chart yet.";
    $("#mychart-name").textContent = "No active chart yet";
    $("#me-active-badge")?.setAttribute("hidden", "");
    target.innerHTML = `<div class="me-empty">
      <h2>No active chart yet</h2>
      <p>Create your chart to see your chart keys, planet grid, and saved profiles.</p>
      <button type="button" class="o-btn o-btn--primary" data-action="add-chart">Create your chart</button>
    </div>`;
    $("#bigthree").innerHTML = "";
    $("#key-placements").innerHTML = "";
    $("#chart-warnings").innerHTML = "";
    $("#chart-placements").innerHTML = "";
    renderBars("#element-bars", {}, null);
    renderBars("#modality-bars", {}, null);
    return;
  }
  if (status) status.textContent = "Active chart loaded.";
  $("#mychart-name").textContent = name || profile.nickname || "My Chart";
  $("#me-active-badge")?.removeAttribute("hidden");
  const timeInfo = timeAccuracyInfo(profile.time_accuracy || chart.time_accuracy);
  const rising = chart.big_three.rising?.unavailable ? "Needs birth time" : chart.big_three.rising?.sign;
  const mode = "Advanced";   // Update 5.2: one complete experience
  const cautions = [];
  if ((profile.time_accuracy || chart.time_accuracy) === "approximate") cautions.push(TIME_ACCURACY_COPY.approximate.note);
  if ((profile.time_accuracy || chart.time_accuracy) === "unknown" || chart.big_three.rising?.unavailable) cautions.push(TIME_ACCURACY_COPY.unknown.note);
  if (chart.warnings?.includes("moon_approximate")) cautions.push("Moon is calculated from the date and may shift signs without a birth time.");
  target.innerHTML = `
    <div class="me-overview__top">
      <div>
        <p class="u-eyebrow">Active Chart</p>
        <h2>${esc(name || profile.nickname || "My Chart")}</h2>
      </div>
      <button type="button" class="o-btn o-btn--secondary" data-action="edit" data-id="${esc(profile.id)}">Edit Chart</button>
    </div>
    <div class="me-overview__big">
      <span><strong>Sun</strong>${esc(chart.big_three.sun?.sign || "—")}</span>
      <span><strong>Moon</strong>${esc(chart.big_three.moon?.sign || "—")}</span>
      <span><strong>Rising</strong>${esc(rising || "—")}</span>
    </div>
    <dl class="me-facts">
      <div><dt>Birth date</dt><dd>${esc(formatBirthDate(profile.birth_date))}</dd></div>
      <div><dt>Birth location</dt><dd>${esc(profile.birthplace_name || "Location not set")}</dd></div>
      <div><dt>Birth time</dt><dd>${esc(formatBirthTime(profile))}</dd></div>
      <div><dt>Accuracy</dt><dd>${esc(timeInfo.label)}</dd></div>
      <div><dt>Mode</dt><dd>${esc(mode)}</dd></div>
    </dl>
    <p class="me-overview__note">${esc(timeInfo.note)}</p>
    ${cautions.length ? `<div class="chart-warnings">${cautions.map((c) => `<span class="warn-chip">${esc(c)}</span>`).join("")}</div>` : ""}`;
}

function renderChart(chart, name, profile = null) {
  state.activeNatalChart = chart;
  state.activeProfile = profile;
  const warn = $("#chart-warnings");
  if (warn && chart.warnings && chart.warnings.length) {
    const human = { birth_time_unknown: "Birth time unknown — Rising and houses are hidden.", houses_unavailable: "Houses unavailable.", rising_unavailable: "Rising unavailable.", moon_approximate: "Moon may shift signs without a birth time." };
    const seen = new Set();
    warn.innerHTML = chart.warnings.filter((w) => !seen.has(w) && seen.add(w)).map((w) => `<span class="warn-chip">${esc(human[w] || w)}</span>`).join("");
  } else if (warn) warn.innerHTML = "";
  renderMeOverview(profile, chart, name);
  renderBigThree(chart.big_three);
  renderKeyPlacements(chart);
  renderBars("#element-bars", chart.element_balance.percentages, ELEMENT_CLASS);
  renderBars("#modality-bars", chart.modality_balance.percentages, null);
  renderPlacements(chart);
}

// ══ Orbit Axis daily experience ═════════════════════════════════════════════
// Today workspace, Today's Fortune cards, Current Sky (with the procedural Moon),
// History, and the Simple/Advanced detail level. Deterministic fortune comes
// from the server; nothing here calculates astrology. Works in local dev via
// the stateless preview; upgrades to persisted fortunes when signed in.
const AXIS = {
  detail: "Simple",
  lastFortune: null,
  lastSky: null,
  currentTimezoneOverride: null, // session-only, set by "Use my current location"
  // Set once Today has been loaded, so startup doesn't fetch the fortune twice
  // (session restore already loads it for a signed-in returning user).
  loadedOnce: false,
};
// Update Two removed "Balanced". Only two levels remain; Simple is the default.
// Update 5.2: there is one experience, and it is the complete one.
//
// "Simple" hid houses, degrees, retrograde marks, and transit detail behind a
// switch most people never found — so the app looked shallower than it is, and
// the people most likely to leave it on Simple were exactly the ones who needed
// the plain-language explanations that now sit BESIDE the technical facts.
//
// Advanced no longer means "more confusing". It means complete, with help text.
const DETAILS = ["Advanced"];

// Coerce any value (including a legacy "Balanced" left in localStorage, a stale
// cached API response, or an unknown string) to a supported level. Advanced is
// preserved; everything else becomes Simple. Never crashes on bad input.
function normalizeDetail(value) {
  return String(value ?? "").trim().toLowerCase() === "advanced" ? "Advanced" : "Simple";
}
// Which per-factor phrasing key a level reads. Balanced no longer exists, so any
// non-Advanced level (including stale "Balanced") maps to the plain wording.
// Kept as a function so the (many) call sites need no edit, and so a stored
// "Simple" preference from before Update 5.2 resolves to the full experience
// rather than hiding content. The saved value is not deleted — see
// axisLoadDetail — because destroying a user preference to remove a feature is
// worse than ignoring it.
function detailKeyFor(level) {
  void level;              // deliberately ignored: there is only one level now
  return "advanced";
}

// The user's *current* (browsing) timezone — always distinct from a saved
// chart's birth timezone. Never falls back to the server's machine timezone.
function axisResolveTimezone() {
  if (AXIS.currentTimezoneOverride) return AXIS.currentTimezoneOverride;
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}

// Best-effort: tell the server the device timezone so /api/fortune/today and
// Current Sky can use it without a query param on every request. No-ops for
// signed-out users (their preview posts carry the timezone directly).
async function axisSyncCurrentTimezone() {
  if (!authSignedIn()) return;
  try { await put("/api/settings/current-timezone", { timezone_name: axisResolveTimezone(), source: "device" }); }
  catch { /* best effort */ }
}

// Request geolocation only on this explicit user action — never on load.
async function axisUseCurrentLocation() {
  const status = $("#current-sky-location-status");
  if (!("geolocation" in navigator)) {
    if (status) status.textContent = "Location isn't available in this browser.";
    return;
  }
  if (status) status.textContent = "Requesting your location…";
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { timezone_name } = await post("/api/settings/current-location", {
          latitude: position.coords.latitude, longitude: position.coords.longitude,
        });
        AXIS.currentTimezoneOverride = timezone_name;
        if (status) status.textContent = `Using your current location's timezone (${timezone_name}).`;
        await axisLoadToday();
      } catch {
        if (status) status.textContent = "Could not resolve a timezone for that location.";
      }
    },
    () => { if (status) status.textContent = "Location permission denied — using your device timezone instead."; },
    { timeout: 8000 },
  );
}

function axisGetBirth() {
  try { return JSON.parse(localStorage.getItem("oa_birth") || "null"); } catch { return null; }
}
function axisSetBirth(b) { localStorage.setItem("oa_birth", JSON.stringify(b)); }

async function axisLoadDetail() {
  // Update 5.2: the stored preference is READ but no longer obeyed. Anyone who
  // saved "Simple" before this update gets the complete experience without
  // having to find a setting and change it.
  //
  // The stored value is left alone rather than rewritten or deleted. It costs
  // nothing to keep, and silently overwriting a preference somebody set is a
  // worse habit than ignoring one that no longer applies. The Supabase column
  // is likewise retained and simply unused — see the deprecation note in the
  // vault.
  AXIS.detail = "Advanced";
  axisApplyDetail(false);
}
function axisApplyDetail(rerender = true) {
  // The attribute stays: some CSS still keys off it, and pinning it to Advanced
  // is what makes those rules always apply.
  document.documentElement.setAttribute("data-detail", "Advanced");
  if (rerender) {
    if (AXIS.lastFortune) axisRenderFortune(AXIS.lastFortune);
    if (AXIS.lastSky) axisRenderSky(AXIS.lastSky);
    if (state.activeNatalChart) renderMeOverview(state.activeProfile, state.activeNatalChart, state.activeProfile?.nickname || state.activeChartName);
  }
}
async function axisSetDetail(level) {
  const next = normalizeDetail(level);
  AXIS.detail = next;
  axisApplyDetail(true);
  try {
    await put("/api/settings/detail", { astrology_detail_level: next });
  } catch { /* best effort */ }
}

function axisWireChartPicker() {
  const select = $("#today-chart-select");
  if (!select || select._axisWired) return;
  select._axisWired = true;
  select.addEventListener("change", async (event) => {
    const id = event.target.value;
    const previousId = state.activeChartId;
    if (!id || id === previousId) return;
    select.disabled = true;
    try {
      await post(`/api/charts/${id}/activate`, {});
      await loadSavedCharts();
      await refreshActiveExperience();
      toast(`${activeChart()?.nickname || "Chart"} is active`);
    } catch (error) {
      event.target.value = previousId;
      toast(error.message);
    } finally {
      select.disabled = state.charts.length <= 1;
    }
  });
}

// Event delegation on the (stable) mount points below — their innerHTML is
// replaced on every render, but the elements themselves persist, so wiring
// once here keeps working across re-renders without rebinding listeners.
//
// The fortune needs no wiring any more. Update 5.2 replaced the carousel with
// cards, so there are no arrows, dots, arrow-key handlers, or swipe thresholds
// left to bind — the whole interaction is scrolling, which the browser already
// does.

function axisWireSkyControls() {
  const root = $("#today-sky");
  if (!root || root._axisWired) return;
  root._axisWired = true;
  root.addEventListener("click", (event) => {
    if (event.target.closest("#current-sky-use-location")) axisUseCurrentLocation();
  });
}

async function axisInit() {
  if (!$("#panel-home")) return;
  const today = new Date();
  $("#today-date").textContent = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  for (const btn of $$(".axis-detail button")) {
    btn.addEventListener("click", () => axisSetDetail(btn.dataset.level));
  }
  const scope = $("#history-scope");
  if (scope) scope.addEventListener("change", () => axisLoadHistory(scope.value));
  // History loads when its workspace opens (and once now if it's the route).
  window.addEventListener("hashchange", () => { if (currentWorkspace() === "history") axisLoadHistory($("#history-scope")?.value || "active"); });

  axisWireChartPicker();
  axisWireSkyControls();
  await axisSyncCurrentTimezone();
  axisLoadDetail();
  // A signed-in returning user already had Today loaded during session restore;
  // loading it again here would double every startup request.
  if (!AXIS.loadedOnce) axisLoadToday();
  if (currentWorkspace() === "history") axisLoadHistory("active");
}

// ── Today ────────────────────────────────────────────────────────────────────
async function axisLoadToday() {
  AXIS.loadedOnce = true;
  // Sky (incl. the Moon) always renders — it doesn't need a saved chart.
  const tz = axisResolveTimezone();
  get(`/api/sky/current?tz=${encodeURIComponent(tz)}`).then(r => { AXIS.lastSky = r.sky; axisRenderSky(r.sky); }).catch(() => {});

  // Fortune: prefer the signed-in path; fall back to a local preview.
  try {
    const r = await get("/api/fortune/today");
    AXIS.lastFortune = r.fortune;
    axisShowReadingFor(r.chart?.nickname || "My Chart");
    axisRenderFortune(r.fortune);
    refreshSecondaryRoute();
    return;
  } catch { /* signed out, no active chart, or a transient fortune failure */ }

  if (authSignedIn()) {
    // A failed *fortune* request says nothing about whether the account has a
    // chart. Onboarding is owned solely by resolveChartState() — never opened
    // from here, or a slow/failed fortune would re-onboard a returning user.
    if (state.chartsStatus === "error") {
      return axisRenderSetup("We couldn't load your charts just now. Use “Try again” above — your saved charts are safe.");
    }
    if (state.charts.length) {
      return axisRenderSetup("Your daily reading couldn't load just now. It will return on the next refresh.");
    }
    return axisRenderSetup("Save My Chart to unlock your daily reading. Your chart and reading history are stored in Supabase so they can follow your account.");
  }

  const birth = axisGetBirth();
  if (!birth) return axisRenderSetup();
  try {
    const r = await post("/api/fortune/preview", { ...birth, current_timezone_name: tz });
    AXIS.lastFortune = r.fortune;
    axisShowReadingFor(birth.nickname || "My Chart");
    axisRenderFortune(r.fortune);
    refreshSecondaryRoute();
  } catch (e) {
    $("#today-fortune").innerHTML = `<div class="fortune-card"><h2>Today’s Fortune</h2><p class="fortune-card__sub">${esc(e.message)}</p></div>`;
  }
}

function axisShowReadingFor(name) {
  const el = $("#today-reading-for");
  if (el) { el.hidden = false; $("#today-chart-name").textContent = name; }
  setActiveChartName(name);
}

/* ── Today's Fortune: cards, not slides ────────────────────────────────────
   The carousel is gone. It hid four of five readings behind a swipe nobody
   discovers, and on a phone the only affordance was a row of dots. Everything
   the fortune has to say is now visible by scrolling, which is the one
   interaction every user already knows.

   The split that makes this work already existed in the engine: `mood`,
   `love_reading`, `luck_reading`, and `watch_out` are plain-language readings,
   while `factors[].advanced` carries the technical phrasing. So the fortune
   says what the day may feel like, and Technical Sky below it says why —
   without the fortune ever naming a planet. */

/** The reading cards, in the order they are read. */
function axisFortuneCards(F) {
  return [
    {
      id: "mood",
      label: "Overall",
      lede: "What today may feel like",
      body: F.mood,
      primary: true,
    },
    { id: "love", label: "Connection", lede: "Relationships and communication", body: F.love_reading },
    { id: "luck", label: "Momentum", lede: "Where things may open up", body: F.luck_reading },
    { id: "watch", label: "Watch for", lede: "What may create friction", body: F.watch_out, caution: true },
  ].filter((card) => typeof card.body === "string" && card.body.trim().length > 0);
}

/**
 * A short closing direction, assembled from the readings themselves.
 *
 * Deliberately derived rather than generated: it restates what the deterministic
 * engine already produced. Inventing a new sentence here would be the one place
 * in Orbit where reading text was not traceable to engine evidence.
 */
function axisFortuneClosing(F) {
  const bits = [];
  if (F.lucky_number != null) bits.push(`Lucky number ${F.lucky_number}`);
  if (F.lucky_color?.name) bits.push(F.lucky_color.name);
  return bits.join(" · ");
}

function axisRenderFortune(F) {
  const cards = axisFortuneCards(F);
  const closing = axisFortuneClosing(F);
  const dateLabel = axisFortuneDate(F);

  // The title sits ABOVE the cards, so the day has a name before it has detail.
  const heading = `
    <header class="fortune-head">
      <p class="fortune-head__eyebrow">Today’s Fortune</p>
      <p class="fortune-head__date">${esc(dateLabel)}</p>
      <h2 class="fortune-head__title">${esc(F.mood_headline || axisFortuneTitle(F))}</h2>
      <p class="fortune-head__note">Symbolic reflection, never prediction.</p>
    </header>`;

  const grid = cards.map((card) => `
    <article class="fortune-card2${card.primary ? " fortune-card2--primary" : ""}${card.caution ? " fortune-card2--caution" : ""}">
      <h3 class="fortune-card2__label">${esc(card.label)}</h3>
      <p class="fortune-card2__lede">${esc(card.lede)}</p>
      <p class="fortune-card2__body">${esc(card.body)}</p>
    </article>`).join("");

  $("#today-fortune").innerHTML = `
    <section class="fortune" aria-labelledby="fortune-title">
      ${heading.replace('class="fortune-head__title"', 'class="fortune-head__title" id="fortune-title"')}
      <div class="fortune-grid">${grid}</div>
      ${closing ? `<p class="fortune-closing">${esc(closing)}</p>` : ""}
    </section>`;
}

/** A human date, falling back to the raw value rather than showing nothing. */
function axisFortuneDate(F) {
  return formatLocalDateKey(F.fortune_date || "");
}

function formatLocalDateKey(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * A short title for the day, taken from the opening clause of the overall
 * reading. Derived, never invented — and never technical, because `mood` is
 * already plain language.
 */
function axisFortuneTitle(F) {
  const text = String(F.mood || "").trim();
  if (!text) return "Today";
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] || text;
  const clause = firstSentence.split(/[,;—]/)[0].trim().replace(/\.$/, "");
  const title = clause.length >= 8 && clause.length <= 72 ? clause : firstSentence.replace(/\.$/, "");
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

// ── Current Sky: one unified panel (Moon + Sun + season + local time) ──────
function axisRenderSky(sky) {
  if (!sky || !$("#today-sky")) return;
  const moonSvg = renderMoonSVG({ illumination: sky.moon.illumination_percent, waxing: sky.moon.waxing, phaseName: sky.moon.phase_name });
  const localTime = sky.local_time_iso
    ? new Date(sky.local_time_iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const localDateLabel = formatLocalDateKey(sky.local_date || "");
  if (localDateLabel) {
    $("#today-date").textContent = localDateLabel;
    $("#topnav-date").textContent = new Date(`${sky.local_date}T12:00:00.000Z`)
      .toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
      });
  }
  const nextFullLabel = formatLocalDateKey(sky.next_full_moon?.local_date || "");
  const nextNewLabel = formatLocalDateKey(sky.next_new_moon?.local_date || "");

  const chips = [
    // "Cancer Season" and "Sun in Cancer" are the same fact. The season reads
    // better and the Sun's exact degree lives in the Technical Sky table below,
    // where it is actually useful.
    `<span class="sky-chip"><span class="dot"></span>${esc(sky.zodiac_season)} Season</span>`,
    `<span class="sky-chip"><span class="dot"></span>Moon in ${esc(sky.moon.sign)}</span>`,
    `<span class="sky-chip"><span class="dot"></span>${esc(sky.moon.phase_name)} · ${Math.round(sky.moon.illumination_percent)}% lit</span>`,
    ...(sky.retrogrades || []).map(r => `<span class="sky-chip retro"><span class="dot"></span>${esc(r)} retrograde</span>`),
  ].join("");

  const theme = (sky.retrogrades || []).includes("Mercury")
    ? "A slow-down-and-review kind of sky — good for tidying and second drafts."
    : `${sky.moon.waxing ? "A building, lean-in" : "A settling, wind-down"} sky today.`;

  // Update 5.2: every reader gets the complete technical view. The advanced
  // factor phrasing is the one shown, because "Sun 28°14′ Cancer" is the point
  // of this section — the plain-language version already appeared in the
  // fortune above, and repeating it here would say the same thing twice.
  const transitFactors = (AXIS.lastFortune?.factors || []).filter(f => f.type === "transit").slice(0, 3);
  const personal = transitFactors.length ? `
    <div class="current-sky__personal">
      <div class="u-eyebrow">Active transits for ${esc(state.activeChartName)}</div>
      <ul class="current-sky__transit-list">${transitFactors.map(f => `<li>${esc(f.advanced ?? f.simple)}</li>`).join("")}</ul>
    </div>` : "";

  let advanced = "";
  if (sky.planets) {
    const rows = Object.values(sky.planets).map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.sign)} ${p.degrees}°${String(p.minutes).padStart(2, "0")}′</td><td>${p.retrograde ? `<abbr title="Retrograde">℞</abbr>` : ""}</td></tr>`).join("");
    advanced = `
      <div class="sky-technical">
        <h3 class="sky-technical__title">Positions right now</h3>
        <p class="sky-technical__help">Each body's exact position. Degrees are measured within the sign; ℞ means the planet appears to move backwards from Earth.</p>
        <div class="sky-technical__scroll">
          <table class="placements">
            <thead><tr><th scope="col">Body</th><th scope="col">Position</th><th scope="col"><span class="sr-only">Retrograde</span><span aria-hidden="true">℞</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  const summary = `${sky.moon.phase_name} Moon, ${Math.round(sky.moon.illumination_percent)}% illuminated and ${sky.moon.waxing ? "waxing" : "waning"}, in ${sky.moon.sign}. ${sky.zodiac_season} season.${(sky.retrogrades || []).length ? ` ${sky.retrogrades.join(", ")} retrograde.` : ""}`;

  $("#today-sky").innerHTML = `
    <div class="current-sky">
      <div class="current-sky__moon" aria-hidden="true">${moonSvg}</div>
      <div class="current-sky__body">
        <h2>Technical Sky</h2>
        <p class="sr-only">${esc(summary)}</p>
        ${localTime ? `<div class="current-sky__local">${esc(localTime)} · your local time</div>` : ""}
        <div class="sky-facts">${chips}</div>
        <div class="sky-next-events" aria-label="Next lunar events">
          <span>Next full moon <strong>${esc(nextFullLabel)}</strong></span>
          <span>Next new moon <strong>${esc(nextNewLabel)}</strong></span>
        </div>
        <div class="sky-theme">${theme}</div>
        ${personal}
        <!-- Update 5.2b: the two secondary destinations, reached from the
             section whose content they explain. Text labels, not icons. -->
        <div class="sky-actions">
          <a class="o-btn o-btn--secondary sky-action" href="#transits">View Today’s Transits</a>
          <a class="o-btn o-btn--secondary sky-action" href="#symbol-atlas">Open Symbol Atlas</a>
        </div>
        <div class="current-sky__location">
          <span class="u-caption" id="current-sky-location-status">Using your device timezone. Sharing your location can refine this to where you are right now.</span>
          <button type="button" class="o-btn o-btn--ghost o-btn--sm" id="current-sky-use-location">Use my current location</button>
        </div>
        ${advanced}
      </div>
    </div>`;
}

function axisRenderSetup(message = "Tell Orbit Axis when and where you were born, and it will read today’s sky just for you. Sign in to save this as My Chart.") {
  $("#today-fortune").innerHTML = `
    <div class="fortune-card">
      <h2>Set up your chart</h2>
      <div class="fortune-card__sub" id="oa-setup-error"></div>
      <div class="fortune-setup">
        <p>${esc(message)}</p>
        <form id="oa-setup" class="chart-form">
          <div class="chart-form-grid">
            <label>First name <input type="text" id="oa-first" autocomplete="given-name" /></label>
            <label>Last name <input type="text" id="oa-last" autocomplete="family-name" /></label>
            <label>Birth date <input type="date" id="oa-date" required /></label>
            <label>Birth time <input type="time" id="oa-time" /></label>
            <label>Time accuracy
              <select id="oa-accuracy"><option value="exact">exact</option><option value="reported">reported</option><option value="approximate">approximate</option><option value="unknown">unknown</option></select>
            </label>
            <label class="place-field">Birthplace
              <input type="text" id="oa-place" placeholder="Start typing a city" autocomplete="off" required />
              <div class="place-results" id="oa-place-results"></div>
              <span class="place-status" id="oa-place-status" role="status" aria-live="polite"></span>
            </label>
          </div>
          <button type="submit">See today’s reading</button>
        </form>
      </div>
    </div>`;
  setupPlaceSearch("oa");
  $("#oa-setup").addEventListener("submit", (e) => {
    e.preventDefault();
    if (authSignedIn()) {
      post("/api/charts", chartFormPayload("oa", { forceMyChart: true }))
        .then(async () => {
          await loadSavedCharts();
          await refreshActiveExperience();
        })
        .catch(error => { $("#oa-setup-error").textContent = error.message; });
    } else {
      $("#oa-setup-error").textContent = "Sign in to search birthplaces and save My Chart.";
    }
  });
}

// ── History ──────────────────────────────────────────────────────────────────
async function axisLoadHistory(scope = "active") {
  const body = $("#history-body");
  if (!body) return;
  try {
    const r = await get(`/api/fortune/history?scope=${encodeURIComponent(scope)}&limit=30`);
    if (!r.fortunes || r.fortunes.length === 0) return axisRenderHistoryEmpty();
    axisRenderHistory(r.fortunes);
  } catch {
    // Not signed in → no persisted history yet. Honest empty state (no fabrication).
    axisRenderHistoryEmpty();
  }
}

function axisRenderHistoryEmpty() {
  $("#history-body").innerHTML = `
    <div class="history-empty">
      <div class="history-empty__art"><div class="axis-moon" style="--moon-size:96px" aria-hidden="true"><span class="axis-moon__halo"></span></div></div>
      <h2>No readings yet</h2>
      <p>Your daily readings will collect here as you return to Orbit Axis. Come back tomorrow to start your history.</p>
    </div>`;
}

function axisRenderHistory(entries) {
  const adv = true;   // Update 5.2: history always shows the full entry
  $("#history-body").innerHTML = `<div class="history-list">${entries.map(f => `
    <details class="history-entry">
      <summary>
        <div class="history-entry__top">
          <span class="history-entry__date">${esc(formatLocalDateKey(f.fortune_date))}</span>
          <span class="history-entry__chips">
            <span class="history-entry__num">#${esc(f.lucky_number)}</span>
            <span class="history-entry__swatch" style="background:${esc(f.lucky_color?.value || "#888")}"></span>
            <span class="history-entry__chart">${esc(f.chart_nickname || "")}</span>
          </span>
        </div>
        <div class="history-entry__mood">${esc(f.mood || "")}</div>
        <div class="history-entry__love">${esc((f.love_reading || "").slice(0, 90))}${(f.love_reading || "").length > 90 ? "…" : ""}</div>
      </summary>
      <div class="history-entry__detail">
        ${histRow("Love", f.love_reading)}
        ${histRow("Luck", f.luck_reading)}
        ${histRow("Watch-Out", f.watch_out)}
        ${histRow("Moon", `${f.sky_snapshot?.moon_phase || ""} in ${f.sky_snapshot?.moon_sign || ""} · ${f.sky_snapshot?.illumination_percent ?? ""}% lit`)}
        ${adv ? histRow("Engine", f.fortune_engine_version) : ""}
      </div>
    </details>`).join("")}</div>`;
}
function histRow(label, val) {
  return val ? `<div class="history-detail-row"><span class="lbl">${label}</span><span class="val">${esc(val)}</span></div>` : "";
}

boot().catch(err => {
  $("#workspace").insertAdjacentHTML("afterbegin",
    `<div class="o-card" style="border-color:var(--color-error);color:var(--color-error);">
       <strong>Orbit failed to load.</strong> ${esc(err.message)}
     </div>`);
});
