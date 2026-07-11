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
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.2 8.6l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12H21a2 2 0 1 1 0 4h-.09z"/>',
};
const icon = (name, cls = "rail__icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;

/* ── Workspace registry — the single source of the navigation model ────── */
const WORKSPACES = [
  { id: "dashboard", label: "Dashboard", crumb: "Overview", icon: "dashboard" },
  { id: "charts", label: "Charts", crumb: "Chart tools", icon: "charts" },
  { id: "transits", label: "Transits", crumb: "The moving sky", icon: "transits" },
  { id: "research", label: "Research", crumb: "Atlas & queries", icon: "research" },
  { id: "settings", label: "Settings", crumb: "Preferences", icon: "settings" },
];

/* ── Router ────────────────────────────────────────────────────────────── */
function buildRail() {
  $("#rail-nav").innerHTML = WORKSPACES.map(ws => `
    <a class="rail__link" id="tab-${ws.id}" role="tab" href="#${ws.id}" data-ws="${ws.id}"
       aria-controls="panel-${ws.id}" aria-selected="false">
      ${icon(ws.icon)}<span class="rail__label">${ws.label}</span>
    </a>`).join("");
}

function currentWorkspace() {
  const hash = location.hash.replace("#", "");
  return WORKSPACES.some(ws => ws.id === hash) ? hash : "dashboard";
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
  $("#workspace-crumb").textContent = `Orbit · ${ws.crumb}`;
  document.title = `Orbit — ${ws.label}`;
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

  await refreshData();
}

boot().catch(err => {
  $("#workspace").insertAdjacentHTML("afterbegin",
    `<div class="o-card" style="border-color:var(--color-error);color:var(--color-error);">
       <strong>Orbit failed to load.</strong> ${esc(err.message)}
     </div>`);
});
