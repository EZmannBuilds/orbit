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

test("birthplace autocomplete still exists on My Chart, Saved Charts, and onboarding forms", () => {
  for (const prefix of ["cf", "sc", "ob"]) {
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
