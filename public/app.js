/* ============================================================================
   Orbit — Application Controller
   ----------------------------------------------------------------------------
   Drives the app shell: workspace router, data loading, render functions,
   command palette, toasts, and persisted appearance settings. All business
   logic lives server-side and is untouched — this file only reads the existing
   JSON API and paints the design-system components.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = { symbols: [], chart: null, events: [], activeKind: "", atlasQuery: "", ready: false };

async function get(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.validation?.errors?.join("; ") || `HTTP ${response.status}`);
    error.data = data;
    throw error;
  }
  return data;
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

/* ── Inline icon set (stroke, 24-grid) ─────────────────────────────────── */
const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/>',
  charts: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/>',
  transits: '<path d="M12 3a9 9 0 1 0 9 9"/><circle cx="12" cy="12" r="3"/><path d="M20 4l-6 6"/>',
  research: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  mychart: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  today: '<circle cx="12" cy="13" r="4"/><path d="M12 3v2M5.5 6.5l1.4 1.4M18.5 6.5l-1.4 1.4M3 13h2M19 13h2M4 20h16"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  intelligence: '<path d="M12 2l1.9 5.8L20 9l-5.1 1.8L12 16l-1.9-5.2L5 9l6.1-1.2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.2 8.6l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12H21a2 2 0 1 1 0 4h-.09z"/>',
};
const icon = (name, cls = "rail__icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

/* ── Workspace registry — the single source of the navigation model ────── */
// `primary` workspaces show in the simple rail; the rest stay reachable via the
// command palette + direct hash (no workspace is removed). Today is the default.
const WORKSPACES = [
  { id: "today", label: "Today", crumb: "Your day", icon: "today", primary: true },
  { id: "mychart", label: "My Chart", crumb: "Your chart", icon: "mychart", primary: true },
  { id: "charts", label: "Charts", crumb: "Chart tools", icon: "charts", primary: true },
  { id: "history", label: "History", crumb: "Past readings", icon: "history", primary: true },
  { id: "intelligence", label: "Ask Orbit Axis", crumb: "Local guide", icon: "intelligence", primary: true },
  { id: "settings", label: "Settings", crumb: "Preferences", icon: "settings", primary: true },
  { id: "dashboard", label: "Overview", crumb: "Overview", icon: "dashboard", primary: false },
  { id: "transits", label: "Transits", crumb: "The moving sky", icon: "transits", primary: false },
  { id: "research", label: "Research", crumb: "Atlas & queries", icon: "research", primary: false },
];

/* ── Router ────────────────────────────────────────────────────────────── */
function buildRail() {
  $("#rail-nav").innerHTML = WORKSPACES.filter(ws => ws.primary).map(ws => `
    <a class="rail__link" id="tab-${ws.id}" role="tab" href="#${ws.id}" data-ws="${ws.id}"
       aria-controls="panel-${ws.id}" aria-selected="false">
      ${icon(ws.icon)}<span class="rail__label">${ws.label}</span>
    </a>`).join("");
}

function currentWorkspace() {
  const hash = location.hash.replace("#", "");
  return WORKSPACES.some(ws => ws.id === hash) ? hash : "today";
}

function navigate(id) {
  if (location.hash.replace("#", "") !== id) { location.hash = id; return; }
  renderRoute();
}

function renderRoute() {
  const id = currentWorkspace();
  const ws = WORKSPACES.find(w => w.id === id);

  WORKSPACES.forEach(w => {
    const panel = $(`#panel-${w.id}`);
    const link = $(`#tab-${w.id}`);
    const active = w.id === id;
    if (panel) panel.hidden = !active;
    if (link) { link.setAttribute("aria-current", active ? "page" : "false"); link.setAttribute("aria-selected", String(active)); }
  });

  $("#workspace-title").textContent = ws.label;
  $("#workspace-crumb").textContent = `Orbit Axis · ${ws.crumb}`;
  document.title = `Orbit Axis — ${ws.label}`;
  $("#workspace").scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ── Today's sky → metric tiles (Dashboard) ────────────────────────────── */
function renderSky(chart) {
  const { sun, moon, mercury, symbol_of_the_day: daySymbol } = chart;
  $("#sky-updated").textContent = "Updated just now";

  const tile = (glyph, eyebrow, value, sub, extra = "") => `
    <div class="o-tile o-rise-in">
      <div class="o-tile__head"><span class="u-eyebrow">${esc(eyebrow)}</span><span class="o-tile__glyph">${esc(glyph)}</span></div>
      <div class="o-tile__value">${esc(value)}</div>
      <div class="o-tile__sub">${sub}</div>
      ${extra}
    </div>`;

  $("#sky-tiles").innerHTML = [
    tile(sun.glyph, "Sun Season", sun.name,
      `${esc(sun.element)} · ${esc(sun.modality)} · ${esc(sun.ruling_planet)}`,
      `<div class="tile-progress"><div class="o-progress"><div class="o-progress__bar" style="width:${sun.progress_pct}%"></div></div><span class="u-meta">${sun.progress_pct}% through the season · ${esc(sun.next_sign)} begins ${esc(sun.season_ends)}</span></div>`),
    tile(moon.glyph, "Moon", moon.phase,
      `${moon.illumination_pct}% illuminated · ${moon.waxing ? "waxing" : "waning"}`,
      `<span class="u-meta">Next full ${esc(moon.next_full_moon)} · next new ${esc(moon.next_new_moon)}</span>`),
    tile("☿", "Mercury", mercury.retrograde ? "Retrograde" : "Direct",
      `<span class="o-pill ${mercury.retrograde ? "o-pill--warning" : "o-pill--success"}">${mercury.retrograde ? "℞ review mode" : "clear lanes"}</span>`,
      `<span class="u-meta">${esc(mercury.message)}</span>`),
    tile(daySymbol.glyph, "Symbol of the Day", daySymbol.name,
      `<span class="o-badge">${esc(daySymbol.kind.replace("_", " "))}</span>`,
      `<span class="u-meta">${esc(daySymbol.interpretation)}</span>`),
  ].join("");
}

/* ── Transit tiles (Transits workspace) ────────────────────────────────── */
function renderTransitTiles(chart) {
  const { sun, moon, mercury } = chart;
  const tile = (eyebrow, value, sub) => `
    <div class="o-tile"><span class="u-eyebrow">${esc(eyebrow)}</span>
      <div class="o-tile__value">${esc(value)}</div><div class="o-tile__sub">${sub}</div></div>`;
  $("#transit-tiles").innerHTML = [
    tile("Sun", `${sun.glyph} ${sun.name}`, `${sun.progress_pct}% through season`),
    tile("Moon", `${moon.glyph} ${moon.phase}`, `${moon.illumination_pct}% illuminated`),
    tile("Mercury", mercury.retrograde ? "℞ Retrograde" : "Direct", esc(mercury.message)),
  ].join("");
}

/* ── Zodiac wheel (Charts workspace) ───────────────────────────────────── */
function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function segmentPath(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const [x1, y1] = polar(cx, cy, rOuter, startAngle);
  const [x2, y2] = polar(cx, cy, rOuter, endAngle);
  const [x3, y3] = polar(cx, cy, rInner, endAngle);
  const [x4, y4] = polar(cx, cy, rInner, startAngle);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
}
function renderWheel() {
  const signs = state.symbols.filter(s => s.kind === "zodiac_sign");
  const svg = $("#zodiac-wheel");
  const cx = 160, cy = 160, rOuter = 150, rInner = 92;
  let markup = "";

  signs.forEach((sign, i) => {
    const start = i * 30;
    markup += `<path class="seg" data-slug="${sign.slug}" d="${segmentPath(cx, cy, rOuter, rInner, start, start + 30)}"><title>${esc(sign.name)}</title></path>`;
    const [gx, gy] = polar(cx, cy, (rOuter + rInner) / 2, start + 15);
    markup += `<text class="seg-glyph" x="${gx}" y="${gy}" text-anchor="middle" dominant-baseline="central">${sign.glyph}</text>`;
  });

  const sunGlyph = state.chart?.sun?.glyph ?? "☉";
  markup += `<circle class="hub" cx="${cx}" cy="${cy}" r="${rInner - 14}" />`;
  markup += `<text class="hub-glyph" x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="central">${sunGlyph}</text>`;
  markup += `<text class="hub-now" x="${cx}" y="${cy + 22}" text-anchor="middle">NOW</text>`;
  svg.innerHTML = markup;

  svg.querySelectorAll(".seg").forEach(seg => {
    const select = () => {
      svg.querySelectorAll(".seg").forEach(o => o.classList.remove("active"));
      seg.classList.add("active");
      const sign = signs.find(e => e.slug === seg.dataset.slug);
      $("#wheel-detail").innerHTML = `
        <strong>${esc(sign.name)} ${esc(sign.glyph)}</strong> · ${esc(sign.date_range)} ·
        ${esc(sign.element)} ${esc(sign.modality)}, ruled by ${esc(sign.ruling_planet)}.<br/>
        ${esc(sign.interpretation)}`;
    };
    seg.addEventListener("click", select);
    seg.setAttribute("tabindex", "0");
    seg.setAttribute("role", "button");
    seg.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } });
  });

  const currentSlug = state.chart?.sun?.sign;
  if (currentSlug) svg.querySelector(`.seg[data-slug="${currentSlug}"]`)?.dispatchEvent(new Event("click"));
}

/* ── Symbol atlas (Research workspace) ─────────────────────────────────── */
function renderAtlas() {
  const query = state.atlasQuery.trim().toLowerCase();
  let symbols = state.activeKind ? state.symbols.filter(s => s.kind === state.activeKind) : state.symbols;
  if (query) {
    symbols = symbols.filter(s =>
      s.name.toLowerCase().includes(query) ||
      (s.keywords ?? []).some(k => k.toLowerCase().includes(query)) ||
      (s.interpretation ?? "").toLowerCase().includes(query));
  }

  $("#atlas-count").textContent = `${symbols.length} of ${state.symbols.length} symbols`;

  if (!symbols.length) {
    $("#atlas").innerHTML = `<div class="o-empty" style="grid-column:1/-1;">
      <div class="o-empty__glyph">✦</div>
      <div class="o-empty__title">No symbols match</div>
      <div class="o-empty__text">Try a different search term or clear the filter.</div>
    </div>`;
    return;
  }

  $("#atlas").innerHTML = symbols.map(s => `
    <div class="symbol-card o-fade-in">
      <div class="symbol-card__top">
        <span class="symbol-card__glyph">${esc(s.glyph)}</span>
        <span class="symbol-card__name">${esc(s.name)}</span>
        <span class="symbol-card__kind o-badge">${esc(s.kind.replace("_", " "))}</span>
      </div>
      ${s.date_range ? `<div class="symbol-card__meta">${esc(s.date_range)} · ${esc(s.element)} ${esc(s.modality)} · ${esc(s.ruling_planet)}</div>` : ""}
      <div class="symbol-card__text">${esc(s.interpretation)}</div>
      <div class="symbol-card__keywords">${(s.keywords ?? []).map(k => `<span class="o-badge">${esc(k)}</span>`).join("")}</div>
    </div>`).join("");
}

/* ── Events → timeline (Transits) + compact list (Dashboard) ───────────── */
function renderEvents(events) {
  $("#events-count").textContent = `${events.length} upcoming`;
  $("#events-timeline").innerHTML = events.map(e => `
    <div class="o-timeline__item">
      <div class="o-timeline__date">${esc(e.date)}</div>
      <div class="o-timeline__body">
        <div class="o-timeline__title">${esc(e.title)}</div>
        <div class="o-timeline__detail">${esc(e.detail)}</div>
      </div>
    </div>`).join("");

  $("#dash-events").innerHTML = `<div class="o-list">${events.slice(0, 5).map(e => `
    <div class="o-list__row">
      <div class="o-list__main">
        <div class="o-list__title">${esc(e.title)}</div>
        <div class="o-list__sub">${esc(e.detail)}</div>
      </div>
      <span class="o-badge">${esc(e.date)}</span>
    </div>`).join("")}</div>`;
}

/* ── Chart tools ───────────────────────────────────────────────────────── */
function wireTools() {
  const signs = state.symbols.filter(s => s.kind === "zodiac_sign");
  for (const id of ["#compat-a", "#compat-b"]) {
    $(id).innerHTML = signs.map(s => `<option value="${s.slug}">${s.glyph} ${esc(s.name)}</option>`).join("");
  }
  $("#compat-b").selectedIndex = 4;

  $("#birth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const value = $("#birth-date").value;
    if (!value) return;
    const [, month, day] = value.split("-").map(Number);
    try {
      const data = await get(`/api/sign-for-date?month=${month}&day=${day}`);
      $("#birth-result").innerHTML = `<strong>${esc(data.sign.name)} ${esc(data.sign.glyph)}</strong> — ${esc(data.summary)}`;
    } catch { $("#birth-result").textContent = "Could not look up that date."; }
  });

  $("#compat-form").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const data = await get(`/api/compatibility?a=${$("#compat-a").value}&b=${$("#compat-b").value}`);
      $("#compat-result").innerHTML = `
        <span class="score">${data.harmony_score}</span><span class="u-muted"> / 100 symbolic harmony</span><br/>
        <strong>${esc(data.a.name)} × ${esc(data.b.name)}</strong> — ${esc(data.note)}.
        ${data.aspect ? `<br/>${esc(data.aspect.name)} ${esc(data.aspect.glyph)}: ${esc(data.aspect.interpretation)}` : ""}`;
    } catch { $("#compat-result").textContent = "Could not compute that comparison."; }
  });

  $("#query-form").addEventListener("submit", async e => {
    e.preventDefault();
    const prompt = $("#query-input").value.trim();
    if (!prompt) return;
    $("#query-result").innerHTML = `<span class="o-spinner" style="display:inline-block;vertical-align:middle;"></span> <span class="u-muted">Consulting the atlas…</span>`;
    try {
      const response = await fetch("/api/query", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      $("#query-result").innerHTML = `${esc(data.reply)}<br/><small class="u-meta">algorithm: ${esc(data.algorithm)}</small>`;
    } catch { $("#query-result").textContent = "Orbit could not answer that right now."; }
  });

  // Atlas filters (tabs) + search
  $("#atlas-filters").addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    $$("#atlas-filters button").forEach(o => o.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    state.activeKind = btn.dataset.kind;
    renderAtlas();
  });
  $("#atlas-search").addEventListener("input", e => { state.atlasQuery = e.target.value; renderAtlas(); });

  // Charts search filters the wheel highlight by name.
  $("#charts-search").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const svg = $("#zodiac-wheel");
    const match = state.symbols.find(s => s.kind === "zodiac_sign" && s.name.toLowerCase().startsWith(q));
    if (match) svg.querySelector(`.seg[data-slug="${match.slug}"]`)?.dispatchEvent(new Event("click"));
  });

  $("#transits-refresh").addEventListener("click", () => refreshData(true));

  // Dashboard "go to workspace" buttons.
  $$("[data-goto]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.goto)));
}

/* ── Command palette ───────────────────────────────────────────────────── */
const cmd = { open: false, index: 0, items: [] };
function commandItems() {
  const nav = WORKSPACES.map(ws => ({ group: "Go to", label: ws.label, glyph: "→", hint: `#${ws.id}`, run: () => navigate(ws.id) }));
  const actions = [
    { group: "Actions", label: "Ask Orbit a question", glyph: "?", run: () => { navigate("research"); setTimeout(() => $("#query-input").focus(), 60); } },
    { group: "Actions", label: "Look up a birth sign", glyph: "☉", run: () => { navigate("charts"); setTimeout(() => $("#birth-date").focus(), 60); } },
    { group: "Actions", label: "Toggle theme", glyph: "◐", run: () => settings.set("theme", document.documentElement.dataset.theme === "dark" ? "light" : "dark") },
    { group: "Actions", label: "Toggle density", glyph: "▤", run: () => settings.set("density", document.documentElement.dataset.density === "compact" ? "comfortable" : "compact") },
  ];
  return [...nav, ...actions];
}
function openCommand() {
  cmd.open = true; cmd.index = 0;
  $("#cmd-overlay").dataset.open = "true";
  $("#cmd-input").value = "";
  renderCommand("");
  setTimeout(() => $("#cmd-input").focus(), 20);
}
function closeCommand() {
  cmd.open = false;
  $("#cmd-overlay").dataset.open = "false";
}
function renderCommand(query) {
  const q = query.trim().toLowerCase();
  cmd.items = commandItems().filter(i => i.label.toLowerCase().includes(q));
  cmd.index = Math.min(cmd.index, Math.max(0, cmd.items.length - 1));
  const list = $("#cmd-list");
  if (!cmd.items.length) { list.innerHTML = `<div class="o-cmd__empty">No matching commands</div>`; return; }
  let html = ""; let lastGroup = "";
  cmd.items.forEach((item, i) => {
    if (item.group !== lastGroup) { html += `<div class="o-cmd__group-label">${item.group}</div>`; lastGroup = item.group; }
    html += `<div class="o-cmd__item" role="option" data-i="${i}" aria-selected="${i === cmd.index}">
      <span class="o-cmd__glyph">${item.glyph}</span><span>${esc(item.label)}</span>
      ${item.hint ? `<span class="o-cmd__hint">${esc(item.hint)}</span>` : ""}</div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll(".o-cmd__item").forEach(el => {
    el.addEventListener("mousemove", () => { cmd.index = Number(el.dataset.i); highlightCommand(); });
    el.addEventListener("click", () => runCommand(Number(el.dataset.i)));
  });
}
function highlightCommand() {
  $$("#cmd-list .o-cmd__item").forEach(el => el.setAttribute("aria-selected", String(Number(el.dataset.i) === cmd.index)));
}
function runCommand(i) {
  const item = cmd.items[i];
  if (!item) return;
  closeCommand();
  item.run();
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

/* ── Persisted appearance settings ─────────────────────────────────────── */
const settings = {
  keys: {
    theme: { attr: "data-theme", default: "dark" },
    density: { attr: "data-density", default: "comfortable" },
    text: { attr: "data-text", default: "default" },
    contrast: { attr: "data-contrast", default: "normal" },
    motion: { attr: "data-motion", default: "full" },
  },
  load() {
    for (const [key, cfg] of Object.entries(this.keys)) {
      const val = localStorage.getItem(`orbit.${key}`) ?? cfg.default;
      this.apply(key, val);
    }
  },
  apply(key, val) {
    const cfg = this.keys[key];
    if (val === cfg.default && (key === "text" || key === "contrast" || key === "motion")) {
      document.documentElement.removeAttribute(cfg.attr);
    } else {
      document.documentElement.setAttribute(cfg.attr, val);
    }
    // reflect into segmented controls
    const seg = { theme: "#set-theme", density: "#set-density", text: "#set-text", contrast: "#set-contrast", motion: "#set-motion" }[key];
    if (seg) $$(`${seg} button`).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === val)));
  },
  set(key, val) {
    localStorage.setItem(`orbit.${key}`, val);
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
}

/* ── Global keyboard shortcuts ─────────────────────────────────────────── */
function wireKeyboard() {
  document.addEventListener("keydown", e => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); cmd.open ? closeCommand() : openCommand(); return; }

    if (cmd.open) {
      if (e.key === "Escape") { e.preventDefault(); closeCommand(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); cmd.index = Math.min(cmd.index + 1, cmd.items.length - 1); highlightCommand(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cmd.index = Math.max(cmd.index - 1, 0); highlightCommand(); }
      else if (e.key === "Enter") { e.preventDefault(); runCommand(cmd.index); }
      return;
    }

    // Number keys jump between workspaces when not typing.
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    if (!typing && !meta && /^[1-5]$/.test(e.key)) {
      navigate(WORKSPACES[Number(e.key) - 1].id);
    }
  });

  $("#topnav-search").addEventListener("click", openCommand);
  $("#rail-command").addEventListener("click", openCommand);
  $("#cmd-input").addEventListener("input", e => renderCommand(e.target.value));
  $("#cmd-overlay").addEventListener("click", e => { if (e.target === $("#cmd-overlay")) closeCommand(); });
}

/* ── Data ──────────────────────────────────────────────────────────────── */
async function refreshData(notify = false) {
  const [chart, symbolsData, eventsData, health] = await Promise.all([
    get("/api/chart/now"),
    get("/api/symbols"),
    get("/api/events?count=9"),
    get("/api/health").catch(() => ({ ok: false })),
  ]);

  state.chart = chart;
  state.symbols = symbolsData.symbols;
  state.events = eventsData.events;

  renderSky(chart);
  renderTransitTiles(chart);
  renderEvents(state.events);
  if (!state.ready) { renderWheel(); wireTools(); state.ready = true; } else { renderWheel(); }
  renderAtlas();

  // Status panels
  $("#status-symbols").textContent = `${state.symbols.length} loaded`;
  $("#set-symbols").textContent = `${state.symbols.length}`;
  $("#set-service").textContent = health.ok ? `orbit · port ${health.port}` : "unavailable";
  $("#settings-disclaimer").textContent = chart.disclaimer
    ? `${chart.disclaimer} Sky timing is computed from mean cycles and is approximate.`
    : $("#settings-disclaimer").textContent;
  $("#rail-status").textContent = health.ok ? "Systems nominal" : "Engine offline";
  $("#rail-status").className = health.ok ? "o-pill o-pill--success" : "o-pill o-pill--error";

  if (notify) toast("Transits refreshed");
}

/* ── Boot ──────────────────────────────────────────────────────────────── */
async function boot() {
  settings.load();
  buildRail();
  wireSettings();
  wireKeyboard();

  $("#topnav-date").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  window.addEventListener("hashchange", renderRoute);
  renderRoute();

  // Feature panels carried over during branch integration (defensive: each
  // no-ops if its DOM/backing service is absent, so the app never blocks).
  wireMyChart();
  loadMoonTonight();
  loadLocalIntelligence();

  // Orbit Axis daily experience (Today + History + detail levels).
  axisInit();

  await refreshData();
}


// ══ Carried-over feature logic (branch integration) ═════════════════════════
// Local Intelligence + My Chart, grafted onto the design-system shell. These
// bind to the #panel-intelligence and #panel-mychart workspaces.

// ── Local Intelligence ──────────────────────────────────────────────────────
async function loadLocalIntelligence() {
  try {
    const data = await get("/api/local-llm/status");
    $("#llm-status").textContent = data.reachable ? "Connected" : (data.message || "Unavailable");
    $("#llm-provider").textContent = data.provider || "—";
    $("#llm-model").textContent = data.selected_model || data.configured_model || "No model selected";
    $("#llm-installed").textContent = data.installed_model ? "Yes" : "No";
    $("#llm-fallback").textContent = data.fallback_active ? "Active" : "Inactive";
    $("#llm-context").textContent = data.context_length ? `${data.context_length} tokens` : "—";
    $("#llm-prompt-version").textContent = data.prompt_version || "—";
  } catch (error) {
    $("#llm-status").textContent = `Unavailable: ${error.message}`;
    $("#llm-model").textContent = "—";
  }

  $("#intel-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await runIntelGenerate(false);
  });
  $("#proposal-button").addEventListener("click", async () => runIntelGenerate(true));
}

async function runIntelGenerate(propose) {
  const prompt = $("#intel-prompt").value.trim();
  if (!prompt) return;
  $("#intel-output").textContent = "Retrieving approved project context…";
  $("#proposal-panel").innerHTML = "";
  try {
    const data = propose
      ? await post("/api/vault/edit-proposals", {
          prompt,
          query: "Orbit Axis roadmap",
          operation: "create",
          path: "07 Orbit App/Updates/Local LLM Integration Test.md",
          title: "Local LLM Integration Test",
          type: "app_update",
          reason: "Local Intelligence UI proposal test",
        })
      : await post("/api/local-llm/generate", { prompt, query: prompt });
    renderIntelResult(data);
  } catch (error) {
    $("#intel-output").textContent = `Local Intelligence failed: ${error.message}`;
    if (error.data?.proposal) renderProposal(error.data.proposal);
  }
}

function renderIntelResult(data) {
  const response = data.response || {};
  $("#intel-output").innerHTML = `<strong>${esc(data.generation_label || "Local generation")}</strong><br/>${esc(response.answer || "No answer returned.")}`;
  $("#intel-run-meta").innerHTML = `
    <span><strong>Validation</strong> ${data.validation?.ok ? "passed" : "failed"}</span>
    <span><strong>Duration</strong> ${Number(data.duration_ms || 0).toLocaleString()} ms</span>
    <span><strong>Context</strong> ${esc(data.context_length || "—")}</span>
    <span><strong>Prompt</strong> ${esc(data.prompt_version || "—")}</span>`;
  $("#intel-sources").innerHTML = `
    <strong>Sources used</strong>
    <ul>${(data.sources || response.sources || []).map(source => `<li>${esc(source.path)}${source.title ? ` — ${esc(source.title)}` : ""}</li>`).join("")}</ul>`;
  if (data.proposal) renderProposal(data.proposal);
}

function renderProposal(proposal) {
  state.proposal = proposal;
  $("#proposal-panel").innerHTML = `
    <div class="proposal-meta">
      <strong>Target path</strong><br/>${esc(proposal.path)}<br/>
      <strong>Reason</strong><br/>${esc(proposal.reason)}<br/>
      <strong>Status</strong><br/><span id="proposal-status">${esc(proposal.status)}</span>
      ${proposal.status === "stale" ? '<div class="stale-warning">Target changed after proposal creation. Generate a fresh proposal.</div>' : ""}<br/>
      <strong>Model</strong><br/>${esc(proposal.model || "—")}<br/>
      <strong>Prompt</strong><br/>${esc(proposal.prompt_version || "—")}<br/>
      <strong>Validation</strong><br/>${proposal.validation?.ok ? "Passed" : esc((proposal.validation?.errors || []).join("; "))}
    </div>
    <div class="proposal-preview">
      <section><strong>Current</strong><pre>${esc(proposal.current_content || "New note")}</pre></section>
      <section><strong>Proposed</strong><pre>${esc(proposal.proposed_content || "")}</pre></section>
    </div>
    <section><strong>Unified diff</strong><pre>${esc(proposal.diff_text || "")}</pre></section>
    <div class="proposal-actions">
      <button type="button" data-action="approve">Approve</button>
      <button type="button" data-action="reject">Reject</button>
      <button type="button" data-action="apply">Apply</button>
    </div>`;
  $("#proposal-panel").querySelector(".proposal-actions").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    try {
      const result = await post(`/api/vault/edit-proposals/${proposal.id}/${action}`, {});
      const status = result.proposal?.status || result.logRecord?.status || action;
      $("#proposal-status").textContent = status;
      if (status === "stale") renderProposal(result.proposal);
    } catch (error) {
      if (error.data?.proposal) renderProposal(error.data.proposal);
      else $("#proposal-status").textContent = error.message;
    }
  });
}

// ── My Chart ─────────────────────────────────────────────────────────────────
const SIGN_GLYPH = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};
const ELEMENT_CLASS = { Fire: "fire", Earth: "earth", Air: "air", Water: "water" };

function degLabel(p) {
  if (!p || p.unavailable) return "";
  return `${p.degrees}° ${String(p.minutes).padStart(2, "0")}′`;
}

function renderBigThree(bt) {
  const items = [
    { glyph: "☉", label: "Sun", body: bt.sun },
    { glyph: "☾", label: "Moon", body: bt.moon },
    { glyph: "↑", label: "Rising", body: bt.rising },
  ];
  $("#bigthree").innerHTML = items.map(({ glyph, label, body }) => {
    if (!body || body.unavailable) {
      return `<div class="bigthree-item unavailable">
        <div class="bt-glyph">${glyph}</div>
        <div class="bt-label">${label}</div>
        <div class="bt-sign">Unavailable</div>
        <div class="bt-deg">${esc(body?.reason || "Birth time required")}</div></div>`;
    }
    return `<div class="bigthree-item">
      <div class="bt-glyph">${glyph} ${SIGN_GLYPH[body.sign] || ""}</div>
      <div class="bt-label">${label}</div>
      <div class="bt-sign">${esc(body.sign)}</div>
      <div class="bt-deg">${degLabel(body)}</div></div>`;
  }).join("");
}

function renderBars(elId, percentages, classMap) {
  const el = $(elId);
  el.innerHTML = Object.entries(percentages).map(([key, pct]) => `
    <div class="bar-row">
      <span class="bar-key">${esc(key)}</span>
      <span class="bar-track"><span class="bar-fill ${classMap ? (classMap[key] || "") : ""}" style="width:${pct}%"></span></span>
      <span class="bar-pct">${pct}%</span>
    </div>`).join("");
}

function renderPlacements(chart) {
  const rows = Object.values(chart.planets).map((p) =>
    `<tr><td>${esc(p.name)}</td><td>${SIGN_GLYPH[p.sign] || ""} ${esc(p.sign)}</td><td>${degLabel(p)}</td><td>${p.retrograde ? "℞" : ""}</td><td>${chart.planet_houses[p.name] ? "H" + chart.planet_houses[p.name] : ""}</td></tr>`
  ).join("");
  const asp = chart.aspects.slice(0, 12).map((a) =>
    `<li>${esc(a.a)} ${esc(a.aspect.toLowerCase())} ${esc(a.b)} <span class="orb">(orb ${a.orb}°)</span></li>`
  ).join("");
  $("#chart-placements").innerHTML = `
    <table class="placements">
      <thead><tr><th>Body</th><th>Sign</th><th>Degree</th><th>R</th><th>House</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="chart-meta">Chart ruler: ${esc(chart.chart_ruler || "—")} · Dominant: ${esc(chart.element_balance.dominant)} / ${esc(chart.modality_balance.dominant)} · ${esc(chart.calculation_version)}</div>
    <h4>Major aspects</h4><ul class="aspect-list">${asp}</ul>`;
}

function renderChart(chart, name) {
  $("#mychart-name").textContent = name ? `· ${name}` : "· Preview";
  const warn = $("#chart-warnings");
  if (chart.warnings && chart.warnings.length) {
    const human = { birth_time_unknown: "Birth time unknown — Rising and houses are hidden.", houses_unavailable: "Houses unavailable.", rising_unavailable: "Rising unavailable.", moon_approximate: "Moon position is approximate without a birth time." };
    const seen = new Set();
    warn.innerHTML = chart.warnings.filter((w) => !seen.has(w) && seen.add(w)).map((w) => `<span class="warn-chip">${esc(human[w] || w)}</span>`).join("");
  } else warn.innerHTML = "";
  renderBigThree(chart.big_three);
  renderBars("#element-bars", chart.element_balance.percentages, ELEMENT_CLASS);
  renderBars("#modality-bars", chart.modality_balance.percentages, null);
  renderPlacements(chart);
}

function wireMyChart() {
  const form = $("#chart-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hint = $("#chart-form-hint");
    const accuracy = $("#cf-accuracy").value;
    const payload = {
      nickname: $("#cf-nickname").value.trim() || undefined,
      birth_date: $("#cf-date").value,
      birth_time: accuracy === "unknown" ? null : ($("#cf-time").value || null),
      time_accuracy: accuracy,
      birthplace_name: $("#cf-place").value.trim() || undefined,
      latitude: parseFloat($("#cf-lat").value),
      longitude: parseFloat($("#cf-lon").value),
      utc_offset_at_birth: $("#cf-offset").value.trim() || "+00:00",
    };
    hint.textContent = "Calculating…";
    try {
      const { chart } = await post("/api/chart/preview", payload);
      renderChart(chart, payload.nickname);
      hint.textContent = "Computed locally — not saved. Sign in to save charts.";
    } catch (err) {
      hint.textContent = err.message;
    }
  });
}

async function loadMoonTonight() {
  try {
    const { moon } = await get("/api/moon/current");
    $("#moon-tonight").innerHTML = `
      <div class="moon-phase">${SIGN_GLYPH[moon.sign] || ""} ${esc(moon.phase_name)}</div>
      <div class="moon-illum">${moon.illumination_percent}% illuminated · ${moon.waxing ? "waxing" : "waning"}</div>
      <div class="moon-sign">Moon in ${esc(moon.sign)} · times in UTC</div>`;
  } catch {
    $("#moon-tonight").textContent = "Moon data unavailable.";
  }
}

boot().catch(err => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<div class="card" style="border-color:#7a2d44;color:#ff8fa8">Orbit failed to load: ${esc(err.message)}</div>`);
});

// ══ Orbit Axis daily experience ═════════════════════════════════════════════
// Today workspace, Fortune, Tonight's Moon, Current Sky, History, and the
// Simple/Balanced/Advanced detail level. Deterministic fortune comes from the
// server; nothing here calculates astrology. Works in local dev via the
// stateless preview; upgrades to persisted fortunes when signed in.
const AXIS = { detail: "Simple", lastFortune: null, lastSky: null };
const DETAILS = ["Simple", "Balanced", "Advanced"];

function axisGetBirth() {
  try { return JSON.parse(localStorage.getItem("oa_birth") || "null"); } catch { return null; }
}
function axisSetBirth(b) { localStorage.setItem("oa_birth", JSON.stringify(b)); }

async function axisLoadDetail() {
  const stored = localStorage.getItem("oa_detail");
  if (DETAILS.includes(stored)) AXIS.detail = stored;
  try {
    const r = await get("/api/settings/detail");
    if (r.persisted && DETAILS.includes(r.astrology_detail_level)) AXIS.detail = r.astrology_detail_level;
  } catch { /* default/local is fine */ }
  axisApplyDetail(false);
}
function axisApplyDetail(rerender = true) {
  localStorage.setItem("oa_detail", AXIS.detail);
  document.documentElement.setAttribute("data-detail", AXIS.detail);
  for (const btn of $$(".axis-detail button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === AXIS.detail));
  }
  if (rerender) {
    if (AXIS.lastFortune) axisRenderFortune(AXIS.lastFortune);
    if (AXIS.lastSky) axisRenderSky(AXIS.lastSky);
  }
}
async function axisSetDetail(level) {
  if (!DETAILS.includes(level)) return;
  AXIS.detail = level;
  axisApplyDetail(true);
  try {
    await fetch("/api/settings/detail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ astrology_detail_level: level }) });
  } catch { /* best effort */ }
}

function axisInit() {
  if (!$("#panel-today")) return;
  const today = new Date();
  $("#today-date").textContent = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  for (const btn of $$(".axis-detail button")) {
    btn.addEventListener("click", () => axisSetDetail(btn.dataset.level));
  }
  const scope = $("#history-scope");
  if (scope) scope.addEventListener("change", () => axisLoadHistory(scope.value));
  // History loads when its workspace opens (and once now if it's the route).
  window.addEventListener("hashchange", () => { if (currentWorkspace() === "history") axisLoadHistory($("#history-scope")?.value || "active"); });

  axisLoadDetail();
  axisLoadToday();
  if (currentWorkspace() === "history") axisLoadHistory("active");
}

// ── Today ────────────────────────────────────────────────────────────────────
async function axisLoadToday() {
  // Moon + Sky always render (they don't need a saved chart).
  get("/api/moon/current").then(r => axisRenderMoon(r.moon)).catch(() => {});
  get("/api/sky/current").then(r => { AXIS.lastSky = r.sky; axisRenderSky(r.sky); }).catch(() => {});

  // Fortune: prefer the signed-in path; fall back to a local preview.
  try {
    const r = await get("/api/fortune/today");
    AXIS.lastFortune = r.fortune;
    if (r.detail_level && DETAILS.includes(r.detail_level)) { AXIS.detail = r.detail_level; axisApplyDetail(false); }
    axisShowReadingFor(r.chart?.nickname || "My Chart");
    axisRenderFortune(r.fortune);
    return;
  } catch { /* not signed in / no active chart → local preview */ }

  const birth = axisGetBirth();
  if (!birth) return axisRenderSetup();
  try {
    const r = await post("/api/fortune/preview", birth);
    AXIS.lastFortune = r.fortune;
    axisShowReadingFor(birth.nickname || "My Chart");
    axisRenderFortune(r.fortune);
  } catch (e) {
    $("#today-fortune").innerHTML = `<div class="fortune-card"><h2>Today’s Fortune</h2><p class="fortune-card__sub">${esc(e.message)}</p></div>`;
  }
}

function axisShowReadingFor(name) {
  const el = $("#today-reading-for");
  if (el) { el.hidden = false; $("#today-chart-name").textContent = name; }
}

function axisRenderFortune(F) {
  const sections = [
    ["Today’s Mood", F.mood], ["Love", F.love_reading],
    ["Luck", F.luck_reading], ["Watch-Out", F.watch_out],
  ].map(([label, body]) => `<div class="fortune-section"><div class="fortune-section__label">${label}</div><div class="fortune-section__body">${esc(body)}</div></div>`).join("");
  const key = AXIS.detail === "Advanced" ? "advanced" : AXIS.detail === "Balanced" ? "balanced" : "simple";
  const why = (F.factors || []).map(f => `<li>${esc(f[key])}</li>`).join("");
  $("#today-fortune").innerHTML = `
    <div class="fortune-card">
      <h2>Today’s Fortune</h2>
      <div class="fortune-card__sub">${esc(F.fortune_date || "")} · symbolic reflection, never prediction</div>
      <div class="fortune-sections">${sections}</div>
      <div class="fortune-extras">
        <div class="lucky-number"><span class="lucky-number__label">Lucky Number</span><span class="lucky-number__value">${esc(F.lucky_number)}</span></div>
        <div class="lucky-color"><span class="lucky-color__label">Lucky Color</span>
          <span class="lucky-color__chip">
            <span class="lucky-color__swatch" style="background:${esc(F.lucky_color.value)};color:${esc(F.lucky_color.value)}"></span>
            <span><span class="lucky-color__name">${esc(F.lucky_color.name)}</span> <span class="lucky-color__hex">${esc(F.lucky_color.value)}</span></span>
          </span>
        </div>
      </div>
      <details class="why-reading"><summary>Why this reading?</summary><ul class="why-list">${why}</ul></details>
    </div>`;
}

function axisRenderMoon(moon) {
  if (!moon || !$("#today-moon")) return;
  $("#today-moon").innerHTML = `
    <div class="axis-moon" aria-hidden="true"><span class="axis-moon__halo"></span></div>
    <div class="moon-card__body">
      <div class="u-eyebrow">Tonight’s Moon</div>
      <div class="moon-card__phase">${SIGN_GLYPH[moon.sign] || ""} ${esc(moon.phase_name)}</div>
      <div class="moon-card__meta">${esc(moon.illumination_percent)}% illuminated · ${moon.waxing ? "waxing (growing)" : "waning (shrinking)"}</div>
      <div class="moon-card__sign">Moon in ${esc(moon.sign)}</div>
      <div class="moon-card__tz">Calculated locally · times in UTC</div>
    </div>`;
}

function axisRenderSky(sky) {
  if (!sky || !$("#today-sky")) return;
  const chips = [
    `<span class="sky-chip"><span class="dot"></span>${esc(sky.zodiac_season)} season</span>`,
    `<span class="sky-chip"><span class="dot"></span>Moon in ${esc(sky.moon.sign)}</span>`,
    `<span class="sky-chip"><span class="dot"></span>${esc(sky.moon.phase_name)}</span>`,
    ...(sky.retrogrades || []).map(r => `<span class="sky-chip retro"><span class="dot"></span>${esc(r)} retrograde</span>`),
  ].join("");
  const theme = (sky.retrogrades || []).includes("Mercury")
    ? "A slow-down-and-review kind of sky — good for tidying and second drafts."
    : `${sky.moon.waxing ? "A building, lean-in" : "A settling, wind-down"} sky today.`;
  let advanced = "";
  if (AXIS.detail === "Advanced" && sky.planets) {
    const rows = Object.values(sky.planets).map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.sign)} ${p.degrees}°${String(p.minutes).padStart(2, "0")}′</td><td>${p.retrograde ? "℞" : ""}</td></tr>`).join("");
    advanced = `<details class="sky-advanced" open><summary>Technical sky</summary>
      <table class="placements"><thead><tr><th>Body</th><th>Position</th><th>R</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  }
  $("#today-sky").innerHTML = `<h2>Current Sky</h2><div class="sky-facts">${chips}</div><div class="sky-theme">${theme}</div>${advanced}`;
}

function axisRenderSetup() {
  $("#today-fortune").innerHTML = `
    <div class="fortune-card">
      <h2>Set up your chart</h2>
      <div class="fortune-setup">
        <p>Tell Orbit Axis when and where you were born, and it will read today’s sky just for you. Everything is calculated on your device — nothing leaves your machine.</p>
        <form id="oa-setup" class="chart-form">
          <div class="chart-form-grid">
            <label>Nickname <input type="text" id="oa-nickname" placeholder="My Chart" /></label>
            <label>Birth date <input type="date" id="oa-date" required /></label>
            <label>Birth time <input type="time" id="oa-time" /></label>
            <label>Time accuracy
              <select id="oa-accuracy"><option value="exact">exact</option><option value="reported">reported</option><option value="approximate">approximate</option><option value="unknown">unknown</option></select>
            </label>
            <label>Latitude <input type="number" step="0.0001" id="oa-lat" placeholder="51.5074" required /></label>
            <label>Longitude <input type="number" step="0.0001" id="oa-lon" placeholder="-0.1278" required /></label>
            <label>Time zone <input type="text" id="oa-tz" placeholder="America/Chicago" /></label>
            <label>UTC offset <input type="text" id="oa-offset" placeholder="+00:00" /></label>
          </div>
          <button type="submit">See today’s reading</button>
        </form>
      </div>
    </div>`;
  $("#oa-setup").addEventListener("submit", (e) => {
    e.preventDefault();
    const acc = $("#oa-accuracy").value;
    const birth = {
      nickname: $("#oa-nickname").value.trim() || "My Chart",
      birth_date: $("#oa-date").value,
      birth_time: acc === "unknown" ? null : ($("#oa-time").value || null),
      time_accuracy: acc,
      latitude: parseFloat($("#oa-lat").value),
      longitude: parseFloat($("#oa-lon").value),
      timezone_name: $("#oa-tz").value.trim() || "UTC",
      utc_offset_at_birth: $("#oa-offset").value.trim() || "+00:00",
    };
    axisSetBirth(birth);
    axisLoadToday();
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
  const adv = AXIS.detail === "Advanced";
  $("#history-body").innerHTML = `<div class="history-list">${entries.map(f => `
    <details class="history-entry">
      <summary>
        <div class="history-entry__top">
          <span class="history-entry__date">${esc(f.fortune_date)}</span>
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
