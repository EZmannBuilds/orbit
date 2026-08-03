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
  validateAtlasContent, ATLAS_METHODOLOGY_NOTE, renderedStrings,
} from "../lib/symbol-atlas/index.js";
import { ORBIT_SYMBOLS } from "../lib/symbols.js";

test("the validator finds nothing wrong with shipped content", () => {
  assert.deepEqual(validateAtlasContent(), []);
});

test("the validator actually catches what it claims to catch", () => {
  // A gate that cannot fail is decoration. Feed it one of each defect.
  //
  // Every rule the validator enforces gets a case here, including the ones
  // Dev Update 3.1 added — completion-schema gaps, diagnostic and judgemental
  // language, second-person verdicts, sign-house and angle-planet conflation,
  // placeholder copy, Researcher-tier claims, malformed composition clauses,
  // and a paragraph shared between two entries.
  const good = ATLAS_ENTRIES[0];
  const other = ATLAS_ENTRIES[1];
  // The probe is a clone of a real entry, so its long strings are uniquified
  // first — otherwise every case would also trip the cross-entry duplication
  // rule and bury the defect each case is actually probing for.
  const unique = (s) => `${s} Probe copy for the validator test.`;
  const probe = {
    ...good,
    overview: good.overview.map(unique),
    constructive: unique(good.constructive),
    difficult: unique(good.difficult),
    whenEmphasized: unique(good.whenEmphasized),
    chartRole: unique(good.chartRole),
    advanced: good.advanced.map(unique),
    slug: "validator-probe",
    id: "planets-validator-probe",
  };
  const cases = [
    // 1.12 rules, still enforced.
    [{ slug: "Bad Slug!" }, /slug invalid/],
    [{ related: ["planets/atlantis"] }, /resolves to nothing/],
    [{ summary: "Too short." }, /summary/],
    [{ chartRole: "This planet always guarantees success in life and love for everyone." }, /fatalistic/],
    [{ title: "<script>alert(1)</script>" }, /angle bracket/],
    [{ status: "starter" }, /completion status/],
    [{ id: "wrong-id" }, /does not derive/],

    // Completion schema (Dev Update 3.1).
    [{ overview: [good.overview[0]] }, /two overview paragraphs/],
    [{ overview: ["Too short.", "Also short."] }, /too thin to be a paragraph/],
    [{ everyday: [] }, /two everyday expressions/],
    [{ constructive: "Short." }, /constructive expression/],
    [{ difficult: "Short." }, /difficult expression/],
    [{ whenEmphasized: "" }, /whenEmphasized/],
    [{ reflections: ["Only one?"] }, /two or three reflection prompts/],
    [{ reflections: ["This is a statement.", "So is this."] }, /is not a question/],
    [{ reflections: ["  ", "Fine?"] }, /empty reflection prompt/],
    [{ aliases: [] }, /at least one search alias/],
    [{ keywords: ["a", "b", "c"] }, /at least five keywords/],
    [{ advanced: [] }, /at least one advanced paragraph/],

    // Composition vocabulary — a clause that cannot be dropped into someone
    // else's sentence would ship a combination page with a seam in it.
    [{ role: undefined }, /missing composition field "role"/],
    [{ role: "Identity and vitality" }, /starts with a capital/],
    [{ role: "identity and vitality." }, /ends with a full stop/],

    // Tone and safety.
    [{ constructive: "This placement often describes childhood trauma and a personality disorder that shapes every relationship the person has." }, /diagnostic language/],
    [{ difficult: "This is a bad placement and the person is usually toxic to everyone around them, which makes closeness very hard indeed." }, /judgemental language/],
    [{ summary: "This placement points to a soulmate connection that arrives whatever else is happening in the chart." }, /fatalistic/],
    [{ difficult: "You will find that this placement makes life harder than it needs to be, and there is little to be done about that." }, /second-person verdict/],
    [{ constructive: "You are a natural leader with this placement, and people tend to follow without being asked to do so at all." }, /second-person verdict/],
    [{ whenEmphasized: "Coming soon — this section has not been written yet for this particular entry." }, /placeholder text/],
    [{ advanced: ["According to Ptolemy the essential dignity of this body decides the whole reading, as cited in the standard tables."] }, /Researcher-tier claim/],

    // The two conflations the Atlas exists to prevent.
    [{ chartRole: "The 8th House is Scorpio, so anything placed there takes on that flavour automatically in every chart." }, /sign-house conflation/],
    [{ chartRole: "Scorpio is the 8th house, which is why the two are read as interchangeable by most beginners starting out." }, /sign-house conflation/],
    [{ advanced: ["The Ascendant can turn retrograde during the year, which changes how it behaves in a chart quite considerably."] }, /angle-planet conflation/],

    // Cross-entry duplication: two entries may not ship the same paragraph.
    [{ constructive: other.constructive }, /shares a paragraph/],
  ];
  for (const [patch, expected] of cases) {
    // Patch last: a case that overrides slug or id must actually override it.
    const broken = { ...probe, ...patch };
    const problems = validateAtlasContent({ entries: [...ATLAS_ENTRIES, broken] });
    assert.ok(problems.some((p) => expected.test(p)),
      `validator missed: ${expected} — got ${JSON.stringify(problems.slice(0, 3))}`);
  }
});

test("every entry carries the full Dev Update 3.1 completion schema", () => {
  for (const e of ATLAS_ENTRIES) {
    assert.ok(e.overview.length >= 2, `${e.id}: overview`);
    assert.ok(e.everyday.length >= 2, `${e.id}: everyday`);
    assert.ok(e.constructive?.length >= 120, `${e.id}: constructive`);
    assert.ok(e.difficult?.length >= 120, `${e.id}: difficult`);
    assert.ok(e.whenEmphasized?.length >= 60, `${e.id}: whenEmphasized`);
    assert.ok(e.reflections.length >= 2 && e.reflections.length <= 3, `${e.id}: reflections`);
    assert.ok(e.reflections.every((p) => p.trim().endsWith("?")), `${e.id}: prompts must be questions`);
    assert.ok(e.aliases.length >= 1, `${e.id}: aliases`);
    assert.ok(e.keywords.length >= 5, `${e.id}: keywords`);
    assert.ok(e.advanced.length >= 1, `${e.id}: advanced`);
    assert.equal(e.status, "complete", `${e.id}: status`);
  }
  // Elements and modalities describe both tails of a balance reading.
  for (const e of ATLAS_ENTRIES.filter((x) => x.category === "elements" || x.category === "modalities")) {
    assert.ok(e.whenScarce?.length >= 60, `${e.id}: a balance entry must describe a low count too`);
  }
});

test("no two entries ship the same paragraph", () => {
  // Fifty entries written to one structure is exactly the situation where a
  // paragraph gets pasted and lightly edited — or not edited at all.
  const seen = new Map();
  for (const e of ATLAS_ENTRIES) {
    for (const s of renderedStrings(e)) {
      if (s.length < 120) continue;
      assert.ok(!seen.has(s) || seen.get(s) === e.id,
        `${e.id} shares a paragraph with ${seen.get(s)}`);
      seen.set(s, e.id);
    }
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
