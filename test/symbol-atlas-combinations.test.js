// Orbit Axis :: Symbol Atlas combination explanations (Dev Update 3.1).
//
// The combination layer composes text at read time, which is the one place in
// the Atlas where output is not literally the authored content. So the things
// worth asserting are the properties that make composition safe: it is
// deterministic, it invents nothing, it repeats nothing, it fails to null
// rather than to nonsense, and it reaches no network, model, or clock.
//
// Pure and offline — no server, no browser, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ATLAS_ENTRIES, atlasEntry, composeCombination, combinationPath,
  combinationFallbackEntries, validateCombinations, combinationCounts,
  COMBINATION_TYPES, COMBINATION_TYPE_LIST, COMBINATION_EXAMPLES,
} from "../lib/symbol-atlas/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "public", "symbol-atlas", "combinations.js"), "utf8");

const planets = ATLAS_ENTRIES.filter((e) => e.category === "planets");

test("every combination the routes can reach actually composes", () => {
  // Exhaustive, not sampled: all 505 pages the URL space produces.
  assert.deepEqual(validateCombinations(), []);
  assert.deepEqual(combinationCounts(), {
    "planet-in-sign": 120,
    "planet-in-house": 120,
    "planet-aspect-planet": 225,
    "planet-with-angle": 40,
  });
});

test("the four supported types are exactly the four the spec names", () => {
  assert.deepEqual(COMBINATION_TYPE_LIST.map((t) => t.slug),
    ["planet-in-sign", "planet-in-house", "planet-aspect-planet", "planet-with-angle"]);
  assert.deepEqual(COMBINATION_TYPE_LIST.map((t) => t.label),
    ["Planet in Sign", "Planet in House", "Planet aspect Planet", "Planet with Angle"]);
});

test("Planet in Sign gives the planet the function and the sign the style", () => {
  const moon = composeCombination("planet-in-sign", ["moon", "cancer"]);
  assert.equal(moon.title, "Moon in Cancer");
  assert.match(moon.composed, /^Moon describes /);
  assert.match(moon.composed, /In Cancer, that function tends to be expressed /);
  // The sign supplies style, never an area of life — that is the house's job,
  // and this composer cannot see a house at all.
  assert.ok(!/area of life|house/i.test(moon.composed));
  assert.deepEqual(moon.entries.map((r) => `${r.category}/${r.slug}`), ["planets/moon", "signs/cancer"]);
});

test("Planet in House gives the house an area of life, never a style", () => {
  const saturn = composeCombination("planet-in-house", ["saturn", "4th-house"]);
  assert.equal(saturn.title, "Saturn in the 4th House");
  assert.match(saturn.composed, /The 4th House directs that function toward /);
  // And it says out loud that the sign is the thing it is not describing.
  assert.match(saturn.sections.at(-1).body, /does not describe\s+the style/);
  // House combinations depend on a birth time and say so.
  assert.match(saturn.note, /accurate birth time/);
});

test("Planet aspect Planet is order-stable and respects the aspect", () => {
  const a = composeCombination("planet-aspect-planet", ["moon", "square", "saturn"]);
  const b = composeCombination("planet-aspect-planet", ["saturn", "square", "moon"]);
  assert.deepEqual(a, b, "the same pair in the other order must be the same page");
  assert.equal(a.title, "Moon square Saturn");        // canonical entry order
  assert.match(a.composed, /the two press on each other/);
  // The orb quoted is the engine's, restated from the aspect entry's own fact.
  assert.match(a.sections.at(-1).body, /up to 6°/);
  // A planet does not aspect itself.
  assert.equal(composeCombination("planet-aspect-planet", ["moon", "square", "moon"]), null);
  // Articles are computed, not hardcoded: "a square" but "an opposition".
  assert.match(composeCombination("planet-aspect-planet", ["venus", "opposition", "mars"]).composed,
    /In an opposition/);
  assert.match(a.composed, /In a square/);
});

test("Planet with Angle says close to, not in", () => {
  const sun = composeCombination("planet-with-angle", ["sun", "midheaven"]);
  assert.equal(sun.title, "Sun with the Midheaven");
  assert.match(sun.composed, /Sitting close to the Midheaven/);
  // An angle is a calculated point; nothing may say a planet occupies one.
  assert.ok(!/\bSun in the Midheaven\b/.test(JSON.stringify(sun)));
  assert.match(sun.sections.at(-1).body, /calculated point rather than a body/);
  assert.match(sun.note, /accurate birth time/);
});

test("composition is deterministic", () => {
  // Same input, byte-identical output, however many times it is asked.
  const cases = [
    ["planet-in-sign", ["mercury", "gemini"]],
    ["planet-in-house", ["jupiter", "10th-house"]],
    ["planet-aspect-planet", ["mercury", "trine", "jupiter"]],
    ["planet-with-angle", ["moon", "imum-coeli"]],
  ];
  for (const [type, parts] of cases) {
    const first = JSON.stringify(composeCombination(type, parts));
    for (let i = 0; i < 20; i++) {
      assert.equal(JSON.stringify(composeCombination(type, parts)), first,
        `${type}/${parts.join("/")} composed differently on run ${i}`);
    }
  }
});

test("no fragment is repeated inside one composed page", () => {
  // The failure this guards: a composer that quotes the same authored field
  // under two headings, so the page says one thing twice in the same words.
  for (const [type, parts] of [
    ["planet-in-sign", ["venus", "libra"]],
    ["planet-in-house", ["mars", "6th-house"]],
    ["planet-aspect-planet", ["sun", "conjunction", "pluto"]],
    ["planet-with-angle", ["saturn", "ascendant"]],
  ]) {
    const c = composeCombination(type, parts);
    const blocks = [c.composed, ...c.sections.map((s) => s.body), c.note];
    assert.equal(new Set(blocks).size, blocks.length, `${type}: a block is repeated verbatim`);
    // Headings are distinct too — two identical headings is a page that lost
    // track of what it was explaining.
    const headings = [...c.sections.map((s) => s.heading),
      ...c.contributions.map((g) => g.heading), ...c.tensions.map((g) => g.heading)];
    assert.equal(new Set(headings).size, headings.length, `${type}: a heading is repeated`);
  }
});

test("every reference in a composed page resolves to a real entry", () => {
  for (const ex of COMBINATION_EXAMPLES) {
    const c = composeCombination(ex.type, ex.parts);
    assert.ok(c, `${ex.type}/${ex.parts.join("/")} did not compose`);
    for (const r of c.entries) {
      assert.ok(atlasEntry(r.category, r.slug), `dangling reference ${r.category}/${r.slug}`);
    }
  }
});

test("missing or malformed input fails to null, never to nonsense", () => {
  const bad = [
    ["nope", ["moon", "cancer"]],                    // unknown type
    ["planet-in-sign", ["moon"]],                    // too few parts
    ["planet-in-sign", ["moon", "cancer", "extra"]], // too many
    ["planet-in-sign", ["moon", "atlantis"]],        // slug resolves to nothing
    ["planet-in-sign", ["cancer", "moon"]],          // right slugs, wrong categories
    ["planet-in-house", ["moon", "13th-house"]],
    ["planet-with-angle", ["moon", "vertex"]],
    [null, null], [undefined, undefined], ["", []],
    ["planet-in-sign", ["<script>", "cancer"]],      // hostile input is just input
  ];
  for (const [type, parts] of bad) {
    assert.equal(composeCombination(type, parts), null, `${type}/${parts} should not compose`);
  }
});

test("a combination that cannot compose still offers its canonical entries", () => {
  // The fallback the spec asks for: lose the explanation, keep the links.
  const partial = combinationFallbackEntries("planet-in-sign", ["moon", "atlantis"]);
  assert.deepEqual(partial.map((e) => e.id), ["planets-moon"]);
  assert.deepEqual(combinationFallbackEntries("nope", ["moon"]), []);
});

test("combination routes carry no chart data and no query string", () => {
  for (const ex of COMBINATION_EXAMPLES) {
    const path = combinationPath(ex.type, ex.parts);
    assert.match(path, /^symbol-atlas\/combinations\/[a-z-]+\/[a-z0-9/-]+$/,
      `route is not a plain slug path: ${path}`);
    assert.ok(!/[?&=]/.test(path), `route carries a query string: ${path}`);
  }
});

test("the composer reaches no network, model, storage, or clock", () => {
  // Comments are stripped first: the file's own header documents the rule
  // ("no Math.random, no Date"), and prose about a banned call is not a call.
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const banned of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage",
    "openai", "anthropic", "ollama", "/api/", "Math.random", "new Date", "Date.now",
    "process.env", "eval(", "Function("]) {
    assert.ok(!code.includes(banned),
      `combinations.js contains "${banned}" — composition is local, static, and deterministic`);
  }
  assert.ok(code.length > 2000, "comment-stripping ate the file — the scan would be vacuous");
});

test("every planet can be combined with everything it is offered against", () => {
  // Guards the authoring gap the fallback would otherwise hide: an entry that
  // shipped without its composition clause would quietly stop composing, and
  // the page would degrade to links without anything failing.
  for (const p of planets) {
    assert.ok(p.role, `${p.id} has no role clause`);
    assert.ok(composeCombination("planet-in-sign", [p.slug, "aries"]), `${p.id} + a sign`);
    assert.ok(composeCombination("planet-in-house", [p.slug, "1st-house"]), `${p.id} + a house`);
    assert.ok(composeCombination("planet-with-angle", [p.slug, "ascendant"]), `${p.id} + an angle`);
  }
  for (const s of ATLAS_ENTRIES.filter((e) => e.category === "signs")) assert.ok(s.style, `${s.id} has no style clause`);
  for (const h of ATLAS_ENTRIES.filter((e) => e.category === "houses")) assert.ok(h.arena, `${h.id} has no arena clause`);
  for (const a of ATLAS_ENTRIES.filter((e) => e.category === "angles")) assert.ok(a.axisRole, `${a.id} has no axisRole clause`);
  for (const a of ATLAS_ENTRIES.filter((e) => e.category === "aspects")) {
    assert.ok(a.interaction && a.pairNote, `${a.id} is missing an aspect composition clause`);
  }
});

test("composed copy obeys the same tone rules as authored copy", () => {
  const FATALISTIC = /\b(always|never|guarantees?|destined|doomed|soulmates?)\b/i;
  const SECOND_PERSON = /\byou(?:'ll| will)\b/i;
  for (const p of planets) {
    for (const s of ATLAS_ENTRIES.filter((e) => e.category === "signs")) {
      const text = JSON.stringify(composeCombination("planet-in-sign", [p.slug, s.slug]));
      assert.ok(!FATALISTIC.test(text), `${p.slug}/${s.slug}: fatalistic composed copy`);
      assert.ok(!SECOND_PERSON.test(text), `${p.slug}/${s.slug}: predictive composed copy`);
      assert.ok(!/[<>]/.test(text), `${p.slug}/${s.slug}: angle bracket in composed copy`);
    }
  }
  // And every page says a single pairing is not a person.
  const c = composeCombination("planet-in-sign", ["sun", "leo"]);
  assert.match(c.note, /does not describe a person/);
});

test("the type table is frozen and cannot be edited at runtime", () => {
  assert.ok(Object.isFrozen(COMBINATION_TYPES));
  assert.ok(Object.isFrozen(COMBINATION_EXAMPLES));
  assert.throws(() => { COMBINATION_EXAMPLES.push({}); }, TypeError);
});
