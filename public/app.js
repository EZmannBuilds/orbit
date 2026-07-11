const $ = (selector) => document.querySelector(selector);

const state = { symbols: [], chart: null, activeKind: "", proposal: null };

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
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

// ── Today's sky ──────────────────────────────────────────────────────────────
function renderSky(chart) {
  const { sun, moon, mercury, symbol_of_the_day: daySymbol } = chart;

  $("#card-sun").innerHTML = `
    <div class="sky-eyebrow">Sun Season</div>
    <div class="sky-main"><span class="sky-glyph">${esc(sun.glyph)}</span>
      <div><div class="sky-title">${esc(sun.name)}</div>
      <div class="sky-sub">${esc(sun.element)} · ${esc(sun.modality)} · ruled by ${esc(sun.ruling_planet)}</div></div></div>
    <div class="sky-sub">${sun.progress_pct}% through the season · ${esc(sun.next_sign)} begins ${esc(sun.season_ends)}</div>
    <div class="progress"><span style="width:${sun.progress_pct}%"></span></div>`;

  $("#card-moon").innerHTML = `
    <div class="sky-eyebrow">Moon</div>
    <div class="sky-main"><span class="sky-glyph">${esc(moon.glyph)}</span>
      <div><div class="sky-title">${esc(moon.phase)}</div>
      <div class="sky-sub">${moon.illumination_pct}% illuminated · ${moon.waxing ? "waxing" : "waning"}</div></div></div>
    <div class="sky-sub">Next full ${esc(moon.next_full_moon)} · next new ${esc(moon.next_new_moon)}</div>`;

  $("#card-mercury").innerHTML = `
    <div class="sky-eyebrow">Mercury</div>
    <div class="sky-main"><span class="sky-glyph">☿</span>
      <div><div class="sky-title">${mercury.retrograde ? "Retrograde" : "Direct"}</div>
      <span class="badge ${mercury.retrograde ? "rx" : "direct"}">${mercury.retrograde ? "℞ review mode" : "clear lanes"}</span></div></div>
    <div class="sky-sub">${esc(mercury.message)}</div>`;

  $("#card-symbol").innerHTML = `
    <div class="sky-eyebrow">Symbol of the Day</div>
    <div class="sky-main"><span class="sky-glyph">${esc(daySymbol.glyph)}</span>
      <div><div class="sky-title">${esc(daySymbol.name)}</div>
      <div class="sky-sub">${esc(daySymbol.kind.replace("_", " "))}</div></div></div>
    <div class="sky-sub">${esc(daySymbol.interpretation)}</div>`;
}

// ── Zodiac wheel ─────────────────────────────────────────────────────────────
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
  const signs = state.symbols.filter(symbol => symbol.kind === "zodiac_sign");
  const svg = $("#zodiac-wheel");
  const cx = 160, cy = 160, rOuter = 150, rInner = 92;
  let markup = "";

  signs.forEach((sign, index) => {
    const start = index * 30, end = start + 30;
    markup += `<path class="seg" data-slug="${sign.slug}" d="${segmentPath(cx, cy, rOuter, rInner, start, end)}"><title>${esc(sign.name)}</title></path>`;
    const [gx, gy] = polar(cx, cy, (rOuter + rInner) / 2, start + 15);
    markup += `<text class="seg-glyph" x="${gx}" y="${gy}" text-anchor="middle" dominant-baseline="central">${sign.glyph}</text>`;
  });

  const sunGlyph = state.chart?.sun?.glyph ?? "☉";
  markup += `<circle class="hub" cx="${cx}" cy="${cy}" r="${rInner - 14}" />`;
  markup += `<text class="hub-glyph" x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="central">${sunGlyph}</text>`;
  markup += `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="10" fill="#9aa3d0" letter-spacing="2">NOW</text>`;

  svg.innerHTML = markup;

  svg.querySelectorAll(".seg").forEach(segment => {
    segment.addEventListener("click", () => {
      svg.querySelectorAll(".seg").forEach(other => other.classList.remove("active"));
      segment.classList.add("active");
      const sign = signs.find(entry => entry.slug === segment.dataset.slug);
      $("#wheel-detail").innerHTML = `
        <strong>${esc(sign.name)} ${esc(sign.glyph)}</strong> · ${esc(sign.date_range)} ·
        ${esc(sign.element)} ${esc(sign.modality)}, ruled by ${esc(sign.ruling_planet)}.<br/>
        ${esc(sign.interpretation)}`;
    });
  });

  // Preselect the current sun sign
  const currentSlug = state.chart?.sun?.sign;
  if (currentSlug) svg.querySelector(`.seg[data-slug="${currentSlug}"]`)?.dispatchEvent(new Event("click"));
}

// ── Atlas ────────────────────────────────────────────────────────────────────
function renderAtlas() {
  const symbols = state.activeKind
    ? state.symbols.filter(symbol => symbol.kind === state.activeKind)
    : state.symbols;

  $("#atlas").innerHTML = symbols.map(symbol => `
    <div class="symbol-card">
      <div class="symbol-top">
        <span class="symbol-glyph">${esc(symbol.glyph)}</span>
        <span class="symbol-name">${esc(symbol.name)}</span>
        <span class="symbol-kind">${esc(symbol.kind.replace("_", " "))}</span>
      </div>
      ${symbol.date_range ? `<div class="symbol-meta">${esc(symbol.date_range)} · ${esc(symbol.element)} ${esc(symbol.modality)} · ${esc(symbol.ruling_planet)}</div>` : ""}
      <div class="symbol-text">${esc(symbol.interpretation)}</div>
      <div class="symbol-keywords">${(symbol.keywords ?? []).map(keyword => `<span>${esc(keyword)}</span>`).join("")}</div>
    </div>`).join("");
}

// ── Events ───────────────────────────────────────────────────────────────────
function renderEvents(events) {
  $("#events").innerHTML = events.map(event => `
    <div class="event-row">
      <div class="event-date">${esc(event.date)}</div>
      <div>
        <div class="event-title">${esc(event.title)}</div>
        <div class="event-detail">${esc(event.detail)}</div>
      </div>
    </div>`).join("");
}

// ── Tools ────────────────────────────────────────────────────────────────────
function wireTools() {
  const signs = state.symbols.filter(symbol => symbol.kind === "zodiac_sign");
  for (const id of ["#compat-a", "#compat-b"]) {
    $(id).innerHTML = signs.map(sign => `<option value="${sign.slug}">${sign.glyph} ${esc(sign.name)}</option>`).join("");
  }
  $("#compat-b").selectedIndex = 4;

  $("#birth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = $("#birth-date").value;
    if (!value) return;
    const [, month, day] = value.split("-").map(Number);
    const data = await get(`/api/sign-for-date?month=${month}&day=${day}`);
    $("#birth-result").innerHTML = `<strong>${esc(data.sign.name)} ${esc(data.sign.glyph)}</strong> — ${esc(data.summary)}`;
  });

  $("#compat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = await get(`/api/compatibility?a=${$("#compat-a").value}&b=${$("#compat-b").value}`);
    $("#compat-result").innerHTML = `
      <span class="score">${data.harmony_score}/100</span> symbolic harmony<br/>
      <strong>${esc(data.a.name)} × ${esc(data.b.name)}</strong> — ${esc(data.note)}.
      ${data.aspect ? `<br/>${esc(data.aspect.name)} ${esc(data.aspect.glyph)}: ${esc(data.aspect.interpretation)}` : ""}`;
  });

  $("#query-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = $("#query-input").value.trim();
    if (!prompt) return;
    $("#query-result").textContent = "Consulting the atlas…";
    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await response.json();
    $("#query-result").innerHTML = `${esc(data.reply)}<br/><small style="color:var(--dim)">algorithm: ${esc(data.algorithm)}</small>`;
  });

  $("#atlas-filters").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    document.querySelectorAll("#atlas-filters button").forEach(other => other.classList.remove("active"));
    button.classList.add("active");
    state.activeKind = button.dataset.kind;
    renderAtlas();
  });
}

// ── Local Intelligence ──────────────────────────────────────────────────────
async function loadLocalIntelligence() {
  try {
    const data = await get("/api/local-llm/status");
    $("#llm-status").textContent = data.ok ? "Connected" : (data.message || "Unavailable");
    $("#llm-model").textContent = data.selected_model || data.configured_model || "No model selected";
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
  }
}

function renderIntelResult(data) {
  const response = data.response || {};
  $("#intel-output").innerHTML = `<strong>Answer</strong><br/>${esc(response.answer || "No answer returned.")}`;
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
    </div>
    <pre>${esc(proposal.diff_text || "")}</pre>
    <div class="proposal-actions">
      <button type="button" data-action="approve">Approve</button>
      <button type="button" data-action="reject">Reject</button>
      <button type="button" data-action="apply">Apply</button>
    </div>`;
  $("#proposal-panel").querySelector(".proposal-actions").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    const result = await post(`/api/vault/edit-proposals/${proposal.id}/${action}`, {});
    $("#proposal-status").textContent = result.proposal?.status || result.logRecord?.status || action;
  });
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  $("#topbar-date").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const [chart, symbolsData, eventsData] = await Promise.all([
    get("/api/chart/now"),
    get("/api/symbols"),
    get("/api/events?count=9"),
  ]);

  state.chart = chart;
  state.symbols = symbolsData.symbols;

  renderSky(chart);
  renderWheel();
  renderAtlas();
  renderEvents(eventsData.events);
  wireTools();
  await loadLocalIntelligence();

  $("#disclaimer").textContent = `${chart.disclaimer} Sky timing is computed from mean cycles and is approximate.`;
}

boot().catch(err => {
  document.querySelector("main").insertAdjacentHTML("afterbegin",
    `<div class="card" style="border-color:#7a2d44;color:#ff8fa8">Orbit failed to load: ${esc(err.message)}</div>`);
});
