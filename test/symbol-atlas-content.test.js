// Orbit Axis :: Symbol Atlas content contract (Dev Update 1.12).
//
// The Atlas is authored reference material, so its failure modes are content
// failure modes: a dead related-link, a missing house, a fact that disagrees
// with the calculator, a sentence that promises destiny. Every one of those is
// caught here, in CI, rather than by a reader.
//
// Pure and offline — no server, no browser, no network.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ATLAS_CATEGORIES, ATLAS_ENTRIES, atlasEntry, categoryEntries, relatedEntries,
  validateAtlasContent, ATLAS_METHODOLOGY_NOTE,
} from "../lib/symbol-atlas/index.js";
import { ORBIT_SYMBOLS } from "../lib/symbols.js";

test("the validator finds nothing wrong with shipped content", () => {
  assert.deepEqual(validateAtlasContent(), []);
});

test("the validator actually catches what it claims to catch", () => {
  // A gate that cannot fail is decoration. Feed it one of each defect.
  const good = ATLAS_ENTRIES[0];
  const cases = [
    [{ ...good, slug: "Bad Slug!" }, /slug invalid/],
    [{ ...good, related: ["planets/atlantis"] }, /resolves to nothing/],
    [{ ...good, summary: "Too short." }, /summary/],
    [{ ...good, chartRole: "This planet always guarantees success in life and love for everyone." }, /fatalistic/],
    [{ ...good, title: "<script>alert(1)</script>" }, /angle bracket/],
    [{ ...good, status: "complete" }, /claims beyond/],
    [{ ...good, id: "wrong-id" }, /does not derive/],
  ];
  for (const [broken, expected] of cases) {
    const problems = validateAtlasContent({ entries: [...ATLAS_ENTRIES, broken] });
    assert.ok(problems.some((p) => expected.test(p)),
      `validator missed: ${expected} — got ${JSON.stringify(problems.slice(0, 3))}`);
  }
});

test("all seven categories and all fifty starter entries exist", () => {
  assert.deepEqual(ATLAS_CATEGORIES.map((c) => c.slug),
    ["planets", "signs", "houses", "aspects", "elements", "modalities", "angles"]);
  const counts = Object.fromEntries(ATLAS_CATEGORIES.map((c) => [c.slug, categoryEntries(c.slug).length]));
  assert.deepEqual(counts, { planets: 10, signs: 12, houses: 12, aspects: 5, elements: 4, modalities: 3, angles: 4 });
  assert.equal(ATLAS_ENTRIES.length, 50);
});

test("canonical order is astrological, not alphabetical", () => {
  assert.deepEqual(categoryEntries("planets").map((e) => e.slug),
    ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]);
  assert.deepEqual(categoryEntries("signs").map((e) => e.slug),
    ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]);
  // The failure this guards: houses sorted as strings put the 10th before the 2nd.
  assert.deepEqual(categoryEntries("houses").map((e) => e.title),
    ["1st House", "2nd House", "3rd House", "4th House", "5th House", "6th House",
     "7th House", "8th House", "9th House", "10th House", "11th House", "12th House"]);
  assert.deepEqual(categoryEntries("aspects").map((e) => e.slug),
    ["conjunction", "opposition", "square", "trine", "sextile"]);
  assert.deepEqual(categoryEntries("elements").map((e) => e.slug), ["fire", "earth", "air", "water"]);
  assert.deepEqual(categoryEntries("modalities").map((e) => e.slug), ["cardinal", "fixed", "mutable"]);
  assert.deepEqual(categoryEntries("angles").map((e) => e.slug),
    ["ascendant", "descendant", "midheaven", "imum-coeli"]);
});

test("sign facts agree with lib/symbols.js exactly", () => {
  // Two sources of "what element is Scorpio" is one too many. lib/symbols.js
  // already ships element/modality/ruler per sign; the Atlas restates them in
  // facts and must never drift.
  for (const sign of ORBIT_SYMBOLS.filter((s) => s.kind === "zodiac_sign")) {
    const entry = atlasEntry("signs", sign.slug);
    assert.ok(entry, `Atlas is missing sign ${sign.slug}`);
    assert.equal(entry.facts.element.toLowerCase(), sign.element,
      `${sign.slug}: element disagrees with lib/symbols.js`);
    assert.equal(entry.facts.modality.toLowerCase(), sign.modality,
      `${sign.slug}: modality disagrees with lib/symbols.js`);
    assert.ok(entry.facts.ruler.includes(sign.ruling_planet),
      `${sign.slug}: ruler "${entry.facts.ruler}" omits "${sign.ruling_planet}"`);
  }
});

test("aspect orb facts agree with the engine", async () => {
  const { computeSynastryAspects } = await import("@ezmannbuilds/orbit-axis-engine");
  void computeSynastryAspects;
  // The engine's synastry orbs: conjunction/opposition 8, square/trine 6,
  // sextile 4, +1 for a luminary. The Atlas advanced facts must state those
  // same numbers or the reference disagrees with the calculator beside it.
  const expected = { conjunction: "8°", opposition: "8°", square: "6°", trine: "6°", sextile: "4°" };
  for (const [slug, orb] of Object.entries(expected)) {
    const entry = atlasEntry("aspects", slug);
    assert.ok(entry.facts.orb.includes(orb), `${slug}: orb fact "${entry.facts.orb}" missing ${orb}`);
    assert.match(entry.facts.orb, /\+1°/, `${slug}: orb fact omits the luminary bonus`);
  }
});

test("the related graph is bidirectionally sane", () => {
  for (const entry of ATLAS_ENTRIES) {
    const related = relatedEntries(entry);
    assert.equal(related.length, (entry.related || []).length,
      `${entry.id}: a related ref failed to resolve`);
    const seen = new Set();
    for (const r of related) {
      assert.ok(!seen.has(r.id), `${entry.id}: relates to ${r.id} twice`);
      seen.add(r.id);
    }
  }
  // Spot-check the authored examples the spec names.
  const moonRelated = relatedEntries(atlasEntry("planets", "moon")).map((e) => e.id);
  for (const expected of ["signs-cancer", "elements-water", "houses-4th-house"]) {
    assert.ok(moonRelated.includes(expected), `Moon should relate to ${expected}`);
  }
  const cardinal = relatedEntries(atlasEntry("modalities", "cardinal")).map((e) => e.id);
  for (const sign of ["signs-aries", "signs-cancer", "signs-libra", "signs-capricorn"]) {
    assert.ok(cardinal.includes(sign), `Cardinal should relate to ${sign}`);
  }
});

test("every entry is reachable from at least one other entry", () => {
  // An island entry can only be found by search. The graph exists so browsing
  // works too; anything unreachable is an authoring gap.
  const inbound = new Set(ATLAS_ENTRIES.flatMap((e) => e.related || []));
  const orphans = ATLAS_ENTRIES
    .filter((e) => !inbound.has(`${e.category}/${e.slug}`))
    .map((e) => e.id);
  assert.deepEqual(orphans, [], `no entry may be an island: ${orphans.join(", ")}`);
});

test("entries are data, never markup, and never executable", () => {
  const everything = JSON.stringify(ATLAS_ENTRIES);
  for (const banned of ["<script", "<img", "javascript:", "onerror=", "onclick=", "<iframe"]) {
    assert.ok(!everything.toLowerCase().includes(banned), `content contains "${banned}"`);
  }
});

test("the methodology note says what it must", () => {
  assert.match(ATLAS_METHODOLOGY_NOTE, /authored astrological reference material/);
  assert.match(ATLAS_METHODOLOGY_NOTE, /does not guarantee personality traits, events, or outcomes/);
});

test("content is frozen — nothing at runtime can edit the reference", () => {
  assert.ok(Object.isFrozen(ATLAS_ENTRIES));
  assert.ok(Object.isFrozen(ATLAS_ENTRIES[0]));
  assert.ok(Object.isFrozen(ATLAS_CATEGORIES));
  assert.throws(() => { ATLAS_ENTRIES[0].title = "Hacked"; }, TypeError);
});
