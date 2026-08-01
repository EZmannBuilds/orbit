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
  activeReading: null,
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

/* ── Birthplace search ───────────────────────────────────────────────────
   A combobox over a server-backed place search. Three properties matter more
   than the markup:

   1. A CHART MAY ONLY BE SAVED AGAINST A PLACE THE SERVER SIGNED. The server
      returns a selection_token with each result and refuses a chart whose place
      lacks a valid one, so typed text can never become coordinates. Everything
      here is a convenience layer over that rule, not a substitute for it.

   2. A STALE SELECTION MUST NOT SURVIVE AN EDIT. Someone who picks "London,
      England" and then types over it has not chosen a place; keeping the old
      token would silently save a chart for a city they just deleted. Editing
      the field clears the selection.

   3. A SLOW ANSWER MUST NOT OVERWRITE A FAST ONE. Requests are sequenced and
      the in-flight one is aborted, so results from an abandoned query cannot
      replace results for what the user is actually typing. */

const PLACE_MIN_QUERY = 3;
const PLACE_DEBOUNCE_MS = 300;

function placeEls(prefix) {
  return {
    input: $(`#${prefix}-place`),
    results: $(`#${prefix}-place-results`),
    status: $(`#${prefix}-place-status`),
    clear: $(`#${prefix}-place-clear`),
  };
}

function setPlaceStatus(prefix, text) {
  const { status } = placeEls(prefix);
  if (status) status.textContent = text || "";
}

function closePlaceResults(prefix) {
  const { input, results } = placeEls(prefix);
  if (results) { results.hidden = true; results.innerHTML = ""; results._places = []; }
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
}

function clearPlaceSelection(prefix, message = "") {
  delete state.places.selections[prefix];
  closePlaceResults(prefix);
  setPlaceStatus(prefix, message);
  const { clear, input } = placeEls(prefix);
  if (clear) clear.hidden = !(input?.value.trim());
}

function setPlaceSelection(prefix, place, { existing = false } = {}) {
  state.places.selections[prefix] = { ...place, existing, label: place.label || place.birthplace_name || "" };
  const { input, clear } = placeEls(prefix);
  if (input) input.value = state.places.selections[prefix].label;
  closePlaceResults(prefix);
  setPlaceStatus(prefix, existing
    ? "Saved birthplace will be reused."
    : "Birthplace selected. The timezone is worked out from it.");
  if (clear) clear.hidden = false;
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

/**
 * The place half of the submit payload, or a thrown error explaining what is
 * missing. An existing saved place is allowed through without a fresh token
 * only when the caller is editing a chart that already has one.
 */
function requireSelectedPlace(prefix, { allowExisting = false } = {}) {
  const place = state.places.selections[prefix];
  if (!place) throw new Error("Choose a birthplace from the list of results.");
  const typed = placeEls(prefix).input?.value.trim() || "";
  // The typed text having drifted from the selection is the stale-token case.
  if (typed !== place.label) throw new Error("Choose a birthplace from the list of results.");
  if (place.selection_token) return { birthplace: place };
  if (allowExisting && place.existing) return {};
  throw new Error("Choose a birthplace from the list of results.");
}

function renderPlaceResults(prefix, items) {
  const { input, results } = placeEls(prefix);
  if (!results) return;
  results._places = items;
  results.innerHTML = items.map((place, i) => `
    <li role="option" id="${prefix}-place-opt-${i}" class="place-result" data-index="${i}" aria-selected="false" tabindex="-1">
      ${esc(place.label)}
    </li>`).join("");
  results.hidden = items.length === 0;
  if (input) input.setAttribute("aria-expanded", String(items.length > 0));
  results._active = -1;
}

function movePlaceActive(prefix, delta) {
  const { input, results } = placeEls(prefix);
  const options = [...(results?.querySelectorAll("[role=option]") || [])];
  if (!options.length) return;
  const next = Math.max(0, Math.min(options.length - 1, (results._active ?? -1) + delta));
  results._active = next;
  options.forEach((el, i) => el.setAttribute("aria-selected", String(i === next)));
  options[next].scrollIntoView({ block: "nearest" });
  if (input) input.setAttribute("aria-activedescendant", options[next].id);
}

function choosePlaceActive(prefix) {
  const { results } = placeEls(prefix);
  const i = results?._active ?? -1;
  const place = i >= 0 ? results?._places?.[i] : null;
  if (place) { setPlaceSelection(prefix, place); return true; }
  return false;
}

async function runPlaceSearch(prefix, query) {
  const { results } = placeEls(prefix);
  if (!results) return;
  state.places.controllers[prefix]?.abort();
  const controller = new AbortController();
  state.places.controllers[prefix] = controller;
  setPlaceStatus(prefix, "Searching…");
  try {
    const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}&limit=5`, {
      credentials: "same-origin", signal: controller.signal,
    });
    const parsed = await readApiResponse(response);
    if (parsed.kind !== "json") throw new Error(apiTransportMessage(parsed.kind, parsed.status));
    const data = parsed.data ?? {};
    if (!parsed.ok) {
      // Distinguish "the search is not available" from "nothing matched": one
      // is worth retrying and the other is not.
      const message = data.code === "geoapify_unconfigured"
        ? "Birthplace search isn't available right now."
        : (data.error || "Birthplace search failed.");
      throw new Error(message);
    }
    const items = data.results || [];
    renderPlaceResults(prefix, items);
    setPlaceStatus(prefix, items.length
      ? `${items.length} ${items.length === 1 ? "match" : "matches"}. Use the arrow keys to choose one.`
      : `No places matched “${query}”. Try a nearby larger town.`);
  } catch (error) {
    if (error.name === "AbortError") return;   // a newer query owns the field now
    closePlaceResults(prefix);
    setPlaceStatus(prefix, `${error.message} You can try again.`);
  }
}

function setupPlaceSearch(prefix) {
  const { input, results, clear } = placeEls(prefix);
  if (!input || !results || input._wired) return;
  input._wired = true;
  let timer = null;

  input.addEventListener("input", () => {
    const selected = state.places.selections[prefix];
    if (selected && input.value.trim() !== selected.label) {
      clearPlaceSelection(prefix, "Choose a birthplace from the list of results.");
    }
    if (clear) clear.hidden = !input.value.trim();
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < PLACE_MIN_QUERY) {
      closePlaceResults(prefix);
      setPlaceStatus(prefix, q ? "Keep typing to search." : "");
      return;
    }
    timer = setTimeout(() => runPlaceSearch(prefix, q), PLACE_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); movePlaceActive(prefix, 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); movePlaceActive(prefix, -1); }
    else if (event.key === "Enter") {
      // Only swallow Enter when it is actually choosing a result; otherwise it
      // belongs to the form.
      if (!results.hidden && choosePlaceActive(prefix)) event.preventDefault();
    } else if (event.key === "Escape") {
      if (!results.hidden) { event.stopPropagation(); closePlaceResults(prefix); }
    }
  });

  results.addEventListener("click", (event) => {
    const option = event.target.closest("[role=option]");
    if (!option) return;
    const place = results._places?.[Number(option.dataset.index)];
    if (place) { setPlaceSelection(prefix, place); input.focus(); }
  });

  clear?.addEventListener("click", () => {
    input.value = "";
    clearPlaceSelection(prefix, "");
    clear.hidden = true;
    input.focus();
  });
}

/* ── Inline icon set (stroke, 24-grid) ───────────────────────────────────
   One entry per navigable destination, and no more. Every icon here is
   referenced by a WORKSPACES entry; an icon nobody draws is dead weight that
   the next person has to check before deleting.

   The icons SUPPLEMENT the labels — every navigation item shows its name in
   text, on phone and desktop alike, so nothing here has to carry meaning on
   its own. They still have to be distinguishable from each other at 20px,
   which is why Home (a horizon sun) and My Chart (a natal wheel) do not both
   get to be a circle with rays. */
const ICONS = {
  home: '<circle cx="12" cy="13" r="4"/><path d="M12 3v2M5.5 6.5l1.4 1.4M18.5 6.5l-1.4 1.4M3 13h2M19 13h2M4 20h16"/>',
  // A natal wheel: the outer ring, the axis cross, and the ascendant marker.
  mychart: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  transits: '<path d="M12 3a9 9 0 1 0 9 9"/><circle cx="12" cy="12" r="3"/><path d="M20 4l-6 6"/>',
  tools: '<path d="M3 7h7M3 12h4M3 17h9"/><circle cx="14" cy="7" r="2.5"/><circle cx="11" cy="17" r="2.5"/><path d="M17 12h4M16.5 12a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',

  // Secondary destinations. Not in the rail today, but the registry gives
  // every workspace an icon and the router reads it.
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  atlas: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.2 8.6l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12H21a2 2 0 1 1 0 4h-.09z"/>',

  // Unfinished features, kept so an enabled flag in development still draws.
  tarot: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M12 7l1.2 3.2L16 12l-2.8 1.8L12 17l-1.2-3.2L8 12l2.8-1.8z"/>',
  learn: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  news: '<path d="M4 5h13a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h8M8 17h5"/>',
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
  { id: "positions", label: "Current Positions", crumb: "The sky right now", icon: "atlas", primary: false },
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

/* Transit ranking lives in lib/transits — server-side, tested, and shared with
   the API response. A second ranker in the browser was removed in Dev Update
   1.8: two rankers are one more than the number that can be right, and the
   page renders the order it is given. */


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
  // Positions describes the shared sky, so it loads for anyone who opens it —
  // no active chart, and no chart at all, are both fine.
  if (id === "positions") { wirePositions(); loadPositions(); }
}

/* ── Today's Transits ───────────────────────────────────────────────────────
   Rebuilt in Dev Update 1.8. The previous renderer read AXIS.lastFortune.factors
   and filtered `type === "transit"` — but the fortune engine emits only its top
   three, so this page showed at most three contacts: a summary slice built for
   a daily reading, presented as a transits workspace.

   It now consumes GET /api/charts/:id/transits, which calculates the full set
   server-side. There is deliberately NO fallback to the old path: a hidden
   fallback would mask a broken endpoint behind three plausible-looking cards. */

const TRANSITS = { loading: false, token: 0, chartId: null, data: null };

function transitsClear() {
  TRANSITS.data = null;
  const body = $("#transits-body");
  if (body) body.innerHTML = "";
  const ctx = $("#transits-context");
  if (ctx) ctx.textContent = "";
  const explore = $("#transits-explore");
  if (explore) explore.hidden = true;
}

function transitsStatus(text) {
  const el = $("#transits-status");
  if (el) el.textContent = text || "";
}

function transitsChartName(nickname) {
  const el = $("#transits-chart-name");
  if (el) el.textContent = nickname || "your chart";
}

async function loadTransits() {
  // Same three-state session model as Positions: unresolved is not signed out,
  // and neither renders anything.
  if (state.auth.restoring || !authSignedIn()) { transitsClear(); transitsRenderSignedOut(); return; }
  const chart = activeChart();
  if (!chart) { transitsClear(); transitsRenderNoChart(); return; }

  // Rapid switching: a slower response for an abandoned chart must never paint
  // over a newer selection.
  const token = ++TRANSITS.token;
  TRANSITS.chartId = chart.id;
  TRANSITS.loading = true;
  transitsClear();
  // Name the INCOMING chart immediately. Leaving the previous name in the
  // subtitle while the status line announces a different one is the same
  // stale-attribution problem as showing its cards, in one line of text.
  transitsChartName(chart.nickname);
  transitsRenderLoading(chart.nickname);
  transitsStatus(`Loading transits for ${chart.nickname || "your chart"}…`);

  let data;
  try {
    const tz = axisResolveTimezone();
    data = await get(`/api/charts/${chart.id}/transits?tz=${encodeURIComponent(tz)}`);
  } catch (error) {
    if (token !== TRANSITS.token) return;
    TRANSITS.loading = false;
    transitsRenderError("We couldn't work out your transits just now. Your saved charts are safe.");
    return;
  }
  if (token !== TRANSITS.token) return;   // superseded by a newer chart

  TRANSITS.loading = false;
  TRANSITS.data = data;
  try {
    renderTransitsWorkspace(data, chart);
    transitsStatus(`Transits for ${chart.nickname || "your chart"} are ready.`);
  } catch (error) {
    // A render defect is ours. Reporting it as a network problem would hide it.
    console.error("[orbit] transits failed to render", { stage: "render", message: error?.message });
    transitsRenderError("We couldn't show your transits just now. This one is on us — please try again.");
  }
}

function transitsRenderSignedOut() {
  const body = $("#transits-body");
  if (body) body.innerHTML = "";
  transitsStatus("");
}

function transitsRenderLoading(name) {
  const body = $("#transits-body");
  if (body) {
    body.innerHTML = `<div class="axis-shimmer" style="height:280px" role="status" aria-live="polite"
      aria-label="Loading transits for ${esc(name || "your chart")}"></div>`;
  }
}

function transitsRenderError(message) {
  const body = $("#transits-body");
  // Announced through the persistent live region rather than a role="alert"
  // injected with the markup. A live region that already exists in the tree
  // announces reliably; one created at the same moment as its text does not,
  // and an unannounced failure is indistinguishable from a page that hung.
  // The visible block carries no role, so the message is spoken once.
  transitsStatus(message);
  if (!body) return;
  body.innerHTML = `<div class="axis-section-error">
    <p>${esc(message)}</p>
    <button type="button" class="o-btn o-btn--secondary o-btn--sm" data-action="retry-transits">Try again</button>
  </div>`;
}

function transitsRenderNoChart() {
  const body = $("#transits-body");
  transitsStatus("");
  if (!body) return;
  // No fabricated summary, no empty card grid — one explanation and one action.
  body.innerHTML = `<div class="tr-empty">
    <h2>Transits need a birth chart</h2>
    <p>Today’s Transits measures the current sky against your own placements, so it needs a saved chart to compare with.</p>
    <p>The sky itself is available to everyone — Current Positions shows where the planets are right now, with no chart required.</p>
    <div class="tr-empty__actions">
      <button type="button" class="o-btn o-btn--primary" data-action="add-chart">Create your chart</button>
      <a class="o-btn o-btn--secondary" href="#positions">View Current Positions</a>
    </div>
  </div>`;
}

function transitCardHtml(t, { background = false } = {}) {
  const r = t.reading;
  if (!r) return "";
  const facts = [
    t.motion ? `<span class="tr-badge">${esc(t.motion)}</span>` : "",
    t.intensityLabel ? "" : "",
    r.intensity ? `<span class="tr-badge tr-badge--soft">${esc(r.intensity)}</span>` : "",
    t.retrograde ? `<span class="tr-badge tr-badge--soft">Retrograde</span>` : "",
  ].filter(Boolean).join("");
  return `<article class="tr-card${background ? " tr-card--background" : ""}">
    <h3 class="tr-card__title">${esc(r.title)}</h3>
    <p class="tr-card__meta">${facts}<span class="tr-orb">${esc(t.orbLabel)} orb</span></p>
    <p class="tr-card__lead">${esc(r.lead)}</p>
    <details class="reading-card__more">
      <summary><span>What this may emphasise</span></summary>
      <div class="reading-card__body">
        ${r.detail.map((d) => `<p>${esc(d)}</p>`).join("")}
        <div class="reading-card__aside"><h4>Constructive potential</h4><p>${esc(r.constructive)}</p></div>
        <div class="reading-card__aside"><h4>Possible tension</h4><p>${esc(r.tension)}</p></div>
        <dl class="tr-evidence">
          <div><dt>Transiting</dt><dd>${esc(t.transiting)} ${esc(t.transitingPosition)}</dd></div>
          <div><dt>Your natal ${esc(t.natal)}</dt><dd>${esc(t.natalPosition)}</dd></div>
          <div><dt>Aspect</dt><dd>${esc(t.aspect)}</dd></div>
          <div><dt>Orb</dt><dd>${esc(t.orbLabel)}</dd></div>
          ${t.motion ? `<div><dt>Motion</dt><dd>${esc(t.motion)}</dd></div>` : ""}
          <div><dt>Duration</dt><dd>${esc(t.duration)}</dd></div>
        </dl>
      </div>
    </details>
  </article>`;
}

function renderTransitsWorkspace(data, chart) {
  const body = $("#transits-body");
  if (!body) throw new Error("renderTransitsWorkspace called without a mount point");
  if (!data) throw new Error("renderTransitsWorkspace called without transit data");

  transitsChartName(chart?.nickname);
  const ctx = $("#transits-context");
  if (ctx && data.localDate) {
    const day = formatLocalDateKey(data.localDate);
    const when = data.calculatedAt
      ? new Date(data.calculatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    ctx.textContent = [day, data.timezone ? `Based on ${data.timezone} local time` : "",
                       when ? `Sky calculated for ${when}` : ""].filter(Boolean).join(" · ");
  }

  const immediate = data.immediate || [];
  const background = data.background || [];
  const explore = $("#transits-explore");
  if (explore) explore.hidden = false;

  if (!immediate.length && !background.length) {
    body.innerHTML = `
      ${data.limitation ? transitLimitationHtml(data.limitation) : ""}
      <div class="tr-empty">
        <h2>No major transits are in range right now</h2>
        <p>No supported major aspect is currently within the orb Orbit Axis reports on. That is an ordinary state, not a problem — the sky is still moving.</p>
        <div class="tr-empty__actions">
          <a class="o-btn o-btn--secondary" href="#positions">View Current Positions</a>
          <a class="o-btn o-btn--secondary" href="#me">Review My Chart</a>
          <a class="o-btn o-btn--secondary" href="#home">Return Home</a>
        </div>
      </div>`;
    return;
  }

  const all = data.all || [];
  body.innerHTML = `
    ${data.summary ? `<section class="o-card tr-summary" aria-labelledby="tr-summary-title">
      <h2 class="axis-section-title" id="tr-summary-title">Your transit summary</h2>
      <p class="tr-summary__text">${esc(data.summary.text)}</p>
    </section>` : ""}

    ${data.limitation ? transitLimitationHtml(data.limitation) : ""}

    ${immediate.length ? `<section class="o-card" aria-labelledby="tr-immediate-title">
      <h2 class="axis-section-title" id="tr-immediate-title">Most active today</h2>
      <p class="axis-section-help">Faster-moving contacts — these are what changed recently.</p>
      <div class="tr-list">${immediate.map((t) => transitCardHtml(t)).join("")}</div>
    </section>` : ""}

    ${background.length ? `<section class="o-card" aria-labelledby="tr-background-title">
      <h2 class="axis-section-title" id="tr-background-title">Background influences</h2>
      <p class="axis-section-help">Slower contacts. These move gradually and stay relevant far longer — quieter day to day, not less significant.${
        data.summary && data.summary.backgroundCount > background.length
          ? ` Showing the ${background.length} closest of ${data.summary.backgroundCount}.`
          : ""}</p>
      <div class="tr-list tr-list--background">${background.map((t) => transitCardHtml(t, { background: true })).join("")}</div>
    </section>` : ""}

    <section class="o-card" aria-labelledby="tr-technical-title">
      <h2 class="axis-section-title" id="tr-technical-title">Complete technical details</h2>
      <details class="chart-details">
        <summary>All ${all.length} contact${all.length === 1 ? "" : "s"} within orb</summary>
        <div class="table-scroll">
          <table class="placements">
            <thead><tr><th scope="col">Transiting</th><th scope="col">Aspect</th><th scope="col">Natal</th><th scope="col">Orb</th><th scope="col">Motion</th><th scope="col">Group</th></tr></thead>
            <tbody>${all.map((t) => `<tr>
              <td>${esc(t.transiting)}</td><td>${esc(t.aspect)}</td><td>${esc(t.natal)}</td>
              <td>${esc(t.orbLabel)}</td><td>${esc(t.motion || "—")}</td>
              <td>${t.background ? "Background" : "Immediate"}</td></tr>`).join("")}</tbody>
          </table>
        </div>
        <p class="tech-sky__help">Positions come from the same shared sky as Current Positions. Orbit Axis does not publish exact-hit times or end dates for transits — those need timing it cannot calculate reliably.</p>
        <a class="o-btn o-btn--secondary o-btn--sm" href="#positions">View Current Positions</a>
      </details>
    </section>`;
}

function transitLimitationHtml(l) {
  return `<aside class="chart-limitation" role="note">
    <h2 class="chart-limitation__title">${esc(l.title)}</h2>
    <p>${esc(l.body)}</p>
  </aside>`;
}

function renderTransitsSwitcher() {
  const wrap = $("#transits-switcher");
  const select = $("#transits-chart-select");
  if (!wrap || !select) return;
  const charts = state.charts || [];
  wrap.hidden = charts.length < 2;
  if (charts.length < 2) { select.innerHTML = ""; return; }
  const active = activeChart();
  select.innerHTML = charts.map((c) =>
    `<option value="${esc(c.id)}"${c.id === active?.id ? " selected" : ""}>${esc(c.nickname || "Untitled chart")}</option>`
  ).join("");
}

/** Kept for the route to call; the workspace loads itself. */
function renderTransits() {
  renderTransitsSwitcher();
  loadTransits();
}

function wireTransits() {
  const panel = $("#panel-transits");
  if (!panel || panel._wiredTransits) return;
  panel._wiredTransits = true;

  const select = $("#transits-chart-select");
  select?.addEventListener("change", async (event) => {
    const id = event.target.value;
    const previousId = state.activeChartId;
    if (!id || id === previousId) return;
    select.disabled = true;
    // Clear before activating: the chart name updates as soon as the switch
    // lands, and the old reading must not be sitting under it.
    transitsClear();
    transitsRenderLoading("");
    try {
      await post(`/api/charts/${id}/activate`, {});
      await loadSavedCharts();
      renderTransitsSwitcher();
      await loadTransits();
      $("#transits-title")?.focus({ preventScroll: true });
      toast(`${activeChart()?.nickname || "Chart"} is active`);
    } catch {
      state.activeChartId = previousId;
      renderTransitsSwitcher();
      transitsRenderError("We couldn't switch charts just now. Your saved charts are safe.");
    } finally {
      select.disabled = false;
    }
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="retry-transits"]')) loadTransits();
  });
  $("#transits-refresh")?.addEventListener("click", () => loadTransits());
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
  if (id === "positions") {
    wirePositions();
    loadPositions();
    // Focus the heading only for a signed-in user. Moving focus into a
    // workspace that is sitting behind the sign-in gate would fight the gate's
    // own focus trap.
    if (authSignedIn()) $("#positions-title")?.focus({ preventScroll: true });
  }
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

/**
 * Record which saved chart the app is currently reading for.
 *
 * The daily reading, the Home "Reading for" line, and Technical Sky's transit
 * list all name the active chart, so the name is held in one place rather than
 * re-derived at each call site.
 */
function setActiveChartName(name) {
  state.activeChartName = name || "My Chart";
}

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
      // An open combobox inside the dialog owns Escape first: it means "close
      // this list", not "throw away everything I have typed". This listener is
      // registered in the capture phase, so without the check it wins the race
      // against the combobox's own handler and closes the whole form.
      if (el.querySelector("[role=listbox]:not([hidden])")) return;
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
  restoreFocusAfterClose(entry);
}

/**
 * Put focus somewhere real after a dialog closes.
 *
 * "Falls back to the body" is not a fallback — it is focus loss. A keyboard
 * user lands nowhere and has to Tab from the top of the document to get back to
 * what they were doing, and a screen reader announces nothing at all.
 *
 * The opener is preferred. When it is gone, hidden, or was never focused in the
 * first place (a programmatic open, or a click that did not move focus), the
 * heading of whatever is now on screen is the honest answer: it tells the
 * person where they are rather than dropping them into silence.
 */
function restoreFocusAfterClose(entry) {
  const opener = entry.restoreTo;
  const usable = opener
    && opener !== document.body
    && document.contains(opener)
    && opener.offsetParent !== null;
  if (usable) { opener.focus({ preventScroll: true }); return; }

  const heading = $(".workspace-panel:not([hidden]) h1") || $("#workspace-title");
  if (heading) {
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
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
  clearPositions();
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
      clearPositions();
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
  const modal = $("#chart-modal");
  const errorBox = $("#today-chart-error");
  const formOpen = modal && !modal.hidden;

  const view = decideStartupView({
    authResolved: !state.auth.restoring,
    signedIn: authSignedIn(),
    chartsStatus: state.chartsStatus,
    chartCount: state.charts.length,
    onboardingDismissed: state.onboardingDismissed,
  });

  // Recoverable failure: offer a retry. NEVER claim the user has no chart.
  if (view === STARTUP_VIEW.ERROR) {
    if (formOpen && chartForm.mode === "first") closeModal(modal);
    if (errorBox) errorBox.hidden = false;
    await axisLoadToday(); // Current Sky still renders; Home is never left blank.
    return;
  }
  if (errorBox) errorBox.hidden = true;

  // Genuinely zero saved charts on a successful request → first-run onboarding.
  // It opens the same form every other entry point opens, in "first" mode.
  if (view === STARTUP_VIEW.ONBOARDING) {
    if (!formOpen) openChartForm("first");
    renderSavedCharts();
    return;
  }

  // Returning user. The server already resolved (and persisted) the active
  // chart, so we just load their experience. No popup, ever — and a form the
  // user opened deliberately is left alone.
  if (formOpen && chartForm.mode === "first") closeModal(modal);
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

/* ── The chart form ──────────────────────────────────────────────────────
   One form, three modes. Dev Update 1.4 collapsed three separate forms into
   this: a first-run dialog with its own fields, this modal, and a third form
   injected into Home that could never succeed for the signed-out audience that
   saw it. Three forms meant three sets of ids for the same data, and three
   places for validation to drift apart.

   Only these three things vary by mode. Everything else — fields, validation,
   place search, dialog behaviour — is shared by construction. */
const CHART_MODES = {
  first: {
    title: "Create your birth chart",
    intro: "Orbit Axis uses your birth date, time, and place to calculate your chart. "
         + "Your information stays private and can be exported or deleted from your account.",
    save: "Create my chart",
    saving: "Calculating your chart…",
    done: "Your chart is ready.",
    defaultName: "My Chart",
    showRelationship: false,
    showNames: true,
  },
  add: {
    title: "Add a saved chart",
    intro: "Orbit Axis uses a birth date, time, and place to calculate this chart. "
         + "Saved charts are private to your account.",
    save: "Save chart",
    saving: "Saving chart…",
    done: "Chart added.",
    defaultName: "",
    showRelationship: true,
    showNames: true,
  },
  edit: {
    title: "Edit saved chart",
    intro: "Changing the date, time, or place recalculates this chart. "
         + "Placements may move as a result.",
    save: "Save changes",
    saving: "Saving changes…",
    done: "Chart updated.",
    defaultName: "",
    showRelationship: true,
    showNames: true,
  },
};

/** Live state of the open form. `mode` is what the copy and submit key off. */
const chartForm = { mode: "add", chartId: null, submitting: false, openedBy: null };

const NAME_MAX = 80;

/* ── Validation ──────────────────────────────────────────────────────────
   Shared by all three modes, and deliberately not delegated to the browser.
   `<input type="date">` will happily hand over a date in the year 3000, and on
   a browser without native date support it hands over free text. The server
   validates all of this again; this layer exists so the person finds out at the
   field rather than after a round trip. */

function isRealCalendarDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Round-tripping through Date catches the impossible days that range checks
  // miss — 31 February, 31 April, 29 February in a common year.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

function isFutureDate(value) {
  // Compared as calendar dates, not instants: a birth date is a date on a wall
  // calendar, and converting it to an instant would make "today" wrong for
  // roughly half the world.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return String(value) > todayKey;
}

function fieldError(id, message) {
  const el = $(`#cm-${id}-error`);
  const input = $(`#cm-${id}`);
  if (el) { el.textContent = message || ""; el.hidden = !message; }
  if (input) {
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}

function clearChartFormErrors() {
  for (const id of ["nickname", "date", "time", "place"]) fieldError(id, "");
  const summary = $("#chart-modal-error");
  if (summary) { summary.textContent = ""; summary.hidden = true; }
}

function chartAccuracy() {
  return $('input[name="cm-accuracy"]:checked')?.value || "unknown";
}

/**
 * Validate every field and return the first offending input so focus can go to
 * it. Reporting all of them at once and focusing the first is the behaviour
 * that survives a keyboard-only pass.
 */
function validateChartForm() {
  clearChartFormErrors();
  let firstBad = null;
  const fail = (id, message) => {
    fieldError(id, message);
    if (!firstBad) firstBad = $(`#cm-${id}`);
  };

  const name = $("#cm-nickname").value.trim();
  if (!name) fail("nickname", "Give this chart a name.");
  else if (name.length > NAME_MAX) fail("nickname", `Keep the name under ${NAME_MAX} characters.`);

  const date = $("#cm-date").value;
  if (!date) fail("date", "Enter a birth date.");
  else if (!isRealCalendarDate(date)) fail("date", "That date doesn't exist. Check the day and month.");
  else if (isFutureDate(date)) fail("date", "A birth date can't be in the future.");

  const accuracy = chartAccuracy();
  const time = $("#cm-time").value;
  if (accuracy !== "unknown" && !time) {
    fail("time", "Enter a birth time, or choose Unknown above.");
  }

  try {
    requireSelectedPlace("cm", { allowExisting: chartForm.mode === "edit" });
  } catch (error) {
    fail("place", error.message);
  }

  return firstBad;
}

function chartFormPayload() {
  const accuracy = chartAccuracy();
  const placePayload = requireSelectedPlace("cm", { allowExisting: chartForm.mode === "edit" });
  return {
    nickname: $("#cm-nickname").value.trim(),
    first_name: $("#cm-first").value.trim() || null,
    last_name: $("#cm-last").value.trim() || null,
    relationship_type: chartForm.mode === "first" ? "self" : ($("#cm-relationship").value || "other"),
    birth_date: $("#cm-date").value,
    // The server nulls this too when the time is unknown. Doing it here as well
    // means the request body never carries a time the user disclaimed.
    birth_time: accuracy === "unknown" ? null : ($("#cm-time").value || null),
    time_accuracy: accuracy,
    ...placePayload,
  };
}

/** Show or hide the time field and its consequences to match the certainty. */
function syncTimeCertainty() {
  const unknown = chartAccuracy() === "unknown";
  const field = $("#cm-time-field");
  const notice = $("#cm-unknown-notice");
  if (field) field.hidden = unknown;
  if (notice) notice.hidden = !unknown;
  if (unknown) fieldError("time", "");
}

/**
 * @param {"first"|"add"|"edit"} mode
 * @param {object|null} chart  the chart being edited, for edit mode
 */
function openChartForm(mode, chart = null) {
  const modal = $("#chart-modal");
  if (!modal) return;
  const config = CHART_MODES[mode] || CHART_MODES.add;
  chartForm.mode = mode;
  chartForm.chartId = chart?.id || null;
  chartForm.openedBy = document.activeElement;

  $("#chart-modal-form").reset();
  clearChartFormErrors();
  $("#cm-id").value = chart?.id || "";
  $("#chart-modal-title").textContent = config.title;
  $("#chart-modal-intro").textContent = config.intro;
  $("#chart-modal-save").textContent = config.save;
  $("#chart-modal-hint").textContent = "";

  // Relationship is meaningless for your own first chart, and asking for it
  // there implies the chart might be someone else's.
  $("#cm-relationship-field").hidden = !config.showRelationship;

  if (chart) {
    $("#cm-nickname").value = chart.nickname || "";
    $("#cm-first").value = chart.first_name || "";
    $("#cm-last").value = chart.last_name || "";
    $("#cm-relationship").value = chart.relationship_type || "other";
    $("#cm-date").value = chart.birth_date || "";
    $("#cm-time").value = chart.birth_time ? String(chart.birth_time).slice(0, 5) : "";
    const accuracy = chart.time_accuracy || "unknown";
    const radio = $(`input[name="cm-accuracy"][value="${accuracy}"]`)
      // "reported" is a stored value with no radio of its own; it is a known
      // time, so it presents as Exact rather than silently becoming Unknown.
      || $('input[name="cm-accuracy"][value="exact"]');
    if (radio) radio.checked = true;
    const place = chartPlace(chart);
    if (place) setPlaceSelection("cm", place, { existing: true });
    else clearPlaceSelection("cm");
  } else {
    $("#cm-nickname").value = config.defaultName;
    $("#cm-relationship").value = mode === "first" ? "self" : "other";
    clearPlaceSelection("cm");
  }

  syncTimeCertainty();
  setupPlaceSearch("cm");
  openModal(modal, {
    initialFocus: $("#cm-nickname"),
    // First-run onboarding is dismissible: someone who is not ready to hand
    // over birth details should be able to look around first.
    onClose: () => { if (chartForm.mode === "first") state.onboardingDismissed = true; },
  });
}

/** Kept as the old name so existing call sites read unchanged. */
function openChartModal(chart = null) {
  if (chart) return openChartForm("edit", chart);
  const first = authSignedIn() && state.charts.length === 0;
  return openChartForm(first ? "first" : "add");
}

function wireChartModal() {
  const modal = $("#chart-modal");
  if (!modal) return;
  $("#chart-modal-close")?.addEventListener("click", () => closeModal(modal));
  $("#chart-modal-cancel")?.addEventListener("click", () => closeModal(modal));

  for (const radio of $$('input[name="cm-accuracy"]')) {
    radio.addEventListener("change", syncTimeCertainty);
  }
  // Re-validate a field once the user has had a go at fixing it, so the error
  // clears when it stops being true rather than at the next submit.
  for (const id of ["nickname", "date", "time"]) {
    $(`#cm-${id}`)?.addEventListener("input", () => fieldError(id, ""));
  }

  $("#chart-modal-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (chartForm.submitting) return;             // double-submit guard

    const firstBad = validateChartForm();
    if (firstBad) {
      firstBad.focus({ preventScroll: false });
      const summary = $("#chart-modal-error");
      if (summary) { summary.textContent = "Check the highlighted fields."; summary.hidden = false; }
      return;
    }

    const config = CHART_MODES[chartForm.mode];
    const hint = $("#chart-modal-hint");
    const save = $("#chart-modal-save");
    const summary = $("#chart-modal-error");
    chartForm.submitting = true;
    save.disabled = true;
    save.setAttribute("aria-busy", "true");
    hint.textContent = config.saving;
    if (summary) summary.hidden = true;

    try {
      const payload = chartFormPayload();
      const id = chartForm.chartId;
      const saved = id
        ? await patch(`/api/charts/${id}`, payload)
        : await post("/api/charts", payload);
      hint.textContent = config.done;
      closeModal(modal);
      await afterChartSaved(chartForm.mode, saved?.chart || null);
    } catch (error) {
      hint.textContent = "";
      if (summary) { summary.textContent = error.message; summary.hidden = false; }
      // The message is already announced by role="alert"; moving focus to it
      // would strand a keyboard user away from the field they need to fix.
    } finally {
      chartForm.submitting = false;
      save.disabled = false;
      save.removeAttribute("aria-busy");
    }
  });
}

/**
 * What happens once a chart is saved.
 *
 * The first chart earns a destination. Everything the person just typed exists
 * to produce a chart, and closing a dialog onto whatever screen they happened
 * to be on does not show them that it worked. My Chart is the direct answer —
 * it is where the Big Three lives, and it is the surface that says "this is
 * yours". Home leads with the daily reading, which is a different question than
 * "did my chart calculate?".
 */
async function afterChartSaved(mode, chart) {
  await loadSavedCharts();
  await resolveChartState();

  if (mode === "first") {
    navigate("me");
    await refreshActiveExperience();
    toast("Your chart is ready.");
    // Focus the heading rather than a control: the person is arriving somewhere
    // new and should hear where they are before what they can do.
    $("#mychart-title")?.focus?.();
    return;
  }

  await refreshActiveExperience();
  refreshSecondaryRoute();
  toast(CHART_MODES[mode]?.done || "Saved.");
  // Focus returns to whatever opened the form, when it is still on screen.
  const opener = chartForm.openedBy;
  if (opener && document.contains(opener) && opener.offsetParent !== null) {
    opener.focus({ preventScroll: true });
  }
}

// Home-level chart actions: add (+), manage, and retry after a load failure.
function wireHomeChartActions() {
  $("#today-chart-add")?.addEventListener("click", () => openChartModal(null));
  $("#today-chart-manage")?.addEventListener("click", () => navigate("me"));
  $("#today-chart-retry")?.addEventListener("click", () => retryLoadSavedCharts());
}

function wireSavedCharts() {
  const routeChartClick = async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "retry-charts") {
      await retryLoadSavedCharts();
      return;
    }
    if (button.dataset.action === "retry-sky") {
      // Retries only the sky. The personal reading is a separate request and
      // must not be torn down because the sky failed.
      const tz = axisResolveTimezone();
      $("#today-sky").innerHTML = `<div class="axis-shimmer" style="height:180px"></div>`;
      try {
        const r = await get(`/api/sky/current?tz=${encodeURIComponent(tz)}`);
        AXIS.lastSky = r.sky;
        AXIS.lastHighlights = r.highlights || [];
        AXIS.lastMoon = r.moon || null;
        axisRenderSky(r.sky, { highlights: r.highlights, moon: r.moon });
      } catch {
        axisRenderSkyError("We still couldn't reach the current sky. Your reading above is unaffected.");
      }
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
  renderChartSwitcher();
  if (!statusTargets.length || !listTargets.length) return;
  const setStatus = (text) => statusTargets.forEach((status) => { status.textContent = text; });
  const setLists = (html) => listTargets.forEach((list) => { list.innerHTML = html; });
  if (!authSignedIn()) {
    setStatus("Sign in to save and restore charts.");
    setLists("");
    renderChartPlaceholder("empty", { message: "Sign in to see your chart." });
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
    renderChartPlaceholder("error", { message: "We couldn't load your saved charts. Check your connection and try again.", retry: false });
    return;
  }
  if (!state.charts.length) {
    setStatus("No saved charts yet. Create your chart to begin.");
    setLists(`<div class="me-empty me-empty--compact"><p>No saved charts yet.</p><button type="button" class="o-btn o-btn--primary" data-action="add-chart">Create your chart</button></div>`);
    renderChartPlaceholder("empty");
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
  renderChartSwitcher();
  if (active) {
    setActiveChartName(active.nickname);
    axisShowReadingFor(active.nickname);
    // loadChartReading owns its own loading, stale, and failure states — the
    // previous `catch {}` here hid render defects behind Home's error copy.
    await loadChartReading(active);
  } else {
    renderChartPlaceholder("empty", { message: "No active chart yet." });
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
  wireSavedCharts();
  wireChartModal();
  wireChartReading();
  wirePositions();
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
// Keyed by the composer's stable `key`, never by display text.
const PLACEMENT_GLYPHS = {
  ascendant: "ASC", midheaven: "MC", Sun: "☉", Moon: "☾", Mercury: "☿",
  Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
};
const ELEMENT_CLASS = { Fire: "fire", Earth: "earth", Air: "air", Water: "water" };
const STANDARD_PLANET_ORDER = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const TIME_ACCURACY_COPY = {
  exact: { label: "Exact birth time", note: "Rising sign, houses, and angles can be read with confidence." },
  reported: { label: "Reported birth time", note: "Rising sign, houses, and angles use the saved reported time." },
  approximate: { label: "Approximate birth time", note: "Your Rising sign and houses may shift because the birth time is approximate." },
  unknown: { label: "Unknown birth time", note: "A birth time is needed to calculate your Rising sign and houses reliably." },
};

// Every word of interpretation on this page comes from the server-composed
// `reading` (lib/interpretation/). NOTHING below authors meaning. When you are
// tempted to add "a short explanatory sentence" here, add it to the content
// modules instead — otherwise there are two corpora and only one of them has
// tests.

function degLabel(p) {
  if (!p || p.unavailable) return "";
  return `${p.degrees}° ${String(p.minutes).padStart(2, "0")}′`;
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

function glyphFor(key) {
  return PLACEMENT_GLYPHS[key] || "";
}

/**
 * A glyph plus its name, where the glyph is decoration and the name is the
 * accessible label. Screen readers announce "Sun", never "black circle with
 * dot", and the reading stays understandable with images and symbols off.
 */
function glyphHtml(key) {
  const glyph = glyphFor(key);
  if (!glyph) return "";
  return `<span class="reading-card__glyph" aria-hidden="true">${esc(glyph)}</span>`;
}

// ── Reading state ───────────────────────────────────────────────────────────
// One place decides what My Chart is showing. `token` guards against a slow
// response for a chart the user has already switched away from: every request
// takes the next token and only the newest may paint.
const reading = {
  token: 0,
  state: "idle",   // idle | loading | ready | empty | error
  chartId: null,
};

const READING_SECTIONS = ["#section-bigthree", "#section-patterns", "#section-planets",
                          "#section-aspects", "#section-houses", "#section-data"];

function setReadingState(next) {
  reading.state = next;
  const root = $("#me-reading");
  if (root) root.dataset.state = next;
  // Sections are hidden rather than emptied while loading, so the page keeps
  // its shape and does not collapse and rebuild under the reader.
  const showSections = next === "ready";
  READING_SECTIONS.forEach((sel) => {
    const el = $(sel);
    if (el) el.hidden = !showSections;
  });
}

/**
 * Clear every rendered interpretation.
 *
 * Called before any chart load. This is the stale-content guard: after this
 * runs there is no sentence left on the page that belongs to the previous
 * chart, so a slow or failed load cannot leave one person's Rising sign
 * sitting under another person's name.
 */
function clearChartReading() {
  state.activeNatalChart = null;
  state.activeProfile = null;
  state.activeReading = null;
  ["#bigthree", "#chart-patterns", "#key-placements", "#chart-aspects",
   "#chart-houses", "#chart-placements", "#chart-limitation"].forEach((sel) => {
    const el = $(sel);
    if (el) el.innerHTML = "";
  });
}

// ── 1. Chart identity and calculation context ───────────────────────────────

function renderChartHeader(profile, chart, name, context) {
  const target = $("#me-overview");
  if (!target) return;
  const timeInfo = timeAccuracyInfo(profile?.time_accuracy || chart?.time_accuracy);
  const contextRows = (context || []).map((row) => `
    <div>
      <dt>${esc(row.label)}</dt>
      <dd>${esc(row.value)}${row.help ? `<span class="me-facts__help">${esc(row.help)}</span>` : ""}</dd>
    </div>`).join("");
  target.innerHTML = `
    <div class="me-overview__top">
      <div>
        <p class="u-eyebrow">Active Chart</p>
        <h2>${esc(name || profile?.nickname || "My Chart")}</h2>
      </div>
    </div>
    <dl class="me-facts">
      <div><dt>Birth date</dt><dd>${esc(formatBirthDate(profile?.birth_date))}</dd></div>
      <div><dt>Birthplace</dt><dd>${esc(profile?.birthplace_name || "Location not set")}</dd></div>
      <div><dt>Birth time</dt><dd>${esc(formatBirthTime(profile))}</dd></div>
      <div><dt>Time certainty</dt><dd>${esc(timeInfo.label)}</dd></div>
      ${contextRows}
    </dl>`;
}

// ── 7. Birth-time limitations (one page-level notice) ───────────────────────

function renderLimitation(limitation) {
  const target = $("#chart-limitation");
  if (!target) return;
  if (!limitation) { target.innerHTML = ""; return; }
  const details = (limitation.details || []).map((d) => `<li>${esc(d)}</li>`).join("");
  target.innerHTML = `
    <aside class="chart-limitation" role="note" aria-labelledby="chart-limitation-title">
      <h2 class="chart-limitation__title" id="chart-limitation-title">${esc(limitation.title)}</h2>
      <p>${esc(limitation.body)}</p>
      ${details ? `<ul class="chart-limitation__list">${details}</ul>` : ""}
      ${limitation.action ? `<p class="chart-limitation__action">${esc(limitation.action)}</p>` : ""}
    </aside>`;
}

// ── Shared card ─────────────────────────────────────────────────────────────

/**
 * One placement, with its reading behind a native disclosure.
 *
 * The summary line and the expanded body never repeat each other: the summary
 * is the one-sentence composition, the body is the layered detail. <details>
 * is used deliberately over a custom widget — it is keyboard operable and
 * announces its own expanded state without any ARIA of ours to get wrong.
 */
function readingCardHtml(placement, { role = null } = {}) {
  if (!placement) return "";
  if (placement.unavailable) {
    return `<article class="reading-card reading-card--unavailable">
      <div class="reading-card__head">
        ${glyphHtml(placement.key)}
        <div class="reading-card__ident">
          <h3 class="reading-card__title">${esc(placement.planet)} unavailable</h3>
          <p class="reading-card__meta">Birth time needed</p>
        </div>
      </div>
      <p class="reading-card__summary">${esc(placement.reason || "")}</p>
    </article>`;
  }
  const meta = [placement.position, placement.house ? `House ${placement.house}` : "",
                placement.retrograde ? "Retrograde" : ""].filter(Boolean).join(" · ");
  const body = (placement.detail || []).map((p) => `<p>${esc(p)}</p>`).join("");
  const extras = [
    placement.strength ? `<div class="reading-card__aside"><h4>Where this tends to work well</h4><p>${esc(placement.strength)}</p></div>` : "",
    placement.growth ? `<div class="reading-card__aside"><h4>A growing edge</h4><p>${esc(placement.growth)}</p></div>` : "",
    placement.retrogradeNote ? `<p class="reading-card__note">${esc(placement.retrogradeNote)}</p>` : "",
  ].join("");
  return `<article class="reading-card">
    <div class="reading-card__head">
      ${glyphHtml(placement.key)}
      <div class="reading-card__ident">
        <h3 class="reading-card__title">${esc(placement.planet)}${placement.sign ? ` in ${esc(placement.sign)}` : ""}</h3>
        <p class="reading-card__meta">${esc(meta)}</p>
        ${role ? `<p class="reading-card__role">${esc(role)}</p>` : ""}
      </div>
    </div>
    <p class="reading-card__summary">${esc(placement.summary)}</p>
    ${body || extras ? `<details class="reading-card__more">
      <summary><span>Read more about ${esc(placement.planet)}</span></summary>
      <div class="reading-card__body">${body}${extras}</div>
    </details>` : ""}
  </article>`;
}

// ── 2. Big Three ────────────────────────────────────────────────────────────

function renderBigThree(bigThree) {
  const target = $("#bigthree");
  if (!target) return;
  target.innerHTML = (bigThree || []).map((p) => readingCardHtml(p, { role: p.role })).join("");
}

// ── 3. Chart patterns ───────────────────────────────────────────────────────

function balanceBarsHtml(percentages, classMap) {
  return Object.entries(percentages || {}).map(([key, pct]) => `
    <div class="bar-row">
      <span class="bar-key">${esc(key)}</span>
      <span class="bar-track"><span class="bar-fill ${classMap ? (classMap[key] || "") : ""}" style="width:${Number(pct) || 0}%"></span></span>
      <span class="bar-pct">${esc(String(pct))}%</span>
    </div>`).join("");
}

function patternBlockHtml(pattern, { title, classMap, countsLabel }) {
  if (!pattern) return "";
  const extra = [
    pattern.detail ? `<p>${esc(pattern.detail)}</p>` : "",
    pattern.lighter?.detail ? `<p>${esc(pattern.lighter.detail)}</p>` : "",
    pattern.growth ? `<p>${esc(pattern.growth)}</p>` : "",
  ].filter(Boolean).join("");
  return `<div class="pattern-block">
    <h3>${esc(title)}</h3>
    <p class="pattern-block__summary">${esc(pattern.summary)}</p>
    <div class="bars">${balanceBarsHtml(pattern.percentages, classMap)}</div>
    ${extra ? `<details class="reading-card__more">
      <summary><span>What ${esc(title.toLowerCase())} means here</span></summary>
      <div class="reading-card__body">${extra}</div>
    </details>` : ""}
    <details class="reading-card__more">
      <summary><span>${esc(countsLabel)}</span></summary>
      <div class="reading-card__body"><p class="pattern-block__counts">${
        Object.entries(pattern.counts || {}).map(([k, v]) => `${esc(k)}: ${esc(String(v))}`).join(" · ")
      }</p></div>
    </details>
  </div>`;
}

function renderPatterns(patterns) {
  const target = $("#chart-patterns");
  if (!target) return;
  if (!patterns || (!patterns.element && !patterns.modality)) {
    target.innerHTML = `<p class="me-muted">Pattern information is not available for this chart.</p>`;
    return;
  }
  target.innerHTML = `<div class="pattern-row">
    ${patternBlockHtml(patterns.element, { title: "Element balance", classMap: ELEMENT_CLASS, countsLabel: "Counted placements" })}
    ${patternBlockHtml(patterns.modality, { title: "Modality balance", classMap: null, countsLabel: "Counted placements" })}
  </div>
  <p class="pattern-note">Counts weigh the ten planets in this chart, with the Sun and Moon carrying extra weight.</p>`;
}

// ── 4. Planet placements ────────────────────────────────────────────────────

function renderPlacements(placements) {
  const target = $("#key-placements");
  if (!target) return;
  if (!placements?.length) {
    target.innerHTML = `<p class="me-muted">No planet placements are available for this chart.</p>`;
    return;
  }
  target.innerHTML = placements.map((p) => readingCardHtml(p)).join("");
}

// ── 5. Major aspects ────────────────────────────────────────────────────────

function aspectCardHtml(aspect) {
  return `<article class="aspect-card">
    <div class="aspect-card__head">
      <h3 class="aspect-card__title">${esc(aspect.a)} ${esc(aspect.aspect.toLowerCase())} ${esc(aspect.b)}</h3>
      ${aspect.orbLabel ? `<span class="aspect-card__orb">${esc(aspect.orbLabel)}</span>` : ""}
    </div>
    <p class="aspect-card__summary">${esc(aspect.headline)}</p>
    <details class="reading-card__more">
      <summary><span>What this pairing can look like</span></summary>
      <div class="reading-card__body">
        <p>${esc(aspect.detail)}</p>
        <div class="reading-card__aside"><h4>Constructive potential</h4><p>${esc(aspect.constructive)}</p></div>
        <div class="reading-card__aside"><h4>Possible tension</h4><p>${esc(aspect.tension)}</p></div>
      </div>
    </details>
  </article>`;
}

function renderAspects(aspects) {
  const target = $("#chart-aspects");
  if (!target) return;
  const highlights = aspects?.highlights || [];
  const all = aspects?.all || [];
  if (!all.length) {
    target.innerHTML = `<p class="me-muted">This chart has no major aspects within the orbs Orbit Axis uses.</p>`;
    return;
  }
  const rest = all.slice(highlights.length);
  target.innerHTML = `
    <div class="aspect-list">${highlights.map(aspectCardHtml).join("")}</div>
    ${rest.length ? `<details class="chart-details">
      <summary>All ${all.length} major aspects</summary>
      <ul class="aspect-plain">${rest.map((a) => `<li><span>${esc(a.a)} ${esc(a.aspect.toLowerCase())} ${esc(a.b)}</span>${a.orbLabel ? `<span class="orb">${esc(a.orbLabel)}</span>` : ""}</li>`).join("")}</ul>
    </details>` : ""}`;
}

// ── 6. Houses and angles ────────────────────────────────────────────────────

function renderHouses(chart, bigThree, midheaven) {
  const target = $("#chart-houses");
  if (!target) return;
  // Houses and angles exist only with a usable birth time. When they do not,
  // this section says so once — it does not render an empty table.
  if (!chart?.time_known || !chart?.houses?.length) {
    target.innerHTML = `<p class="me-muted">House placements, the Rising sign, and the Midheaven all need a reliable birth time. Everything else on this page is calculated normally without one.</p>`;
    return;
  }
  const rising = (bigThree || []).find((p) => p.key === "ascendant" && !p.unavailable);
  const angleCards = [
    rising ? readingCardHtml(rising) : "",
    midheaven ? readingCardHtml(midheaven) : "",
  ].filter(Boolean).join("");
  const rows = chart.houses.map((h) => `<tr>
    <td>House ${esc(String(h.house))}</td>
    <td>${esc(h.sign)}</td>
    <td>${esc(String(h.degrees))}°${esc(String(h.minutes).padStart(2, "0"))}′</td>
    <td>${esc(planetsInHouse(chart, h.house) || "—")}</td>
  </tr>`).join("");
  target.innerHTML = `
    <div class="reading-grid reading-grid--keys">${angleCards}</div>
    <details class="chart-details">
      <summary>All twelve house cusps</summary>
      <div class="table-scroll">
        <table class="placements">
          <thead><tr><th>House</th><th>Sign on cusp</th><th>Cusp degree</th><th>Planets</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>`;
}

function planetsInHouse(chart, houseNumber) {
  return Object.entries(chart?.planet_houses || {})
    .filter(([, h]) => h === houseNumber)
    .map(([name]) => name)
    .join(", ");
}

// ── 8. Chart data and source information ────────────────────────────────────

function renderChartData(chart, readingPayload) {
  const target = $("#chart-placements");
  if (!target) return;
  const rows = STANDARD_PLANET_ORDER.map((name) => chart.planets?.[name]).filter(Boolean).map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${esc(p.sign)}</td><td>${esc(degLabel(p))}</td><td>${p.retrograde ? "Retrograde" : "Direct"}</td><td>${chart.planet_houses?.[p.name] ? "House " + esc(String(chart.planet_houses[p.name])) : "—"}</td></tr>`
  ).join("");
  const retro = readingPayload?.retrogrades?.length ? readingPayload.retrogrades.join(", ") : "None";
  target.innerHTML = `
    <details class="chart-details" open>
      <summary>Calculated positions</summary>
      <div class="table-scroll">
        <table class="placements">
          <thead><tr><th>Body</th><th>Sign</th><th>Degree</th><th>Motion</th><th>House</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
    <dl class="me-facts me-facts--compact">
      <div><dt>Chart ruler</dt><dd>${esc(chart.chart_ruler || "—")}</dd></div>
      <div><dt>Retrograde at birth</dt><dd>${esc(retro)}</dd></div>
      <div><dt>Calculation</dt><dd>${esc(chart.calculation_version || "—")}</dd></div>
      <div><dt>Interpretation content</dt><dd>${esc(readingPayload?.contentVersion || "—")}</dd></div>
    </dl>
    <p class="me-muted">Orbit Axis writes these readings from your calculated chart using text written and reviewed in advance. Nothing on this page is generated by an AI model, and your birth details are never sent to one.</p>`;
}

// ── Composition ─────────────────────────────────────────────────────────────

/**
 * Render a complete chart reading.
 *
 * Throws rather than half-painting: a composition defect must surface as an
 * error state the reader can retry, not as a page that silently omits a
 * section. The caller catches and distinguishes it from a network failure.
 */
function renderChart(chart, name, profile = null, readingPayload = null) {
  if (!chart) throw new Error("renderChart called without a chart");
  if (!readingPayload) throw new Error("renderChart called without a composed reading");
  state.activeNatalChart = chart;
  state.activeProfile = profile;
  state.activeReading = readingPayload;

  renderChartHeader(profile, chart, name, readingPayload.context);
  renderLimitation(readingPayload.limitation);
  renderBigThree(readingPayload.bigThree);
  renderPatterns(readingPayload.patterns);
  renderPlacements(readingPayload.remainingPlacements);
  renderAspects(readingPayload.aspects);
  renderHouses(chart, readingPayload.bigThree, readingPayload.midheaven);
  renderChartData(chart, readingPayload);

  const edit = $("#me-edit-chart");
  if (edit) {
    edit.hidden = !profile?.id;
    if (profile?.id) edit.dataset.id = profile.id;
  }
  setReadingState("ready");
}

/** The signed-out / no-chart / failed states all route through here. */
function renderChartPlaceholder(kind, { message = "", retry = false } = {}) {
  clearChartReading();
  setReadingState(kind);
  const target = $("#me-overview");
  const status = $("#me-status");
  const nameEl = $("#mychart-name");
  const edit = $("#me-edit-chart");
  if (edit) edit.hidden = true;
  if (nameEl) nameEl.textContent = kind === "loading" ? "Loading your chart…" : "No active chart yet";
  $("#me-active-badge")?.setAttribute("hidden", "");
  if (status) status.textContent = message || "";
  if (!target) return;
  if (kind === "loading") {
    target.innerHTML = `<div class="me-loading"><p>Loading your chart…</p></div>`;
    return;
  }
  if (kind === "error") {
    target.innerHTML = `<div class="me-empty">
      <h2>We couldn't load this chart</h2>
      <p>${esc(message || "Something went wrong while preparing your reading.")}</p>
      ${retry ? `<button type="button" class="o-btn o-btn--primary" data-action="retry-reading">Try again</button>` : ""}
    </div>`;
    return;
  }
  target.innerHTML = `<div class="me-empty">
    <h2>No active chart yet</h2>
    <p>Create your chart and Orbit Axis will explain every placement in it.</p>
    <button type="button" class="o-btn o-btn--primary" data-action="add-chart">Create your chart</button>
  </div>`;
}

/**
 * Load and render the active chart.
 *
 * Failures are separated on purpose. A fetch that fails is a chart-loading
 * problem the reader can retry; a render that throws is our defect, and
 * reporting it as "check your connection" would hide it for ever. Neither is
 * swallowed.
 */
async function loadChartReading(chartProfile) {
  if (!chartProfile) { renderChartPlaceholder("empty"); return; }
  const token = ++reading.token;
  reading.chartId = chartProfile.id;

  clearChartReading();
  renderChartPlaceholder("loading", { message: `Loading ${chartProfile.nickname || "your chart"}…` });
  const nameEl = $("#mychart-name");
  if (nameEl) nameEl.textContent = chartProfile.nickname || "My Chart";

  let data;
  try {
    data = await get(`/api/charts/${chartProfile.id}`);
  } catch (error) {
    if (token !== reading.token) return;   // superseded — say nothing
    renderChartPlaceholder("error", {
      message: "We couldn't reach your chart just now. Your saved charts are safe.",
      retry: true,
    });
    return;
  }
  if (token !== reading.token) return;     // a newer chart is already loading

  try {
    renderChart(data.chart, data.profile?.nickname || chartProfile.nickname, data.profile, data.reading);
    const status = $("#me-status");
    if (status) status.textContent = `${data.profile?.nickname || chartProfile.nickname || "Your chart"} is ready.`;
    $("#me-active-badge")?.removeAttribute("hidden");
  } catch (error) {
    // A composition or rendering defect. Structured, and carrying no birth data.
    console.error("[orbit] chart reading failed to render", {
      chartId: chartProfile.id, stage: "render", message: error?.message,
    });
    renderChartPlaceholder("error", {
      message: "We couldn't prepare the reading for this chart. This one is on us — please try again.",
      retry: true,
    });
  }
}

// ── Chart switcher ──────────────────────────────────────────────────────────

function renderChartSwitcher() {
  const wrap = $("#chart-switcher");
  const select = $("#chart-switcher-select");
  if (!wrap || !select) return;
  const charts = state.charts || [];
  // A switcher with one option is a control that cannot do anything.
  wrap.hidden = charts.length < 2;
  if (charts.length < 2) { select.innerHTML = ""; return; }
  const active = activeChart();
  select.innerHTML = charts.map((c) =>
    `<option value="${esc(c.id)}"${c.id === active?.id ? " selected" : ""}>${esc(c.nickname || "Untitled chart")}</option>`
  ).join("");
}

function wireChartReading() {
  const panel = $("#panel-me");
  if (!panel || panel._readingWired) return;
  panel._readingWired = true;

  const select = $("#chart-switcher-select");
  select?.addEventListener("change", async (event) => {
    const id = event.target.value;
    const previousId = state.activeChartId;
    if (!id || id === previousId) return;
    select.disabled = true;
    // Clear immediately. Activation is a round trip, and until the new reading
    // arrives the page must not keep showing the previous person's chart under
    // a name the switcher has already changed.
    clearChartReading();
    renderChartPlaceholder("loading", { message: "Switching charts…" });
    try {
      await post(`/api/charts/${id}/activate`, {});
      // loadSavedCharts refreshes state.charts; refreshActiveExperience then
      // re-reads the active chart. refreshData() only refreshes the sky, and
      // calling it here left the previous chart's reading on screen.
      await loadSavedCharts();
      await refreshActiveExperience();
      // Move focus to the page heading so a keyboard or screen-reader user is
      // not left at a stale position in a page that changed underneath them.
      $("#mychart-title")?.focus({ preventScroll: true });
      toast(`${activeChart()?.nickname || "Chart"} is active`);
    } catch (error) {
      state.activeChartId = previousId;
      renderChartSwitcher();
      renderChartPlaceholder("error", {
        message: "We couldn't switch charts just now. Your saved charts are safe.",
        retry: true,
      });
      toast("We couldn't switch charts just now.");
    } finally {
      select.disabled = false;
    }
  });

  panel.addEventListener("click", (event) => {
    const retry = event.target.closest('[data-action="retry-reading"]');
    if (retry) { loadChartReading(activeChart()); return; }
    const edit = event.target.closest("#me-edit-chart");
    if (edit?.dataset.id) openChartForm("edit", edit.dataset.id);
  });
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
  lastHighlights: [],
  lastMoon: null,
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
    if (AXIS.lastSky) axisRenderSky(AXIS.lastSky, { highlights: AXIS.lastHighlights, moon: AXIS.lastMoon });
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

/**
 * Clear only the chart-dependent half of Home.
 *
 * Sky-only sections stay exactly where they are. Blanking them on a chart
 * switch would make the whole page flash for a change that does not affect
 * them, and the Moon does not care whose chart is active.
 */
function axisClearPersonalReading() {
  AXIS.lastFortune = null;
  const el = $("#today-fortune");
  if (el) {
    el.innerHTML = `<div class="axis-shimmer" style="height:240px" role="status" aria-live="polite" aria-label="Loading your reading"></div>`;
  }
  const secondary = $("#today-secondary");
  if (secondary) secondary.hidden = true;
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
    // The chart NAME updates as soon as the new chart is active, but the
    // fortune is a second round trip. Without this the old reading sits under
    // the new name for as long as that takes — the same stale-content defect
    // My Chart had. Only the personal reading is cleared: the Moon and the sky
    // highlights describe the sky, not the chart, and must not flicker.
    axisClearPersonalReading();
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
  // The sky and the personal reading fail independently. A sky failure used to
  // be swallowed by `.catch(() => {})`, which left the shimmer placeholder in
  // place for ever — an indefinite spinner that looked like a slow network and
  // was actually a dead section.
  get(`/api/sky/current?tz=${encodeURIComponent(tz)}`)
    .then(r => {
      AXIS.lastSky = r.sky;
      AXIS.lastHighlights = r.highlights || [];
      AXIS.lastMoon = r.moon || null;
      try {
        axisRenderSky(r.sky, { highlights: r.highlights, moon: r.moon });
      } catch (error) {
        // A render defect is ours, and must not be reported as a network problem.
        console.error("[orbit] current sky failed to render", { stage: "render", message: error?.message });
        axisRenderSkyError("We couldn't show the current sky just now.");
      }
    })
    .catch(() => axisRenderSkyError("We couldn't reach the current sky just now."));

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

/**
 * The sky section's own failure state.
 *
 * Separate from the fortune's, because they are separate requests: one can
 * fail while the other succeeds, and the whole page must not go down for
 * either. Carries a retry and no private data.
 */
function axisRenderSkyError(message) {
  const el = $("#today-sky");
  if (!el) return;
  el.innerHTML = `<div class="axis-section-error" role="status">
    <p>${esc(message)}</p>
    <button type="button" class="o-btn o-btn--secondary o-btn--sm" data-action="retry-sky">Try again</button>
  </div>`;
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
/**
 * The reading's title.
 *
 * Deliberately NOT derived from the mood text. The old version cut the mood at
 * its first comma, which works when the comma separates clauses and fails when
 * it separates coordinate adjectives: "A reflective, share-what-you've-learned
 * kind of day" became the headline "A reflective". Tightening the heuristic
 * only moved the failure — "A steady, grounded day" breaks the same way — and
 * the whole approach was trying to do grammar with string splitting.
 *
 * It was also a truncated copy of the Overall card immediately beneath it. So
 * the title names the reading, and the mood is printed once, in full, in the
 * card written for it. The engine supplies no headline field, and writing one
 * here would be the only place in Orbit where reading text is not traceable to
 * engine evidence.
 */
function axisFortuneTitle() {
  return "Your reading for today";
}

// ── Current Sky: one unified panel (Moon + Sun + season + local time) ──────
function axisRenderSky(sky, extras = {}) {
  if (!sky || !$("#today-sky")) return;

  // The visible day is the fortune's local-day key, never a UTC date.
  const localDateLabel = formatLocalDateKey(sky.local_date || "");
  if (localDateLabel) {
    $("#today-date").textContent = localDateLabel;
    $("#topnav-date").textContent = new Date(`${sky.local_date}T12:00:00.000Z`)
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }
  const tzLabel = sky.timezone_name ? `Based on ${sky.timezone_name} local time` : "";
  const tzEl = $("#today-timezone");
  if (tzEl) { tzEl.textContent = tzLabel; tzEl.hidden = !tzLabel; }

  axisRenderMoon(extras.moon || null, sky);
  axisRenderHighlights(extras.highlights || []);
  axisRenderTechnicalSky(sky);
}

/**
 * The Moon, from the server-composed `moonState()`.
 *
 * This section is about the CURRENT transiting Moon and says so. The natal
 * Moon belongs to My Chart and depends on a birth time; this one depends on
 * nothing but the clock, so it stays available on every chart including
 * unknown-time ones.
 */
function axisRenderMoon(moon, sky) {
  const section = $("#today-moon");
  const body = $("#today-moon-body");
  if (!section || !body) return;
  if (!moon) { section.hidden = true; body.innerHTML = ""; return; }
  section.hidden = false;

  const svg = renderMoonSVG({
    illumination: moon.illumination, waxing: moon.waxing, phaseName: moon.phase,
  });
  const alt = `${moon.phase}, ${moon.illumination}% lit, ${moon.direction}`;
  const next = moon.nextEvent
    ? `<p class="moon-state__next">Next ${esc(moon.nextEvent.kind)} ${esc(moon.nextEvent.when)}.</p>`
    : `<p class="moon-state__next">The next lunar event isn’t available right now.</p>`;
  body.innerHTML = `
    <div class="moon-state">
      <div class="moon-state__visual" role="img" aria-label="${esc(alt)}">${svg}</div>
      <div class="moon-state__text">
        <p class="moon-state__phase">${esc(moon.phase)}${moon.sign ? ` in ${esc(moon.sign)}` : ""}</p>
        <p class="moon-state__facts">${esc(String(moon.illumination))}% lit · ${esc(moon.direction)}</p>
        <p class="moon-state__meaning">${esc(moon.meaning)}</p>
        ${next}
        <p class="moon-state__note">This is the Moon in the sky right now — not the Moon in your birth chart.</p>
        <a class="o-btn o-btn--secondary o-btn--sm" href="#transits">See the transit details</a>
      </div>
    </div>`;
}

/** Ranked sky highlights, composed and ordered on the server. */
function axisRenderHighlights(highlights) {
  const section = $("#today-highlights");
  const body = $("#today-highlights-body");
  if (!section || !body) return;
  if (!highlights.length) { section.hidden = true; body.innerHTML = ""; return; }
  section.hidden = false;
  body.innerHTML = `<ul class="sky-highlights">${highlights.map((h) => `
    <li class="sky-highlight sky-highlight--${esc(h.kind)}">
      <span class="sky-highlight__label">${esc(h.label)}</span>
      <span class="sky-highlight__detail">${esc(h.detail)}</span>
      <a class="sky-highlight__link" href="${esc(h.href)}">${
        h.href === "#symbol-atlas" ? "Learn about this sign" : "See the transit details"
      }</a>
    </li>`).join("")}</ul>`;
}

/**
 * Technical Sky: a compact banner and a folded disclosure.
 *
 * The full body-by-body positions table used to render here. It is the densest
 * content in the product and it sat on the page people open first — and it is
 * the Positions workspace, which Dev Update 1.7 owns. Home now states the two
 * positions a reader actually asks for and links to the workspace that carries
 * the rest.
 */
function axisRenderTechnicalSky(sky) {
  const el = $("#today-sky");
  if (!el) return;
  // Degrees, not sign names. "Leo season" is already stated once in the
  // highlights above, and an earlier update deliberately removed the second
  // telling of that same fact. What a technical section adds is PRECISION —
  // 8°14′ Leo is a different statement from "Leo season", not a repeat of it.
  const pos = (b) => `${b.degrees}°${String(b.minutes).padStart(2, "0")}′ ${b.sign}`;
  const sun = sky.sun ? `Sun ${pos(sky.sun)}` : "";
  const moon = sky.moon ? `Moon ${pos(sky.moon)}` : "";
  const updated = sky.local_time_iso
    ? new Date(sky.local_time_iso).toLocaleString("en-US",
        { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const retro = (sky.retrogrades || []).filter(Boolean);
  el.innerHTML = `
    <section class="tech-sky" aria-labelledby="tech-sky-title">
      <h2 class="axis-section-title" id="tech-sky-title">Technical Sky</h2>
      <p class="tech-sky__summary">${[sun, moon].filter(Boolean).map(esc).join(" · ")}</p>
      <details class="tech-sky__more">
        <summary><span>How this was calculated</span></summary>
        <div class="tech-sky__body">
          <dl class="tech-sky__facts">
            ${sun ? `<div><dt>Sun</dt><dd>${esc(pos(sky.sun))}</dd></div>` : ""}
            ${moon ? `<div><dt>Moon</dt><dd>${esc(pos(sky.moon))}</dd></div>` : ""}
            ${sky.timezone_name ? `<div><dt>Local time</dt><dd>${esc(sky.timezone_name)}</dd></div>` : ""}
            ${updated ? `<div><dt>Calculated</dt><dd>${esc(updated)}</dd></div>` : ""}
            ${retro.length ? `<div><dt>Retrograde</dt><dd>${esc(retro.join(", "))}</dd></div>` : ""}
          </dl>
          <p class="tech-sky__help">Every position on this page is calculated by Orbit’s own astronomy engine. Nothing here is written by an AI model.</p>
          <a class="o-btn o-btn--secondary o-btn--sm" href="#positions">See every position in Current Positions</a>
        </div>
      </details>
      <div class="current-sky__location">
        <span class="u-caption" id="current-sky-location-status">Using your device timezone. Sharing your location can refine this to where you are right now.</span>
        <button type="button" class="o-btn o-btn--ghost o-btn--sm" id="current-sky-use-location">Use my current location</button>
      </div>
    </section>`;
}

/**
 * Home's "you have no chart yet" state.
 *
 * This used to be a third chart form, injected here with its own field ids. It
 * could not work for the audience that saw it most: a signed-out visitor has no
 * account to save a chart to, and birthplace search requires a session, so the
 * form's only possible outcome for them was an error under the Save button.
 *
 * It is now a call to action that opens the one real form — or, when signed
 * out, says plainly that an account comes first.
 */
function axisRenderSetup(message = "Orbit Axis reads today's sky against your birth chart. Create one and your daily reading appears here.") {
  const signedIn = authSignedIn();
  $("#today-fortune").innerHTML = `
    <div class="fortune-card">
      <h2>Create your birth chart</h2>
      <div class="fortune-setup">
        <p>${esc(message)}</p>
        ${signedIn
          ? `<button type="button" class="o-btn o-btn--primary" id="oa-open-chart-form">Create your birth chart</button>`
          : `<p class="fortune-card__sub">Sign in first — your chart is saved to your account so it follows you between devices.</p>`}
      </div>
    </div>`;
  $("#oa-open-chart-form")?.addEventListener("click", () => {
    openChartForm(state.charts.length === 0 ? "first" : "add");
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

/* ── Current Positions ──────────────────────────────────────────────────────
   The shared sky. No birth chart is involved and none is required, which is
   the whole distinction from Today's Transits — and the page says so in its
   own words rather than relying on the reader to infer it.

   Everything rendered here is composed server-side in lib/positions. The
   browser formats and lays out; it does not recalculate astrology and it does
   not author meaning. */

const POSITIONS = { loading: false, lastAt: null, data: null };

async function loadPositions({ manual = false } = {}) {
  // Current Positions is general sky data, but it is an AUTHENTICATED
  // workspace for now — making it public would change Orbit's public/private
  // boundary, which is a product decision this update does not own. So the
  // request is not made and nothing is rendered until the session resolves.
  // Rendering behind the gate would put a heading, a ten-row list, a live
  // region and a refresh button into the page for someone who has not signed
  // in, and `aria-modal` on the gate is not a reason to build that.
  if (state.auth.restoring || !authSignedIn()) { clearPositions(); return; }
  // A second click while the first request is in flight would race two
  // responses into the same DOM; the newer is not guaranteed to land last.
  if (POSITIONS.loading) return;
  POSITIONS.loading = true;
  const btn = $("#positions-refresh");
  const status = $("#positions-status");
  if (btn) { btn.disabled = true; btn.textContent = manual ? "Refreshing…" : "Refresh"; }
  if (status) status.textContent = manual ? "Refreshing the sky…" : "Loading the current sky…";
  if (!POSITIONS.data) positionsRenderSkeleton();

  try {
    const tz = axisResolveTimezone();
    const r = await get(`/api/sky/current?tz=${encodeURIComponent(tz)}`);
    POSITIONS.data = r;
    try {
      renderPositions(r);
      if (status) status.textContent = manual ? "Sky updated." : "";
    } catch (error) {
      // Ours, not the network's. Saying "check your connection" here would
      // hide a rendering defect behind a plausible excuse.
      console.error("[orbit] positions failed to render", { stage: "render", message: error?.message });
      positionsRenderError("We couldn't show the current positions just now.");
    }
  } catch {
    positionsRenderError(POSITIONS.data
      ? "We couldn't refresh the sky. The positions below are the last ones we loaded."
      : "We couldn't reach the current sky just now.");
  } finally {
    POSITIONS.loading = false;
    if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
  }
}

/**
 * Empty every Positions region.
 *
 * Called when signed out and on sign-out, so nothing survives in the DOM or
 * the accessibility tree for the next visitor to this tab.
 */
function clearPositions() {
  POSITIONS.data = null;

  for (const sel of ["#positions-summary-body", "#positions-list-body", "#positions-calc-body"]) {
    const el = $(sel);
    if (el) el.innerHTML = "";
  }
  for (const sel of ["#positions-summary", "#positions-calc"]) {
    const el = $(sel);
    if (el) el.hidden = true;
  }
  const time = $("#positions-time");
  if (time) time.textContent = "";
  const status = $("#positions-status");
  if (status) status.textContent = "";
}

function positionsRenderSkeleton() {
  const body = $("#positions-list-body");
  if (body) body.innerHTML = `<div class="axis-shimmer" style="height:320px" role="status" aria-live="polite" aria-label="Loading planetary positions"></div>`;
}

function positionsRenderError(message) {
  const status = $("#positions-status");
  if (status) status.textContent = "";
  // Keep any positions we already have — a failed refresh is not a reason to
  // blank data the reader was looking at. It is labelled as older instead.
  const target = POSITIONS.data ? $("#positions-status") : $("#positions-list-body");
  if (!target) return;
  target.innerHTML = `<div class="axis-section-error" role="alert">
    <p>${esc(message)}</p>
    <button type="button" class="o-btn o-btn--secondary o-btn--sm" data-action="retry-positions">Try again</button>
  </div>`;
}

function renderPositions(payload) {
  const sky = payload?.sky;
  const positions = payload?.positions || [];
  if (!sky) throw new Error("renderPositions called without a sky");

  const time = $("#positions-time");
  if (time) {
    const when = sky.local_time_iso
      ? new Date(sky.local_time_iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
      : "";
    time.textContent = when && sky.timezone_name
      ? `Calculated for ${when} in ${sky.timezone_name}`
      : "";
  }

  const summary = payload.summary;
  const sumSection = $("#positions-summary");
  const sumBody = $("#positions-summary-body");
  if (sumSection && sumBody) {
    sumSection.hidden = !summary;
    if (summary) {
      sumBody.innerHTML = `<ul class="positions-summary">
        ${summary.sun ? `<li><span class="positions-summary__label">Sun</span><span>${esc(summary.sun)}</span></li>` : ""}
        ${summary.moon ? `<li><span class="positions-summary__label">Moon</span><span>${esc(summary.moon)}</span></li>` : ""}
        <li><span class="positions-summary__label">Retrograde</span><span>${esc(summary.retrogradeLabel)}</span></li>
        <li><span class="positions-summary__label">Stations</span><span>${esc(summary.nearStationLabel)}</span></li>
        <li><span class="positions-summary__label">Sign boundaries</span><span>${esc(summary.boundaryLabel)}</span></li>
      </ul>`;
    }
  }

  const listBody = $("#positions-list-body");
  if (listBody) {
    listBody.innerHTML = positions.length
      ? `<ul class="positions-list">${positions.map(positionRowHtml).join("")}</ul>`
      : `<p class="me-muted">No planetary positions are available from the current calculation.</p>`;
  }

  const calcSection = $("#positions-calc");
  const calcBody = $("#positions-calc-body");
  const rows = payload.calculation || [];
  if (calcSection && calcBody) {
    calcSection.hidden = !rows.length;
    calcBody.innerHTML = `<details class="tech-sky__more">
      <summary><span>How these positions were calculated</span></summary>
      <div class="tech-sky__body">
        <dl class="tech-sky__facts">
          ${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join("")}
        </dl>
        <p class="tech-sky__help">Positions come from Orbit’s own astronomy engine. Movement descriptions are worked out from each planet’s speed relative to how fast it usually travels. Nothing on this page is written by an AI model.</p>
      </div>
    </details>`;
  }
}

function positionRowHtml(p) {
  const glyph = PLACEMENT_GLYPHS[p.name] || "";
  const signGlyph = SIGN_GLYPH[p.sign] || "";
  // Direction is always spelled out. A reader must never have to know that a
  // missing symbol means "direct".
  const movement = p.movement
    ? `<span class="positions-row__movement">${esc(p.movement.label)}</span>`
    : "";
  const boundary = p.approachingBoundary
    ? `<span class="positions-row__note">Approaching the end of ${esc(p.sign)}</span>` : "";
  return `<li class="positions-row${p.retrograde ? " is-retrograde" : ""}">
    <span class="positions-row__glyph" aria-hidden="true">${esc(glyph)}</span>
    <span class="positions-row__main">
      <span class="positions-row__name">${esc(p.name)}</span>
      <span class="positions-row__position">
        <span aria-hidden="true">${esc(signGlyph)}</span>
        <span>${esc(p.position)}</span>
      </span>
      ${p.role ? `<span class="positions-row__role">${esc(p.role)}</span>` : ""}
      ${boundary}
    </span>
    <span class="positions-row__state">
      <span class="positions-row__direction${p.retrograde ? " is-retrograde" : ""}">${esc(p.direction)}</span>
      ${movement}
    </span>
  </li>`;
}

function wirePositions() {
  const panel = $("#panel-positions");
  if (!panel || panel._positionsWired) return;
  panel._positionsWired = true;
  $("#positions-refresh")?.addEventListener("click", () => loadPositions({ manual: true }));
  panel.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="retry-positions"]')) loadPositions({ manual: true });
  });
}
