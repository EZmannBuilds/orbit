// Orbit Axis :: static frontend regression checks.
// The project has no browser/DOM test harness (deliberately dependency-free),
// so these are lightweight structural assertions against the served HTML/JS
// source — cheap protection against silently reintroducing the removed
// global search bar, losing birthplace autocomplete, or dropping the new
// Home markup this branch adds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
const appJs = readFileSync(join(ROOT, "public", "app.js"), "utf8");

test("the global search bar is gone from the top nav", () => {
  assert.ok(!html.includes('id="topnav-search"'), "topnav-search button should be removed");
  assert.ok(!html.includes("Search Orbit"), "the decorative search label should be removed");
  assert.ok(!appJs.includes("topnav-search"), "no leftover topnav-search listener");
});

test("the command palette (distinct from the removed search bar) still exists", () => {
  assert.ok(html.includes('id="cmd-overlay"'), "command palette overlay should remain");
  assert.ok(html.includes('id="rail-command"'), "rail Command launcher should remain");
});

test("birthplace autocomplete still exists on the shared chart modal and onboarding forms", () => {
  for (const prefix of ["cm", "ob"]) {
    assert.ok(html.includes(`id="${prefix}-place"`), `${prefix}-place input should still exist`);
    assert.ok(html.includes(`id="${prefix}-place-results"`), `${prefix}-place-results should still exist`);
  }
  assert.ok(appJs.includes("setupPlaceSearch"), "setupPlaceSearch wiring should still exist");
});

test("Home has a saved-chart selector wired to the activate endpoint", () => {
  assert.ok(html.includes('id="today-chart-picker"'));
  assert.ok(html.includes('id="today-chart-select"'));
  assert.ok(appJs.includes("axisWireChartPicker"));
  assert.ok(appJs.includes("/activate"));
  assert.match(appJs, /today-chart-manage[\s\S]*navigate\("me"\)/, "Home Manage should route to Me");
});

test("Me is the dedicated natal chart and saved-chart management page", () => {
  assert.ok(html.includes('id="panel-me"'), "Me panel exists");
  assert.ok(html.includes('id="me-overview"'), "active overview exists");
  assert.ok(html.includes('id="bigthree"'), "Big Three mount exists");
  assert.ok(html.includes('id="key-placements"'), "key placements mount exists");
  assert.ok(html.includes("The Keys to Your Chart"), "chart keys heading exists");
  assert.ok(html.includes(">Planets<"), "planets heading exists");
  assert.ok(html.includes('id="me-saved-charts-list"'), "Saved Charts list lives on Me");
  assert.ok(html.includes('id="me-add-chart"') && html.includes('id="me-saved-chart-add"'), "Me add chart actions exist");
  assert.ok(!html.includes('id="chart-form"'), "old Me chart form should not be the primary surface");
  assert.ok(!html.includes('id="saved-chart-form"'), "old More saved-chart form should be removed");
  assert.ok(html.includes('data-goto="me"'), "More routes saved-chart management to Me");
});

test("Me renderer exposes beginner and advanced chart sections", () => {
  assert.match(appJs, /function renderMeOverview/);
  assert.match(appJs, /function renderBigThree/);
  assert.match(appJs, /function renderKeyPlacements/);
  assert.match(appJs, /function renderPlacements/);
  for (const label of ["All planetary placements", "Houses", "Major aspects", "Angles", "Elements, modalities, and retrogrades"]) {
    assert.ok(appJs.includes(label), `${label} disclosure should render`);
  }
  assert.ok(appJs.includes("Mercury") && appJs.includes("Communication and thinking"));
  assert.ok(appJs.includes("Venus") && appJs.includes("Attraction, taste, and relating"));
  assert.ok(appJs.includes("Mars") && appJs.includes("Drive, conflict, and action"));
  assert.ok(appJs.includes("Uranus") && appJs.includes("Change, freedom, and disruption"));
  assert.ok(appJs.includes("Neptune") && appJs.includes("Dreams, intuition, and ideals"));
  assert.ok(appJs.includes("Pluto") && appJs.includes("Power, depth, and transformation"));
});

test("Me chart keys render Rising, Sun, and Moon before planets", () => {
  assert.match(appJs, /const CHART_KEY_PLACEMENTS = \["Rising", "Sun", "Moon"\]/);
  assert.match(appJs, /CHART_KEY_PLACEMENTS\.map\(\(name\) => placementCardHtml\(chart, name, \{ group: "keys" \}\)\)/);
});

test("Me planet grid renders all eight remaining major planets in stable order", () => {
  assert.match(appJs, /const PLANET_GRID_PLACEMENTS = \["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"\]/);
  assert.match(appJs, /const STANDARD_PLANET_ORDER = \["Sun", "Moon", \.\.\.PLANET_GRID_PLACEMENTS\]/);
  assert.match(appJs, /PLANET_GRID_PLACEMENTS\.map\(\(name\) => placementCardHtml\(chart, name, \{ group: "planets" \}\)\)/);
});

test("Placement cards use real chart data for sign, degree, house, and retrograde state", () => {
  assert.match(appJs, /chart\?\.planets\?\.\[name\]/, "planet cards should read from calculated planets");
  assert.match(appJs, /reliableHouseLabel\(chart, name\)/, "planet cards should use reliable house labels");
  assert.match(appJs, /degLabel\(body\)/, "planet cards should show calculated degree labels");
  assert.match(appJs, /body\.retrograde \? " · Retrograde" : ""/, "retrograde state should render in card metadata");
});

test("Unknown birth time never fabricates Rising or house data in Me placements", () => {
  assert.ok(appJs.includes("Rising unavailable"));
  assert.ok(appJs.includes("Birth time needed"));
  assert.ok(appJs.includes("House unavailable"));
  assert.match(appJs, /if \(!chart\?\.time_known\) return "House unavailable"/);
});

test("Me communicates birth-time reliability states", () => {
  assert.ok(html.includes("Exact birth time"));
  assert.ok(html.includes("Approximate birth time"));
  assert.ok(html.includes("Unknown birth time"));
  assert.ok(appJs.includes("Reported birth time"));
  assert.ok(appJs.includes("Your Rising sign and houses may shift because the birth time is approximate."));
  assert.ok(appJs.includes("A birth time is needed to calculate your Rising sign and houses reliably."));
  assert.ok(appJs.includes("Moon may shift signs without a birth time."));
});

test("Simple mode hides Me advanced sections while Advanced exposes them", () => {
  const css = readFileSync(join(ROOT, "public", "styles", "orbit-axis.css"), "utf8");
  assert.match(css, /data-detail="Simple"[\s\S]*\.me-panel--advanced/);
  assert.match(css, /not\(\[data-detail="Advanced"\]\)[\s\S]*\.advanced-only/);
  assert.ok(appJs.includes("renderMeOverview(state.activeProfile, state.activeNatalChart"), "detail toggles refresh Me mode text");
  assert.ok(appJs.includes("PLANET_GRID_PLACEMENTS"), "Simple mode should keep all planets in the primary grid");
  assert.ok(appJs.includes("placement-card__tech advanced-only"), "Advanced mode should add technical card detail without replacing the grid");
});

test("Placement cards are concise buttons that open an accessible detail dialog", () => {
  assert.ok(html.includes('id="placement-detail-modal"'));
  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('id="placement-detail-close"'));
  assert.match(appJs, /function wirePlacementDetails/);
  assert.match(appJs, /openPlacementDetail\(button\)/);
  assert.match(appJs, /openModal\(modal, \{ initialFocus: \$\("#placement-detail-close"\) \}\)/);
  assert.match(appJs, /button\.focus\(\{ preventScroll: true \}\)/, "focus should restore to the triggering card through the modal utility");
  assert.doesNotMatch(appJs, /<p>\$\{esc\(info\.meaning\)\}<\/p>/, "full paragraphs should not live inside every grid card");
});

test("Placement detail includes simple, advanced, and reliability content", () => {
  assert.ok(appJs.includes("Simple interpretation"));
  assert.ok(appJs.includes("Advanced notes"));
  assert.ok(appJs.includes("TIME_ACCURACY_COPY.reported.note"));
  assert.ok(appJs.includes("TIME_ACCURACY_COPY.approximate.note"));
  assert.ok(appJs.includes("TIME_ACCURACY_COPY.unknown.note"));
});

test("Me placement grid has responsive one, two, and three column rules without horizontal scroll", () => {
  const css = readFileSync(join(ROOT, "public", "styles", "features.css"), "utf8");
  assert.match(css, /\.placement-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /min-width: 641px[\s\S]*\.placement-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /min-width: 961px[\s\S]*\.placement-grid--planets \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.ok(css.includes("overflow-wrap: anywhere"), "long placement titles should wrap inside cards");
  const baseCss = readFileSync(join(ROOT, "public", "styles", "base.css"), "utf8");
  assert.ok(baseCss.includes("overflow-x: hidden"));
});

test("Me chart actions reuse the existing saved-chart endpoints and confirmation", () => {
  assert.match(appJs, /handleSavedChartAction/);
  assert.match(appJs, /\/api\/charts\/\$\{id\}\/activate/);
  assert.match(appJs, /state\.activeChartId = previousId/, "activation failure should roll back visible state");
  assert.match(appJs, /confirmDialog\(/, "delete should use shared accessible confirmation");
  assert.match(appJs, /confirmEmpty=true/, "final chart deletion should use existing confirmation path");
  assert.match(appJs, /openChartModal\(chart\)/, "edit should reuse shared chart modal");
});

test("Me saved-chart failure has Retry and is never an empty state", () => {
  const renderSaved = appJs.slice(appJs.indexOf("function renderSavedCharts"));
  assert.match(renderSaved, /retry-charts/);
  assert.match(renderSaved, /We couldn't load your saved charts/);
  const errorBranchStart = renderSaved.indexOf('chartsStatus === "error"');
  const emptyBranchStart = renderSaved.indexOf("if (!state.charts.length)", errorBranchStart);
  assert.ok(errorBranchStart >= 0 && emptyBranchStart > errorBranchStart, "error and empty branches should both exist");
  assert.doesNotMatch(renderSaved.slice(errorBranchStart, emptyBranchStart), /No saved charts yet/);
});

test("Today's Fortune renders as cards, with no carousel left behind", () => {
  // Update 5.2 replaced the carousel. It hid four of five readings behind a
  // swipe with only a row of dots to suggest it existed.
  for (const relic of ["fortune-carousel", "fortune-prev", "fortune-next", "fortune-dots",
                       "axisMoveCarousel", "axisSetCarouselIndex", "axisPaintCarouselCard"]) {
    assert.ok(!appJs.includes(relic), `${relic} should be gone`);
  }
  assert.ok(appJs.includes("axisFortuneCards"), "the card builder should exist");
  assert.ok(appJs.includes("fortune-grid"), "cards should be laid out as a grid");
});

test("the fortune title appears above the cards", () => {
  // Order in the source is order in the document: the day gets a name before
  // it gets detail.
  const head = appJs.indexOf("fortune-head__title");
  const grid = appJs.indexOf('<div class="fortune-grid">');
  assert.ok(head > 0 && grid > 0, "both the title and the grid should render");
  assert.ok(head < grid, "the title must be emitted before the card grid");
});

test("the main fortune copy never names a planet", () => {
  // The readings come from mood / love_reading / luck_reading / watch_out,
  // which are plain language by construction. Technical phrasing belongs to
  // Technical Sky, which reads factors[].advanced instead.
  const start = appJs.indexOf("function axisFortuneCards");
  const end = appJs.indexOf("function axisFortuneDate");
  const cardSource = appJs.slice(start, end);
  // Word boundaries matter: without them "orb" matches inside "Orbit" and the
  // test fails on its own explanatory comment rather than on any real content.
  for (const term of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "retrograde",
                      "house", "aspect", "degrees", "orb"]) {
    assert.ok(!new RegExp(`\\b${term}\\b`, "i").test(cardSource),
      `the fortune cards must not reference "${term}" — that belongs in Technical Sky`);
  }
});

test("no swipe or arrow-key handler remains for the fortune", () => {
  assert.ok(!appJs.includes("axisWireFortuneCarousel"));
  // The swipe threshold comment and handlers were the only touch wiring here.
  const fortuneRegion = appJs.slice(appJs.indexOf("Today's Fortune: cards"),
                                    appJs.indexOf("function axisRenderSky"));
  assert.ok(!/touchstart|touchend|ArrowLeft|ArrowRight/.test(fortuneRegion),
    "the fortune should need no gesture or key handling at all");
});

test("Tonight's Moon (the standalone Home card) is gone; Current Sky is unified", () => {
  assert.ok(!html.includes('id="today-moon"'), "the separate Tonight's Moon mount point should be removed");
  assert.ok(!appJs.includes("axisRenderMoon"), "the standalone moon renderer should be removed");
  assert.ok(appJs.includes("axisRenderSky"));
  assert.ok(html.includes('id="today-sky"'), "the unified Current Sky mount point should exist");
});

test("the procedural Moon module is imported and never calls an external image API", () => {
  assert.ok(appJs.includes('from "./moon-phase.js"'));
  const moonPhaseJs = readFileSync(join(ROOT, "public", "moon-phase.js"), "utf8");
  assert.ok(!/https?:\/\//.test(moonPhaseJs));
});

test("current-timezone handling never falls back to a manual UTC-offset field", () => {
  assert.ok(!html.includes('type="text" id="cf-tz-offset"'));
  assert.ok(appJs.includes("resolvedOptions().timeZone"), "should detect the device IANA timezone");
  assert.ok(appJs.includes("axisSyncCurrentTimezone"));
});

test("current-location is opt-in only (no geolocation call on load)", () => {
  const bootMatch = appJs.match(/async function boot\(\)[\s\S]*?\n}\n/);
  assert.ok(bootMatch, "boot() should be found");
  assert.ok(!bootMatch[0].includes("geolocation"), "boot() must not call geolocation directly");
  assert.ok(appJs.includes("navigator.geolocation"), "geolocation should still be used, just not on load");
  assert.ok(appJs.includes("current-sky-use-location"));
});

test("Home puts Today's Fortune above Technical Sky", () => {
  // The reading is what someone opened the app for; the technical section
  // explains it. Reversing them made Orbit open on planetary positions.
  const fortune = html.indexOf('id="today-fortune"');
  const sky = html.indexOf('id="today-sky"');
  assert.ok(fortune > 0 && sky > 0, "both Home mount points should exist");
  assert.ok(fortune < sky, "the fortune must be rendered before Technical Sky");
});

test("Technical Sky is named as such and shows positions without a mode switch", () => {
  assert.ok(appJs.includes("Technical Sky"), "the section should be named Technical Sky");
  assert.ok(appJs.includes("sky-technical__title"), "positions table should always render");
  // The old gate read AXIS.detail === "Advanced" before showing positions.
  assert.ok(!appJs.includes('AXIS.detail === "Advanced"'),
    "positions must not be gated behind a detail level any more");
});

test("the season is stated once, not twice", () => {
  // "Cancer Season" and "Sun in Cancer" were the same fact in two chips.
  assert.ok(!/Sun in \$\{esc\(sky\.sun\.sign\)\}/.test(appJs),
    "the redundant 'Sun in <sign>' chip should be gone");
  assert.ok(appJs.includes("Season</span>"), "the season chip should remain");
});

test("no Simple/Advanced control survives anywhere", () => {
  for (const relic of ['data-level="Simple"', 'data-level="Advanced"', 'axis-detail']) {
    assert.ok(!html.includes(relic), `${relic} should be gone from the markup`);
  }
  assert.ok(!appJs.includes("axisSetDetail(") || !html.includes("axis-detail"),
    "no visible control should call the detail setter");
});

test("a stored Simple preference cannot hide content", () => {
  // Backward compatibility: the saved value is read but not obeyed, and is
  // deliberately not deleted.
  assert.match(appJs, /AXIS\.detail = "Advanced"/,
    "loading should resolve to the complete experience regardless of what is stored");
  assert.match(appJs, /return "advanced"/,
    "detailKeyFor should always select the advanced phrasing");
});
