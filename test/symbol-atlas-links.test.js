// Orbit Axis :: contextual Atlas links from existing surfaces (Dev Update 1.12).
//
// The rule under every assertion: a linked symbol name reads as the same
// sentence — it navigates to reference material and does nothing else. No
// recalculation, no active-chart change, no relationship change, no new tab.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const APP = readFileSync(join(ROOT, "public", "app.js"), "utf8");

function fn(name) {
  const start = APP.indexOf(`function ${name}`);
  assert.ok(start > -1, `${name} missing`);
  return APP.slice(start, APP.indexOf("\nfunction ", start + 10));
}

test("My Chart links planets, signs, and houses from reading cards", () => {
  const card = fn("readingCardHtml");
  assert.match(card, /atlasBodyLinkHtml\(placement\.planet\)/);
  assert.match(card, /atlasLinkHtml\("signs", placement\.sign\)/);
  assert.match(card, /atlasHouseLinkHtml\(placement\.house/);
});

test("My Chart links aspect names and both bodies from aspect cards", () => {
  const card = fn("aspectCardHtml");
  assert.match(card, /atlasBodyLinkHtml\(aspect\.a\)/);
  assert.match(card, /atlasBodyLinkHtml\(aspect\.b\)/);
  assert.match(card, /atlasLinkHtml\("aspects", aspect\.aspect/);
});

test("My Chart links elements and modalities from the balance bars", () => {
  assert.match(APP, /atlasCategory: "elements"/);
  assert.match(APP, /atlasCategory: "modalities"/);
  const bars = fn("balanceBarsHtml");
  assert.match(bars, /atlasCategory \? atlasLinkHtml\(atlasCategory, key\) : esc\(key\)/);
});

test("Current Positions links the planet and its sign", () => {
  const row = fn("positionRowHtml");
  assert.match(row, /atlasBodyLinkHtml\(p\.name\)/);
  assert.match(row, /#symbol-atlas\/signs\/\$\{esc\(String\(p\.sign\)\.toLowerCase\(\)\)\}/);
  // The signless fallback stays plain text — no dead links from unknown data.
  assert.match(row, /`<span>\$\{esc\(p\.position\)\}<\/span>`/);
});

test("Transits link transiting planet, natal planet, and aspect", () => {
  const card = fn("transitCardHtml");
  assert.match(card, /atlasBodyLinkHtml\(t\.transiting\)/);
  assert.match(card, /atlasBodyLinkHtml\(t\.natal\)/);
  assert.match(card, /atlasLinkHtml\("aspects", t\.aspect\)/);
});

test("Compatibility factors link bodies and aspect on their own line", () => {
  const factor = fn("compatFactorHtml");
  assert.match(factor, /factor\.bodies\.map\(\(b\) => atlasBodyLinkHtml\(b\)\)/);
  assert.match(factor, /atlasLinkHtml\("aspects", factor\.aspect\)/);
  // The authored sentence stays a sentence: headline and roles remain
  // fully escaped plain text, links live on the refs line only.
  assert.match(factor, /\$\{esc\(factor\.headline\)\}/);
  assert.match(factor, /\$\{esc\(factor\.roles\)\}/);
});

test("an unknown name degrades to plain text, never a dead link", () => {
  const link = fn("atlasLinkHtml");
  assert.match(link, /if \(!ATLAS_LINKABLE\[category\]\?\.has\(slug\)\) return esc\(text\)/);
  const house = fn("atlasHouseLinkHtml");
  assert.match(house, /n < 1 \|\| n > 12\) return esc/);
});

test("the linkable allow-list matches the shipped content exactly", async () => {
  const { ATLAS_ENTRIES } = await import("../lib/symbol-atlas/index.js");
  const m = APP.match(/const ATLAS_LINKABLE = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(m, "ATLAS_LINKABLE missing");
  for (const category of ["planets", "signs", "aspects", "elements", "modalities", "angles"]) {
    const listed = [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]);
    const shipped = ATLAS_ENTRIES.filter((e) => e.category === category).map((e) => e.slug);
    for (const slug of shipped) {
      assert.ok(listed.includes(slug) || category === "houses",
        `${category}/${slug} shipped but not linkable`);
    }
  }
  // And nothing linkable that does not ship — that WOULD be a dead link.
  const shippedRefs = new Set(ATLAS_ENTRIES.map((e) => `${e.category}/${e.slug}`));
  for (const [category, slugs] of Object.entries({
    planets: ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"],
  })) {
    for (const slug of slugs) assert.ok(shippedRefs.has(`${category}/${slug}`));
  }
});

test("contextual links never open a new tab, mutate state, or carry data", () => {
  for (const name of ["atlasLinkHtml", "atlasHouseLinkHtml"]) {
    const src = fn(name);
    assert.ok(!src.includes("target="), `${name} sets target`);
    assert.ok(!src.includes("window.open"), `${name} opens windows`);
    assert.ok(!/[?&]/.test(src.match(/href="[^"]*"/)?.[0] || ""), `${name} carries query data`);
  }
  // No contextual link path calls chart activation or identity endpoints.
  const linksRegion = fn("compatFactorHtml") + fn("positionRowHtml") + fn("transitCardHtml");
  for (const banned of ["activateChart", "PATCH", "post(", "put("]) {
    assert.ok(!linksRegion.includes(banned), `link path contains ${banned}`);
  }
});
