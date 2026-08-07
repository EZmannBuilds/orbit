// Orbit Axis :: the redesign's own guarantees.
//
// WHY THIS FILE EXISTS. The redesign introduced three things the existing tests
// know nothing about, and each of them fails SILENTLY:
//
//   1. Icons are drawn from a generated module by NAME. A name with a typo, or
//      one removed from the build manifest, renders as an empty <svg> — a blank
//      space where a glyph should be, with no error anywhere.
//   2. The system allows exactly ONE accent colour. A second one creeping back
//      in looks fine in isolation and only reads as wrong beside the first.
//   3. The week strip on Today shows which days you have a reading for. If it
//      ever renders a day it cannot open, or invents one, the app is lying about
//      its own history — the failure a person would notice last and trust least.
//
// The icon check IMPORTS the module rather than grepping it, because a source
// string containing a name proves nothing about whether the name resolves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const html = read("public", "index.html");
const appJs = read("public", "app.js");
const tokensCss = read("public", "styles", "tokens.css");

// ── 1. Every icon the interface asks for exists ─────────────────────────────

test("every data-icon in the markup resolves to a real icon", async () => {
  const { ICON_PATHS } = await import("../public/icons.js");
  const asked = [...html.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(asked.length >= 15, `expected the markup to declare its icons, saw ${asked.length}`);
  for (const name of asked) {
    assert.ok(ICON_PATHS[name], `data-icon="${name}" has no icon — it would render as blank space`);
    assert.ok(ICON_PATHS[name].length > 0, `${name} resolved to empty path data`);
  }
});

test("every icon name the controller draws exists, in both weights where used", async () => {
  const { ICON_PATHS } = await import("../public/icons.js");

  // The navigation renders `icon(ws.icon)` AND `icon(`${ws.icon}-fill`)`, so a
  // destination whose icon has no solid variant loses its current-tab signal.
  const registry = appJs.slice(appJs.indexOf("const WORKSPACES = ["),
                              appJs.indexOf("];", appJs.indexOf("const WORKSPACES = [")));
  const navIcons = [...registry.matchAll(/primary: true[^}]*/g)].length
    ? [...registry.matchAll(/icon: "([a-z-]+)", primary: true/g)].map((m) => m[1])
    : [];
  assert.equal(navIcons.length, 5, "the five primary destinations each declare an icon");
  for (const name of navIcons) {
    assert.ok(ICON_PATHS[name], `the ${name} icon is missing`);
    assert.ok(ICON_PATHS[`${name}-fill`],
      `${name} has no solid variant — the current tab would keep the outline and read as inactive`);
  }

  // Every icon named in a workspace entry, primary or not.
  for (const [, name] of registry.matchAll(/icon: "([a-z-]+)"/g)) {
    assert.ok(ICON_PATHS[name], `workspace icon "${name}" does not exist`);
  }

  // The sky-event icon table.
  const events = appJs.slice(appJs.indexOf("const EVENT_ICONS = Object.freeze({"),
                             appJs.indexOf("});", appJs.indexOf("const EVENT_ICONS")));
  const eventIcons = [...events.matchAll(/: "([a-z-]+)",/g)].map((m) => m[1]);
  assert.ok(eventIcons.length >= 5, "every event kind needs an icon");
  for (const name of eventIcons) {
    assert.ok(ICON_PATHS[name], `event icon "${name}" does not exist`);
  }
  // Including the fallback, which is the one nobody tests by using the app.
  assert.ok(ICON_PATHS.sparkle, "the unknown-event fallback icon must exist");
});

test("the icon set carries no passengers", async () => {
  const { ICON_NAMES } = await import("../public/icons.js");
  // An icon nobody draws is bytes every visitor downloads and a name the next
  // person has to prove is unused before deleting. Solid variants are exempt:
  // they are drawn by a template string, not by a literal name.
  const source = `${html}\n${appJs}\n${read("public", "styles", "components.css")}`;
  const unused = ICON_NAMES.filter((name) =>
    !name.endsWith("-fill") && !source.includes(`"${name}"`));
  assert.deepEqual(unused, [], `these icons are in the bundle but nothing draws them: ${unused.join(", ")}`);
});

test("icons are inlined, so the interface needs no third-party request to draw itself", () => {
  const icons = read("public", "icons.js");
  assert.ok(!/https?:\/\//.test(icons.replace(/^[\s\S]*?\*\//, "")),
    "no icon may be fetched at runtime");
  assert.ok(!/@font-face[\s\S]{0,200}phosphor/i.test(read("public", "styles", "components.css")),
    "no icon font is loaded");
  // And the renderer supplies the stroke attributes, so the path data does not
  // repeat them 65 times.
  assert.match(appJs, /stroke-width="16"/, "outline icons are stroked on Phosphor's 256 grid");
});

// ── 2. One accent, and no decorative gradients ──────────────────────────────

test("both themes route every interactive signal through one accent", () => {
  for (const theme of ['dark', 'light']) {
    const block = tokensCss.slice(tokensCss.indexOf(`:root[data-theme="${theme}"] {`));
    const accent = /--color-accent: ([^;]+);/.exec(block)?.[1]?.trim();
    assert.ok(accent, `${theme} must define --color-accent`);
    // Its soft and border variants must be derived from the SAME hue, not
    // picked separately — that is how a second accent gets in.
    const soft = /--color-accent-soft: ([^;]+);/.exec(block)?.[1] ?? "";
    const border = /--color-accent-border: ([^;]+);/.exec(block)?.[1] ?? "";
    for (const [name, value] of [["soft", soft], ["border", border]]) {
      assert.match(value, /^rgba\(/, `--color-accent-${name} should be the accent at an alpha, saw "${value}"`);
    }
  }
});

test("no stylesheet reintroduces the retired decorative palette", () => {
  const retired = ["--axis-lavender", "--axis-indigo", "--axis-periwinkle", "--axis-pink"];
  const files = ["app", "auth", "base", "compatibility", "components", "features",
                 "fortune", "history", "legal", "more", "motion", "navigation",
                 "orbit-axis", "orbit-mark", "symbol-atlas"];
  for (const file of files) {
    const css = read("public", "styles", `${file}.css`);
    for (const name of retired) {
      assert.ok(!css.includes(name),
        `${file}.css uses ${name} — the system allows one accent, and these were four`);
    }
  }
});

test("the one shadow in the system is reserved for objects, not for interface", () => {
  assert.match(tokensCss, /--shadow-object: 3px 5px 30px 0 rgba\(0, 0, 0, 0\.22\)/,
    "the single product shadow is a token, so there can only be one of it");
  const components = read("public", "styles", "components.css");
  // Cards, tiles, rows, and buttons separate by surface tone and a hairline.
  for (const rule of [".o-card {", ".o-tile {", ".o-group {", ".o-btn {"]) {
    const start = components.indexOf(rule);
    assert.ok(start > -1, `${rule} should exist`);
    const block = components.slice(start, components.indexOf("}", start));
    assert.ok(!/box-shadow/.test(block), `${rule} must not carry a shadow`);
  }
});

// ── 3. The week strip tells the truth about your history ────────────────────

test("the week strip is built from real readings and never invents a day", () => {
  const fn = appJs.slice(appJs.indexOf("function axisRenderDayStrip"),
                         appJs.indexOf("function wireDayStrip"));
  assert.ok(fn.length > 0, "the renderer should exist");

  // It reads the history response and nothing else — no placeholder entries, no
  // generated readings.
  assert.match(fn, /f\.fortune_date/, "days are keyed by the reading's own date");
  assert.ok(!/Math\.random|placeholder|sample|lorem/i.test(fn), "nothing here may be invented");

  // Seven days, ending today. Never a future day: Orbit Axis calculates today's
  // sky, so offering tomorrow would offer something it cannot deliver.
  assert.match(fn, /let back = 6; back >= 0; back -= 1/, "seven days, ending today");
  assert.match(fn, /setDate\(today\.getDate\(\) - back\)/, "counted backwards from today");

  // Only a day with a reading is a control. A day without one is inert and says
  // so — a button that opens nothing reads as a bug.
  assert.match(fn, /if \(day\.reading\) \{[\s\S]{0,240}<button/,
    "a day with a reading is a button");
  assert.match(fn, /return `<span class="day-strip__day" data-state="\$\{state\}" aria-label/,
    "a day without one is a span, not a disabled button");
  assert.match(fn, /no reading saved/, "and it says why it does nothing");
});

test("the strip and the History page cannot disagree about which days you have", () => {
  // One request feeds both. Two requests would be two answers.
  const load = appJs.slice(appJs.indexOf("async function axisLoadHistory"),
                           appJs.indexOf("function axisRenderHistoryEmpty"));
  assert.match(load, /axisRenderDayStrip\(r\.fortunes \|\| \[\]\)/,
    "the strip renders from the same response the History page does");
  assert.equal((appJs.match(/\/api\/fortune\/history/g) || []).length, 1,
    "there is exactly one place that asks for your history");
});

test("every state of a day is announced, not left to the dot", () => {
  const fn = appJs.slice(appJs.indexOf("function axisRenderDayStrip"),
                         appJs.indexOf("function wireDayStrip"));
  for (const label of ["Today, ", "open your reading", "no reading saved"]) {
    assert.ok(fn.includes(label), `"${label}" must be part of the accessible name`);
  }
  assert.match(fn, /aria-current="date"/, "today is marked in the accessibility tree");
  const css = read("public", "styles", "orbit-axis.css");
  assert.match(css, /@media \(forced-colors: active\)[\s\S]{0,300}day-strip__day\[data-state="today"\]/,
    "and the states survive forced colours, where the tint disappears");
});

// ── 4. Touch targets survive ────────────────────────────────────────────────
//
// Walking every route at 375px and measuring found seven controls below the
// 44px minimum — the chart chip's selector at 20px, the Sky segmented control
// at 37px, every utility button at 36px, the History scope picker at 40px, the
// Atlas disclosures at 25px, and the legal link row at 21px. None of them looked
// wrong; they were all just slightly too small to hit with a thumb.
//
// Source assertions cannot measure a rendered box, so what they CAN pin is the
// rule that produced the fix. If someone removes the coarse-pointer block, this
// fails loudly instead of the app quietly going back to 36px targets.

test("compact controls come up to 44px on a touch pointer and on phone widths", () => {
  const components = read("public", "styles", "components.css");
  const start = components.indexOf("@media (pointer: coarse), (max-width: 1023px)");
  assert.ok(start > -1,
    "the touch-target block is gone — every compact control drops back to 36px");
  const block = components.slice(start, components.indexOf("@media (forced-colors", start));

  // BOTH conditions. `pointer: coarse` alone misses a narrow desktop window
  // showing the phone layout; the width query alone misses a touch laptop at
  // full width. Either on its own leaves a surface someone taps at 36px.
  assert.match(components.slice(start, start + 60), /\(pointer: coarse\), \(max-width: 1023px\)/);

  for (const selector of [".o-btn--utility", ".o-btn--sm", ".o-segment button", ".o-segment a"]) {
    assert.ok(block.includes(selector), `${selector} must be raised to 44px on touch`);
  }
  assert.match(block, /min-height: 44px/);
  // Native form controls too — they are the ones that look fine and measure 36.
  assert.match(block, /input\[type="date"\]/, "date and time pickers are targets as well");
});

test("controls that opt out of the global height supply their own", () => {
  // Two do, and both have to be checked by hand because the global rule cannot
  // reach them: the chart chip styles its selector as bare TEXT (it measured
  // 20px), and History gives its scope picker a compact pill.
  assert.match(read("public", "styles", "orbit-axis.css"),
    /\.chart-chip__select \{[\s\S]{0,400}min-height: 44px/,
    "the chart chip's selector reads as text but must target as a control");
  assert.match(read("public", "styles", "history.css"),
    /\.history-controls select \{[\s\S]{0,400}min-height: 44px/);
  // And the two that a flex parent turned from inline text into real controls.
  assert.match(read("public", "styles", "more.css"),
    /\.legal-links a \{[\s\S]{0,200}min-height: 44px/,
    "these are flex items, not inline prose — the WCAG 2.5.8 exemption does not apply");
  assert.match(read("public", "styles", "symbol-atlas.css"),
    /\.atlas-advanced summary,[\s\S]{0,300}min-height: 44px/);
});

test("native form controls inherit the one accent", () => {
  // Radios, checkboxes, and range thumbs are painted by the browser. Left alone
  // they keep the platform's blue and become a second accent the system never
  // chose — which is exactly what happened to the birth-time radio.
  assert.match(read("public", "styles", "base.css"), /accent-color: var\(--color-accent\)/);
});

// ── 5. One document-title format ────────────────────────────────────────────
//
// The browser tab is the only label some people ever see for a page — in a
// window of twenty tabs, or read aloud by a screen reader on switch. Two
// surfaces used to invert the format the moment they rendered ("Symbol Atlas —
// Orbit Axis", "Compatibility · Orbit Axis"), so the tab changed shape
// depending on what had finished loading.

test("every surface titles the tab the same way round", () => {
  const titles = [...appJs.matchAll(/document\.title = ([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(titles.length >= 3, `expected the title setters, found ${titles.length}`);
  for (const expression of titles) {
    // Every branch of every setter has to start with the product name. A
    // ternary is allowed; a branch that puts "Orbit Axis" last is not.
    const branches = expression.split(/\?|:/).map((b) => b.trim()).filter((b) => b.startsWith("`") || b.startsWith('"'));
    for (const branch of branches) {
      assert.match(branch, /^[`"]Orbit Axis — /,
        `a title branch reads ${branch} — every tab must start "Orbit Axis — "`);
    }
  }
});
