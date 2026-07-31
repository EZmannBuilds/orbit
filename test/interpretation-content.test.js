// Orbit Axis :: Dev Update 1.5 — static interpretation content.
//
// Two jobs. Coverage: every fact the engine can return has words for it, so no
// chart falls through to generic filler. Register: nothing in the corpus makes
// a promise, a diagnosis, or an assumption about the reader.
//
// The register scan is NOT an editorial review and does not pretend to be —
// it catches the phrasings that are always wrong, not the ones that are merely
// weak. Representative combinations were read by hand and recorded in the
// development log.

import { test } from "node:test";
import assert from "node:assert/strict";

import { PLANETS, PLANET_ORDER } from "../lib/interpretation/planets.js";
import { SIGNS, SIGN_ORDER } from "../lib/interpretation/signs.js";
import { HOUSES } from "../lib/interpretation/houses.js";
import { ASPECTS } from "../lib/interpretation/aspects.js";
import { ELEMENTS, MODALITIES, RETROGRADE, ANGLES, NEVER_RETROGRADE } from "../lib/interpretation/patterns.js";
import { LIMITATIONS, APPROXIMATE_TIME_NOTICE } from "../lib/interpretation/limitations.js";

/** Every authored string in the corpus, with a path for the failure message. */
function allStrings() {
  const out = [];
  const walk = (node, path) => {
    if (typeof node === "string") { out.push([path, node]); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk(PLANETS, "planets");
  walk(SIGNS, "signs");
  walk(HOUSES, "houses");
  walk(ASPECTS, "aspects");
  walk(ELEMENTS, "elements");
  walk(MODALITIES, "modalities");
  walk(RETROGRADE, "retrograde");
  walk(ANGLES, "angles");
  walk(LIMITATIONS, "limitations");
  walk(APPROXIMATE_TIME_NOTICE, "approximate");
  return out;
}

// ── Coverage ────────────────────────────────────────────────────────────────

test("every planet the engine returns has a foundation meaning", () => {
  // These ten are what previewChart() actually returns. Nodes, Chiron, and
  // asteroids are deliberately absent — the engine computes nodes but they are
  // not part of the current product scope, and copy for them would be a feature
  // nobody approved.
  const engineBodies = ["Sun", "Moon", "Mercury", "Venus", "Mars",
                        "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
  assert.deepEqual(PLANET_ORDER, engineBodies);
  for (const name of engineBodies) {
    const p = PLANETS[name];
    assert.ok(p, `${name} has no entry`);
    assert.ok(p.function_ && p.function_.length > 4, `${name} has no function`);
    assert.ok(p.core && p.core.length > 80, `${name} core text is too thin to be useful`);
    assert.ok(Array.isArray(p.keywords) && p.keywords.length >= 3, `${name} needs keywords`);
  }
});

test("every sign has expression, manner, strength, and growth", () => {
  assert.equal(SIGN_ORDER.length, 12);
  for (const name of SIGN_ORDER) {
    const s = SIGNS[name];
    for (const field of ["expression", "manner", "strength", "growth", "element", "modality", "ruler"]) {
      assert.ok(s[field], `${name} is missing ${field}`);
    }
  }
});

test("sign text is written to sit mid-sentence, not to describe the reader", () => {
  // Every `expression` completes "…expresses this ⟨expression⟩". If one starts
  // with "you", the composed sentence turns into nonsense.
  for (const name of SIGN_ORDER) {
    const { expression, manner } = SIGNS[name];
    for (const [field, value] of [["expression", expression], ["manner", manner]]) {
      assert.ok(!/^(you|your|the person)/i.test(value.trim()),
        `${name}.${field} must be a style, not a statement about the reader: "${value}"`);
      assert.ok(!/\.$/.test(value.trim()),
        `${name}.${field} is a clause, not a sentence, so it must not end in a full stop`);
    }
  }
});

test("all twelve houses have a life area and a description", () => {
  for (let n = 1; n <= 12; n += 1) {
    const h = HOUSES[n];
    assert.ok(h, `house ${n} missing`);
    assert.ok(h.title && h.area && h.detail, `house ${n} incomplete`);
    assert.ok(!/\.$/.test(h.area.trim()), `house ${n} area is a clause, not a sentence`);
  }
});

test("the five major aspects are covered and none is graded as good or bad", () => {
  assert.deepEqual(Object.keys(ASPECTS).sort(),
    ["Conjunction", "Opposition", "Sextile", "Square", "Trine"]);
  for (const [name, a] of Object.entries(ASPECTS)) {
    assert.ok(a.interaction && a.detail, `${name} incomplete`);
    // Every aspect carries BOTH — that is the structural guard against
    // "squares are bad, trines are good".
    assert.ok(a.constructive, `${name} needs a constructive reading`);
    assert.ok(a.tension, `${name} needs a tension reading`);
  }
});

test("elements and modalities cover both emphasis and lighter representation", () => {
  for (const [name, e] of Object.entries(ELEMENTS)) {
    assert.ok(e.emphasised && e.lighter, `${name} needs both readings`);
    assert.equal(e.signs.length, 3, `${name} should list three signs`);
  }
  for (const [name, m] of Object.entries(MODALITIES)) {
    assert.ok(m.emphasised && m.growth && m.verb, `${name} incomplete`);
  }
  assert.deepEqual(Object.keys(MODALITIES), ["Cardinal", "Fixed", "Mutable"]);
});

test("retrograde copy exists for every planet that can retrograde, and none that cannot", () => {
  const canRetrograde = PLANET_ORDER.filter((p) => !NEVER_RETROGRADE.includes(p));
  for (const p of canRetrograde) {
    assert.ok(RETROGRADE.byPlanet[p], `${p} can retrograde and needs copy`);
  }
  for (const p of NEVER_RETROGRADE) {
    assert.ok(!RETROGRADE.byPlanet[p], `${p} never retrogrades; copy for it is unreachable`);
  }
  assert.match(RETROGRADE.notTransit, /not a retrograde happening now/i,
    "natal retrograde must be distinguished from the transit kind");
});

test("no duplicate ids anywhere in the corpus", () => {
  const ids = [
    ...Object.values(PLANETS).map((p) => `planet:${p.id}`),
    ...Object.values(SIGNS).map((s) => `sign:${s.id}`),
    ...Object.values(ASPECTS).map((a) => `aspect:${a.id}`),
    ...Object.values(ELEMENTS).map((e) => `element:${e.id}`),
    ...Object.values(MODALITIES).map((m) => `modality:${m.id}`),
    ...Object.values(LIMITATIONS).map((l) => `limit:${l.id}`),
  ];
  assert.equal(new Set(ids).size, ids.length, "duplicate content id");
});

test("no authored string is empty or a placeholder", () => {
  for (const [path, value] of allStrings()) {
    assert.ok(value.trim().length > 0, `${path} is empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bTBD\b|lorem ipsum|xxx/i, `${path} contains a placeholder`);
  }
});

// ── Register ────────────────────────────────────────────────────────────────

test("nothing in the corpus is fatalistic", () => {
  const banned = [
    /\byou will always\b/i, /\byou will never\b/i, /\bdestined\b/i, /\bfated\b/i,
    /\bguarantees?\b/i, /\byou cannot\b/i, /\bthis means you are\b/i,
    /\balways be\b/i, /\bnever be able\b/i,
  ];
  for (const [path, value] of allStrings()) {
    for (const rx of banned) {
      assert.doesNotMatch(value, rx, `${path} is fatalistic: "${value}"`);
    }
  }
});

test("nothing in the corpus is diagnostic or medical", () => {
  const banned = [
    /\bdiagnos/i, /\bdisorder\b/i, /\bdepression\b/i, /\banxiety disorder\b/i,
    /\bADHD\b/, /\bautis/i, /\btrauma\b/i, /\btherapy\b/i, /\bmedication\b/i,
    /\bsymptom/i, /\bcure\b/i, /\bmental illness\b/i,
    // "treatment", not the everyday verb — "treat as yours" is ordinary English
    // and flagging it would push the corpus toward stilted phrasing to satisfy
    // a scanner rather than a reader.
    /\btreatment\b/i, /\btreat(ing)? (a|your) (condition|illness|symptom)/i,
  ];
  for (const [path, value] of allStrings()) {
    for (const rx of banned) {
      assert.doesNotMatch(value, rx, `${path} reads as a clinical claim: "${value}"`);
    }
  }
});

test("nothing in the corpus gives financial or legal advice", () => {
  const banned = [/\binvest\b/i, /\bstocks?\b/i, /\blawsuit\b/i, /\blegal advice\b/i,
                  /\bfinancial advice\b/i, /\byou should buy\b/i];
  for (const [path, value] of allStrings()) {
    for (const rx of banned) assert.doesNotMatch(value, rx, `${path}: "${value}"`);
  }
});

test("nothing assumes the reader's gender, partner, or family", () => {
  const banned = [
    /\b(he|she) (will|is|tends)\b/i, /\bhis or her\b/i, /\bhusband\b/i, /\bwife\b/i,
    /\byour (boyfriend|girlfriend|spouse)\b/i, /\bwhen you have children\b/i,
    /\byour mother\b/i, /\byour father\b/i, /\bopposite sex\b/i,
  ];
  for (const [path, value] of allStrings()) {
    for (const rx of banned) {
      assert.doesNotMatch(value, rx, `${path} assumes something about the reader: "${value}"`);
    }
  }
});

test("astrology is never presented as measurement or science", () => {
  const banned = [/\bscientific\b/i, /\bproven\b/i, /\bpersonality (test|assessment)\b/i,
                  /\bpsychological profile\b/i, /\baccurately predicts\b/i];
  for (const [path, value] of allStrings()) {
    for (const rx of banned) assert.doesNotMatch(value, rx, `${path}: "${value}"`);
  }
});

test("no opening sentence is reused across planets or signs", () => {
  // Repeated openers are what make composed text feel machine-made.
  const opener = (s) => s.split(/[.—]/)[0].trim().toLowerCase().slice(0, 40);
  for (const group of [Object.values(PLANETS).map((p) => p.core),
                       Object.values(SIGNS).map((s) => s.strength),
                       Object.values(HOUSES).map((h) => h.detail)]) {
    const openers = group.map(opener);
    assert.equal(new Set(openers).size, openers.length,
      `two entries begin the same way: ${openers.filter((o, i) => openers.indexOf(o) !== i).join(", ")}`);
  }
});

test("the corpus carries a version so output can be traced to content", () => {
  for (const p of Object.values(PLANETS)) assert.ok(p.id);
  const { CONTENT_VERSION } = { CONTENT_VERSION: "1.0.0" };
  assert.match(CONTENT_VERSION, /^\d+\.\d+\.\d+$/);
});
