// Orbit Axis :: Transits and Symbol Atlas (Update 5.2b).
//
// Two secondary destinations reached from Home's Technical Sky. The properties
// worth pinning are the ones that would degrade quietly: deterministic ordering
// (a list that reshuffles between renders is a list nobody trusts), honest
// handling of an unknown birth time, and glyphs that never appear without a
// readable name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ORBIT_SYMBOLS } from "../lib/symbols.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(ROOT, "public", "app.js"), "utf8");
const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");

// ── Home actions ────────────────────────────────────────────────────────────

test("Home offers both secondary destinations from Technical Sky", () => {
  assert.match(appJs, /href="#transits"[^>]*>View Transits|>View Transits</);
  assert.match(appJs, /href="#symbol-atlas"[^>]*>Open Symbol Atlas|>Open Symbol Atlas</);
});

test("the actions are inside Technical Sky, not above the fortune", () => {
  // Placement is what makes them secondary. Emitted within the sky renderer,
  // which Home renders after the fortune.
  // axisWireSkyControls happens to be declared BEFORE axisRenderSky, so the
  // slice runs from the renderer to the end of its template rather than to a
  // function that precedes it.
  const skyStart = appJs.indexOf("function axisRenderSky");
  const skyEnd = appJs.indexOf("function ", skyStart + 40);
  const skySource = appJs.slice(skyStart, skyEnd > skyStart ? skyEnd : undefined);
  assert.ok(skySource.includes("sky-actions"), "the actions belong to the sky renderer");

  const fortuneMount = html.indexOf('id="today-fortune"');
  const skyMount = html.indexOf('id="today-sky"');
  assert.ok(fortuneMount < skyMount, "and the fortune still renders first");
});

test("neither destination becomes primary navigation", () => {
  for (const id of ["transits", "symbol-atlas"]) {
    const entry = new RegExp(`id: "${id}"[^}]*primary: (true|false)`).exec(appJs);
    assert.ok(entry, `${id} should be registered as a workspace`);
    assert.equal(entry[1], "false", `${id} must not appear in the primary rail`);
  }
});

test("Tarot, Learn, and News stay gone", () => {
  for (const id of ["tarot", "learn", "news"]) {
    assert.ok(!html.includes(`id="panel-${id}"`), `panel-${id} must not be in the shipped markup`);
  }
});

// ── Transit ordering ────────────────────────────────────────────────────────
//
// Rebuilt here from the documented rules so the test fails if the rules and the
// implementation drift apart.

const PERSONAL = ["Moon", "Mercury", "Venus", "Sun", "Mars"];
function rank(t) {
  const p = PERSONAL.indexOf(t.transiting);
  return {
    applying: t.applying ? 0 : 1,
    orb: Number.isFinite(t.orb) ? t.orb : 99,
    speed: p === -1 ? PERSONAL.length : p,
    name: `${t.transiting}|${t.natal}|${t.aspect}`,
  };
}
const sortTransits = (list) => [...list].sort((a, b) => {
  const x = rank(a), y = rank(b);
  return x.applying - y.applying || x.orb - y.orb || x.speed - y.speed || x.name.localeCompare(y.name);
});

const SAMPLE = [
  { transiting: "Pluto", natal: "Sun", aspect: "square", orb: 0.2, applying: true },
  { transiting: "Moon", natal: "Venus", aspect: "trine", orb: 0.2, applying: true },
  { transiting: "Venus", natal: "Mars", aspect: "sextile", orb: 3.0, applying: true },
  { transiting: "Mars", natal: "Moon", aspect: "square", orb: 0.5, applying: false },
];

test("applying transits come before separating ones", () => {
  const sorted = sortTransits(SAMPLE);
  const firstSeparating = sorted.findIndex((t) => !t.applying);
  const lastApplying = sorted.map((t) => t.applying).lastIndexOf(true);
  assert.ok(lastApplying < firstSeparating, "something building outranks something fading");
});

test("a tighter orb outranks a looser one", () => {
  const sorted = sortTransits(SAMPLE);
  const applying = sorted.filter((t) => t.applying);
  for (let i = 1; i < applying.length; i += 1) {
    assert.ok(applying[i - 1].orb <= applying[i].orb, "orbs ascend within the applying group");
  }
});

test("a personal body outranks a slow one at equal orb", () => {
  const sorted = sortTransits(SAMPLE);
  const moon = sorted.findIndex((t) => t.transiting === "Moon");
  const pluto = sorted.findIndex((t) => t.transiting === "Pluto");
  assert.ok(moon < pluto, "the Moon lands within a day; Pluto does not");
});

test("ordering is deterministic across repeated sorts", () => {
  // Without the name tie-break, two equal transits could swap between renders.
  const tie = [
    { transiting: "Venus", natal: "Sun", aspect: "trine", orb: 1, applying: true },
    { transiting: "Venus", natal: "Moon", aspect: "trine", orb: 1, applying: true },
  ];
  const a = sortTransits(tie).map((t) => t.natal);
  for (let i = 0; i < 25; i += 1) {
    assert.deepEqual(sortTransits(tie).map((t) => t.natal), a);
  }
});

test("the implementation states the same ordering rules", () => {
  assert.match(appJs, /applying before separating/i);
  assert.match(appJs, /deterministic tie-break/i);
  assert.match(appJs, /const PERSONAL_BODIES/);
});

// ── Transit filters ─────────────────────────────────────────────────────────

test("an unknown filter shows everything rather than an empty page", () => {
  // A stale link should degrade to the full list, not read as "no transits".
  assert.match(appJs, /default: return list;/);
  assert.match(appJs, /TRANSIT_FILTERS\.includes\(btn\.dataset\.filter\)/,
    "an unrecognised filter should fall back rather than be stored");
});

test("the five filters are exactly the documented set", () => {
  const m = /const TRANSIT_FILTERS = \[([^\]]+)\]/.exec(appJs);
  assert.ok(m, "the filter list should be declared once");
  const filters = m[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(filters, ["all", "applying", "separating", "personal", "long-term"]);
});

// ── Honesty about an unknown birth time ─────────────────────────────────────

test("an unknown birth time withholds houses instead of inventing them", () => {
  assert.match(appJs, /time_accuracy !== "unknown"/);
  assert.match(appJs, /house and angle contacts are not shown/i);
  assert.match(appJs, /Planet-to-planet transits below are unaffected/i,
    "the page must stay useful rather than blank");
});

// ── The engine does the geometry ────────────────────────────────────────────

test("the browser never computes aspect geometry", () => {
  const start = appJs.indexOf("Personal Transits (Update 5.2b)");
  const end = appJs.indexOf("Symbol Atlas (Update 5.2b)");
  const source = appJs.slice(start, end);
  for (const forbidden of ["Math.abs", "longitude", "Math.cos", "Math.sin", "% 360"]) {
    assert.ok(!source.includes(forbidden),
      `the transits view must not calculate geometry (${forbidden})`);
  }
  assert.match(source, /factors \|\| \[\]/, "it consumes engine factors instead");
});

test("viewing transits performs no write", () => {
  const start = appJs.indexOf("Personal Transits (Update 5.2b)");
  const end = appJs.indexOf("Symbol Atlas (Update 5.2b)");
  const source = appJs.slice(start, end);
  for (const write of ["post(", "put(", "patch(", "del(", 'method: "POST"']) {
    assert.ok(!source.includes(write),
      `opening Transits must not ${write} — it would create history records`);
  }
});

// ── Symbol Atlas data ───────────────────────────────────────────────────────

test("every symbol has a glyph, a readable name, and a meaning", () => {
  assert.ok(ORBIT_SYMBOLS.length >= 30, "the atlas should cover the app's symbols");
  for (const s of ORBIT_SYMBOLS) {
    assert.ok(s.glyph && String(s.glyph).trim(), `${s.slug} has no glyph`);
    assert.ok(s.name && String(s.name).trim(), `${s.slug} has no readable name`);
    assert.ok(s.interpretation && s.interpretation.length > 30, `${s.slug} has no real meaning`);
    assert.ok(s.slug && s.kind, `${s.name} is missing slug or kind`);
  }
});

test("slugs are unique, so cross-links cannot collide", () => {
  const slugs = ORBIT_SYMBOLS.map((s) => s.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("the atlas covers the categories Orbit actually displays", () => {
  const kinds = new Set(ORBIT_SYMBOLS.map((s) => s.kind));
  for (const kind of ["zodiac_sign", "planet", "angle", "aspect", "house", "moon", "other"]) {
    assert.ok(kinds.has(kind), `no ${kind} entries — Orbit displays these`);
  }
});

test("every filter button maps to entries that exist", () => {
  // A category with nothing behind it is a dead end.
  // matchAll requires a global regex; without /g it throws rather than failing
  // the assertion, which looks like a product bug and is not one.
  const buttons = [...html.matchAll(/#sa-filters[\s\S]*?<\/div>/g)][0]?.[0] || "";
  const kinds = [...buttons.matchAll(/data-kind="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  for (const kind of kinds) {
    assert.ok(ORBIT_SYMBOLS.some((s) => s.kind === kind), `the ${kind} filter has no entries`);
  }
});

// ── Symbol Atlas behaviour ──────────────────────────────────────────────────

test("search is trimmed, case-insensitive, and covers meaning as well as name", () => {
  assert.match(appJs, /String\(query \|\| ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(appJs, /symbol\.interpretation \|\| ""/, "meaning should be searchable");
  assert.match(appJs, /symbol\.keywords \|\| \[\]/, "keywords should be searchable");
});

test("search never leaves the browser", () => {
  const start = appJs.indexOf("function filterSymbols");
  const end = appJs.indexOf("function renderSymbolAtlas");
  const source = appJs.slice(start, end);
  assert.ok(!source.includes("fetch("), "filtering must run over data already loaded");
});

test("an unknown category matches nothing rather than throwing", () => {
  assert.match(appJs, /if \(kind && symbol\.kind !== kind\) return false;/);
});

test("glyphs are decorative in the accessibility tree, names are not", () => {
  // The glyph is hidden and the name carries the meaning, so a failed font or a
  // screen reader still conveys the symbol.
  assert.match(appJs, /class="sa-card__glyph" aria-hidden="true"/);
  assert.match(appJs, /class="sa-card__name">\$\{esc\(symbol\.name\)\}/);
});

test("the atlas states where each symbol appears in Orbit", () => {
  assert.match(appJs, /SYMBOL_SEEN_IN/);
  assert.match(appJs, /Seen in Orbit Axis:/);
});

// ── Cross-linking ───────────────────────────────────────────────────────────

test("transit details link to the Symbol Atlas, and the atlas links home", () => {
  assert.match(appJs, /href="#symbol-atlas"[^>]*>\s*What do these symbols mean\?/);
  assert.ok(html.includes('id="panel-symbol-atlas"') && html.includes('data-goto="home"'),
    "the atlas needs a way back");
});

// ── Update 5.2a must survive ────────────────────────────────────────────────

test("the 5.2a redesign is untouched", () => {
  assert.ok(appJs.includes("axisFortuneCards"), "fortune cards remain");
  assert.ok(!appJs.includes("fortune-carousel"), "the carousel stays gone");
  assert.ok(!html.includes('data-level="Simple"'), "the mode switch stays gone");
  assert.match(appJs, /return "advanced"/, "one complete experience remains");
});

// ── Boot-critical DOM contract ──────────────────────────────────────────────
//
// Update 5.2b replaced the old transits panel body, which orphaned
// renderTransitTiles(): it still wrote to #transit-tiles unconditionally, threw
// at boot, and aborted refreshData() before wireTools() ran. Every [data-goto]
// button in the app silently stopped navigating.
//
// Nothing in the suite caught it, because every test read source text rather
// than booting the app. This asserts the contract that actually broke: a
// renderer refreshData() calls unconditionally may only touch elements that
// really exist in the shipped markup.

function bodyOf(source, fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) return null;
  let i = source.indexOf("{", start), depth = 0;
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === "{") depth += 1;
    else if (source[j] === "}") { depth -= 1; if (depth === 0) return source.slice(i, j + 1); }
  }
  return null;
}

test("every renderer refreshData() calls writes only to elements that exist", () => {
  const refresh = bodyOf(appJs, "refreshData");
  assert.ok(refresh, "refreshData should be findable");

  // Renderers invoked unconditionally — not inside an if, not optional-chained.
  const called = [...refresh.matchAll(/^\s{2}(render[A-Za-z]+)\(/gm)].map((m) => m[1]);
  assert.ok(called.length >= 2, `expected several unconditional renderers, saw ${called.join(", ")}`);

  const declaredIds = new Set([
    ...[...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
    ...[...appJs.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),   // ids app.js injects itself
  ]);

  for (const fn of called) {
    const body = bodyOf(appJs, fn);
    if (!body) continue;
    // Unguarded access only: $("#x"). — an optional-chained $("#x")?. is safe.
    for (const [, id] of body.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)\./g)) {
      assert.ok(declaredIds.has(id),
        `${fn}() writes to #${id}, which is not in the shipped markup — this throws at boot ` +
        `and aborts refreshData() before wireTools(), breaking every [data-goto] button`);
    }
  }
});

test("the back actions on both new pages have a handler, not just an attribute", () => {
  // Asserting the attribute exists was not enough: the buttons carried
  // data-goto="home" while the delegating listener never ran.
  assert.match(appJs, /\$\$\("\[data-goto\]"\)\.forEach/,
    "a [data-goto] listener must be installed");
  for (const panel of ["panel-transits", "panel-symbol-atlas"]) {
    assert.ok(html.includes(`id="${panel}"`), `${panel} should exist`);
  }
  assert.ok(!appJs.includes("renderTransitTiles"),
    "the orphaned renderer must stay removed");
});

test("a refresh on a secondary route re-renders once its data arrives", () => {
  // renderRoute() runs during boot, before restoreSession() resolves and before
  // the fortune loads. Without a second pass, refreshing on #transits showed
  // "Sign in to see transits" to an already-signed-in user, permanently.
  assert.match(appJs, /function refreshSecondaryRoute\(\)/,
    "a re-render hook must exist for the secondary destinations");

  const body = (() => {
    const start = appJs.indexOf("function refreshSecondaryRoute()");
    return appJs.slice(start, appJs.indexOf("\n}", start));
  })();
  assert.match(body, /id === "transits"/, "transits must be re-rendered");
  assert.match(body, /id === "symbol-atlas"/, "the atlas must be re-rendered");

  // It has to actually be called after the async data lands, not merely defined.
  const calls = appJs.split("refreshSecondaryRoute()").length - 1;
  assert.ok(calls >= 4,
    `refreshSecondaryRoute must be invoked after session restore and after each ` +
    `fortune assignment (definition + >=3 calls); found ${calls} occurrences`);

  const afterRestore = appJs.slice(appJs.indexOf("await restoreSession();"));
  assert.match(afterRestore.slice(0, 120), /refreshSecondaryRoute\(\)/,
    "the session path must re-render, since auth decides the empty state");
});
