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
  assert.ok(appJs.includes("Mercury") && appJs.includes("communication and thinking"));
  assert.ok(appJs.includes("Venus") && appJs.includes("attraction, taste, and relating"));
  assert.ok(appJs.includes("Mars") && appJs.includes("drive, conflict, and action"));
});

test("Me communicates birth-time reliability states", () => {
  assert.ok(html.includes("Exact birth time"));
  assert.ok(html.includes("Approximate birth time"));
  assert.ok(html.includes("Unknown birth time"));
  assert.ok(appJs.includes("Your Rising sign and houses may shift because the birth time is approximate."));
  assert.ok(appJs.includes("A birth time is needed to calculate your Rising sign and houses reliably."));
  assert.ok(appJs.includes("Moon may shift signs without a birth time."));
});

test("Simple mode hides Me advanced sections while Advanced exposes them", () => {
  const css = readFileSync(join(ROOT, "public", "styles", "orbit-axis.css"), "utf8");
  assert.match(css, /data-detail="Simple"[\s\S]*\.me-panel--advanced/);
  assert.match(css, /not\(\[data-detail="Advanced"\]\)[\s\S]*\.advanced-only/);
  assert.ok(appJs.includes("renderMeOverview(state.activeProfile, state.activeNatalChart"), "detail toggles refresh Me mode text");
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

test("Today's Fortune renders as a carousel with all required controls", () => {
  assert.ok(appJs.includes("fortune-carousel"));
  assert.ok(appJs.includes("fortune-prev") && appJs.includes("fortune-next"));
  assert.ok(appJs.includes("fortune-dots"));
  assert.ok(appJs.includes("ArrowLeft") && appJs.includes("ArrowRight"));
  assert.ok(appJs.includes("touchstart") && appJs.includes("touchend"));
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
