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
  wireMyChart();
  loadMoonTonight();
  await loadLocalIntelligence();

  $("#disclaimer").textContent = `${chart.disclaimer} Sky timing is computed from mean cycles and is approximate.`;
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
