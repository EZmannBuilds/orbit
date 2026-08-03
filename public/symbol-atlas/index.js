// Orbit Axis :: Symbol Atlas — the assembled reference library (Dev Update 1.12).
//
// One import gives everything: categories, every entry with its derived id and
// status, lookups, related-entry resolution, search, and the validator the
// test gate runs. The browser loads this lazily (first Atlas visit); Node
// imports it directly for tests via lib/symbol-atlas/index.js — same file,
// same truth, exactly the chart-identity.js arrangement.
//
// Entries are DATA, never markup. Rendering escapes everything; nothing in
// this module touches the DOM, the network, or storage of any kind.

import { ATLAS_CATEGORIES, CATEGORY_BY_SLUG, categoryOrder } from "./categories.js";
import { PLANET_ENTRIES } from "./entries-planets.js";
import { SIGN_ENTRIES } from "./entries-signs.js";
import { HOUSE_ENTRIES } from "./entries-houses.js";
import {
  ASPECT_ENTRIES, ELEMENT_ENTRIES, MODALITY_ENTRIES, ANGLE_ENTRIES,
} from "./entries-foundations.js";

export { ATLAS_CATEGORIES, CATEGORY_BY_SLUG, categoryOrder };
export { searchAtlas, RANK_REASONS } from "./search.js";
export {
  COMBINATION_TYPES, COMBINATION_TYPE_LIST, COMBINATION_EXAMPLES,
  composeCombination, combinationPath, combinationFallbackEntries,
  validateCombinations, combinationCounts,
} from "./combinations.js";

/**
 * Every entry, in canonical display order. Authored order inside each file IS
 * the category's display order (planets in chart order, signs Aries→Pisces,
 * houses 1→12, aspects by convention) — nothing here is ever sorted
 * alphabetically, because a house list starting "10th, 11th, 12th, 1st…" is
 * the sort of helpful a reference library cannot afford.
 *
 * `id` and `status` are derived here so no author can mistype them: the id is
 * always `category-slug`, and every entry is `complete` as of Dev Update 3.1 —
 * meaning it satisfies the completion schema below, not that the subject is
 * exhausted. Researcher-tier material is Dev Update 3.2 and no entry claims
 * it. Nothing in the interface renders the status.
 */
export const ATLAS_ENTRIES = Object.freeze(
  [
    ...PLANET_ENTRIES, ...SIGN_ENTRIES, ...HOUSE_ENTRIES,
    ...ASPECT_ENTRIES, ...ELEMENT_ENTRIES, ...MODALITY_ENTRIES, ...ANGLE_ENTRIES,
  ].map((entry, index) => Object.freeze({
    aliases: [], advanced: [], facts: {},
    overview: [], everyday: [], reflections: [],
    ...entry,
    id: `${entry.category}-${entry.slug}`,
    status: "complete",
    order: index,
  })));

/**
 * Every string an entry renders, in one array. The tone and safety scans walk
 * this rather than a hand-listed subset, because the 1.12 scan checked eight
 * fields and Dev Update 3.1 added six more — a scan that has to be updated
 * whenever a field is added is a scan that will eventually miss one.
 */
export function renderedStrings(entry) {
  return [
    entry.title, entry.summary, entry.chartRole, entry.constructive,
    entry.difficult, entry.whenEmphasized, entry.whenScarce,
    entry.role, entry.style, entry.arena, entry.interaction, entry.pairNote, entry.axisRole,
    ...(entry.overview || []), ...(entry.everyday || []), ...(entry.reflections || []),
    ...(entry.themes || []), ...(entry.strengths || []), ...(entry.challenges || []),
    ...(entry.advanced || []), ...Object.values(entry.facts || {}),
  ].filter((s) => typeof s === "string");
}

const BY_REF = new Map(ATLAS_ENTRIES.map((e) => [`${e.category}/${e.slug}`, e]));

/** The entry at "category/slug", or null. Never throws on junk input. */
export function atlasEntry(category, slug) {
  if (typeof category !== "string" || typeof slug !== "string") return null;
  return BY_REF.get(`${category.toLowerCase().trim()}/${slug.toLowerCase().trim()}`) ?? null;
}

/** All entries in one category, in canonical order. */
export function categoryEntries(categorySlug) {
  return ATLAS_ENTRIES.filter((e) => e.category === categorySlug);
}

/**
 * An entry's related entries, resolved and in authored order.
 *
 * Authored, not inferred: the graph is part of the content, and a reference
 * that resolves to nothing is a content bug the validator refuses — so by the
 * time this runs, every ref resolves. The filter is belt-and-braces for a
 * malformed entry arriving from outside the validated set.
 */
export function relatedEntries(entry) {
  return (entry?.related || []).map((ref) => BY_REF.get(ref)).filter(Boolean);
}

/* ── The editorial rules, as regular expressions ───────────────────────────
   Each of these encodes something the reference must not say. They are kept
   together and named, rather than inlined, so a reader can see the whole
   editorial policy in one place — and so a rule can be argued with. */

// Fatalism. "always"/"never" stay ordinary words in code comments; they are
// not ordinary words in reference copy about what a symbol MEANS.
const FATALISTIC = /\b(always|never|guarantees?|guaranteed|proves?|proven|destined|destiny|doomed|fated to|meant to be|soulmates?)\b/i;

// Prediction and trait assertion in the second person. Reflection prompts are
// questions and use "you" freely — "what do you do when…" is the point. What
// is refused is telling a reader what they ARE or what WILL happen: "you will
// find", "you are a natural leader", "you're the type who".
const SECOND_PERSON_VERDICT = /\byou(?:'ll| will)\b|\byou(?:'re| are)\s+(?:a|an|the|naturally|inherently|by nature|someone who|the kind|the type)\b/i;

// Clinical and forensic vocabulary. Astrology describes symbols; it does not
// diagnose, and a reference that reaches for these words has stopped
// describing a symbol and started describing a person's pathology.
const DIAGNOSTIC = /\b(trauma|traumati[sz]ed|ptsd|depress(?:ion|ive)|anxiety disorder|bipolar|narcissist(?:ic)?|psychopath(?:ic)?|sociopath(?:ic)?|personality disorder|mental illness|addict(?:ion|ed)|alcoholic|abus(?:er|ive)|criminal|diagnos(?:is|ed|e)|disorder|patholog(?:y|ical)|therapy|therapist)\b/i;

// Judgement dressed as description.
const JUDGEMENTAL = /\b(toxic|dangerous person|bad placement|weak person|evil|worthless)\b/i;

// Unfinished copy. A reference that ships "coming soon" in a required section
// has shipped a promise instead of an entry.
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX|coming soon|lorem ipsum|placeholder|to be written|WIP)\b/i;

// Researcher-tier claims. Dev Update 3.2 material, named here so an entry
// cannot quietly start advertising it.
const RESEARCHER_CLAIM = /\b(according to (?:ptolemy|lilly|valens)|as cited in|see citation|\[\d+\]|essential dignit(?:y|ies)|debilit(?:y|ies)|almuten|antiscia)\b/i;

const SIGN_NAMES = "aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces";
const ORDINALS = "1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth";

// Sign–house conflation, in both directions. "The 8th House IS Scorpio" and
// "Scorpio is the 8th House" are the same error, and it is the single most
// common beginner mistake the Atlas exists to prevent. The teaching
// association is allowed — but only as an association, which is why the
// entries say "modern teaching association" and "an association, not an
// equivalence" rather than a copula.
const SIGN_HOUSE_CONFLATION = new RegExp(
  `\\b(?:${ORDINALS})\\s+house\\s+(?:is|means|equals)\\s+(?:the\\s+)?(?:${SIGN_NAMES})\\b`
  + `|\\b(?:${SIGN_NAMES})\\s+(?:is|means|equals)\\s+the\\s+(?:${ORDINALS})\\s+house\\b`
  + `|\\bhouse\\s+of\\s+(?:${SIGN_NAMES})\\b`, "i");

// Angle–planet conflation. An angle is a calculated intersection: it has no
// body, no orbit, no speed of its own, and no retrograde. Copy that gives one
// planetary behaviour teaches a reader something false about the chart.
const ANGLE_PLANET_CONFLATION =
  /\b(ascendant|descendant|midheaven|imum coeli)\b[^.]{0,60}\b(retrograde|orbits?|its own orbit|planetary body|is a planet)\b/i;

/**
 * Validate the whole content set. Returns a list of problems; empty means
 * publishable. Run by the test gate, so a malformed entry fails CI rather
 * than shipping as a blank card, a dead link, or a sentence that tells a
 * reader who they are.
 */
export function validateAtlasContent({ categories = ATLAS_CATEGORIES, entries = ATLAS_ENTRIES } = {}) {
  const problems = [];
  const slugRe = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const categorySlugs = new Set(categories.map((c) => c.slug));

  const seenCategory = new Set();
  for (const c of categories) {
    if (!slugRe.test(c.slug)) problems.push(`category slug invalid: "${c.slug}"`);
    if (seenCategory.has(c.slug)) problems.push(`duplicate category slug: "${c.slug}"`);
    seenCategory.add(c.slug);
    for (const field of ["id", "name", "description", "glyph"]) {
      if (!c[field]) problems.push(`category ${c.slug}: missing ${field}`);
    }
  }

  const seenId = new Set();
  const refs = new Set(entries.map((e) => `${e.category}/${e.slug}`));
  // Paragraph-length strings, for the cross-entry duplication scan below.
  const paragraphs = new Map();

  for (const e of entries) {
    const where = `${e.category}/${e.slug}`;
    if (!slugRe.test(e.slug || "")) problems.push(`${where}: slug invalid`);
    if (!categorySlugs.has(e.category)) problems.push(`${where}: unknown category`);
    if (seenId.has(e.id)) problems.push(`${where}: duplicate id "${e.id}"`);
    seenId.add(e.id);
    if (e.id !== `${e.category}-${e.slug}`) problems.push(`${where}: id does not derive from category-slug`);
    if (e.status !== "complete") problems.push(`${where}: status "${e.status}" is not the Dev Update 3.1 completion status`);

    // ── The completion schema ───────────────────────────────────────────
    if (!e.title || typeof e.title !== "string") problems.push(`${where}: missing title`);
    if (!e.summary || e.summary.length < 40) problems.push(`${where}: summary missing or too thin to be useful`);
    if (!Array.isArray(e.overview) || e.overview.length < 2) problems.push(`${where}: needs at least two overview paragraphs`);
    for (const p of e.overview || []) {
      if (typeof p !== "string" || p.length < 120) problems.push(`${where}: an overview paragraph is too thin to be a paragraph`);
    }
    if (!Array.isArray(e.themes) || e.themes.length < 3) problems.push(`${where}: needs at least three themes`);
    if (!Array.isArray(e.everyday) || e.everyday.length < 2) problems.push(`${where}: needs at least two everyday expressions`);
    if (!e.constructive || e.constructive.length < 120) problems.push(`${where}: constructive expression missing or too thin`);
    if (!e.difficult || e.difficult.length < 120) problems.push(`${where}: difficult expression missing or too thin`);
    if (!e.whenEmphasized || e.whenEmphasized.length < 60) problems.push(`${where}: whenEmphasized missing or too thin`);
    if (!Array.isArray(e.strengths) || e.strengths.length < 2) problems.push(`${where}: needs at least two strengths`);
    if (!Array.isArray(e.challenges) || e.challenges.length < 2) problems.push(`${where}: needs at least two challenges`);
    if (!e.chartRole || e.chartRole.length < 40) problems.push(`${where}: chartRole missing or too thin`);
    if (!Array.isArray(e.reflections) || e.reflections.length < 2 || e.reflections.length > 3) {
      problems.push(`${where}: needs two or three reflection prompts`);
    }
    for (const prompt of e.reflections || []) {
      if (typeof prompt !== "string" || !prompt.trim()) problems.push(`${where}: empty reflection prompt`);
      else if (!prompt.trim().endsWith("?")) problems.push(`${where}: reflection prompt "${prompt.slice(0, 40)}…" is not a question`);
    }
    if (!Array.isArray(e.advanced) || !e.advanced.length) problems.push(`${where}: needs at least one advanced paragraph`);
    if (!Array.isArray(e.keywords) || e.keywords.length < 5) problems.push(`${where}: needs at least five keywords`);
    if (!Array.isArray(e.aliases) || !e.aliases.length) problems.push(`${where}: needs at least one search alias`);

    // Composition vocabulary, required per category so a combination cannot
    // reach a half-authored entry and compose a sentence with a hole in it.
    const COMPOSITION_FIELD = { planets: "role", signs: "style", houses: "arena", angles: "axisRole" };
    const needed = COMPOSITION_FIELD[e.category];
    if (needed && !e[needed]) problems.push(`${where}: missing composition field "${needed}"`);
    if (e.category === "aspects") {
      if (!e.interaction) problems.push(`${where}: missing composition field "interaction"`);
      if (!e.pairNote) problems.push(`${where}: missing composition field "pairNote"`);
    }
    // Composition clauses are dropped into someone else's sentence, so they
    // must not open with a capital or close with a full stop.
    for (const field of ["role", "style", "arena", "interaction", "axisRole"]) {
      const clause = e[field];
      if (typeof clause !== "string") continue;
      if (/^[A-Z]/.test(clause)) problems.push(`${where}: composition clause "${field}" starts with a capital`);
      if (/[.!?]$/.test(clause)) problems.push(`${where}: composition clause "${field}" ends with a full stop`);
    }

    for (const ref of e.related || []) {
      if (!refs.has(ref)) problems.push(`${where}: related "${ref}" resolves to nothing`);
      if (ref === where) problems.push(`${where}: relates to itself`);
    }
    for (const alias of e.aliases || []) {
      if (typeof alias !== "string" || !alias.trim()) problems.push(`${where}: empty alias`);
      if (alias !== alias.toLowerCase()) problems.push(`${where}: alias "${alias}" must be lowercase for matching`);
    }

    // ── Tone and safety, over every string the entry renders ────────────
    const strings = renderedStrings(e);
    const rendered = strings.join(" ");
    const scan = (re, label, text = rendered) => {
      const hit = text.match(re);
      if (hit) problems.push(`${where}: ${label} "${hit[0]}"`);
    };
    scan(FATALISTIC, "fatalistic language");
    scan(DIAGNOSTIC, "diagnostic language");
    scan(JUDGEMENTAL, "judgemental language");
    scan(PLACEHOLDER, "placeholder text");
    scan(RESEARCHER_CLAIM, "Researcher-tier claim (Dev Update 3.2)");
    scan(SIGN_HOUSE_CONFLATION, "sign-house conflation");
    scan(ANGLE_PLANET_CONFLATION, "angle-planet conflation");
    // Reflection prompts are questions and may address the reader directly;
    // everything else may not tell a reader what they are or what will happen.
    scan(SECOND_PERSON_VERDICT, "second-person verdict",
      strings.filter((s) => !(e.reflections || []).includes(s)).join(" "));
    if (/[<>]/.test(rendered)) problems.push(`${where}: angle bracket in content — entries are data, not markup`);

    // ── Consistent naming ───────────────────────────────────────────────
    if (e.category === "houses" && !/^(1st|2nd|3rd|[4-9]th|1[0-2]th) House$/.test(e.title || "")) {
      problems.push(`${where}: house title "${e.title}" is not the canonical "Nth House" form`);
    }
    if (e.category === "aspects" && e.title !== `${(e.title || "")[0]}${(e.title || "").slice(1).toLowerCase()}`) {
      problems.push(`${where}: aspect title "${e.title}" is not sentence-capitalised`);
    }

    for (const p of strings) {
      if (p.length < 120) continue;                 // short lines repeat legitimately
      const seen = paragraphs.get(p);
      if (seen && seen !== e.id) problems.push(`${where}: shares a paragraph with ${seen}`);
      else paragraphs.set(p, e.id);
    }
  }

  // Completeness: the exact category boundary, by count and name.
  const required = {
    planets: ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"],
    signs: ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"],
    houses: ["1st-house", "2nd-house", "3rd-house", "4th-house", "5th-house", "6th-house", "7th-house", "8th-house", "9th-house", "10th-house", "11th-house", "12th-house"],
    aspects: ["conjunction", "opposition", "square", "trine", "sextile"],
    elements: ["fire", "earth", "air", "water"],
    modalities: ["cardinal", "fixed", "mutable"],
    angles: ["ascendant", "descendant", "midheaven", "imum-coeli"],
  };
  for (const [category, slugs] of Object.entries(required)) {
    for (const slug of slugs) {
      if (!refs.has(`${category}/${slug}`)) problems.push(`missing required starter entry: ${category}/${slug}`);
    }
  }

  return problems;
}

/** The Atlas methodology note — one sentence, shown once per surface. */
export const ATLAS_METHODOLOGY_NOTE =
  "Symbol Atlas provides authored astrological reference material. It describes "
  + "common interpretive traditions and does not guarantee personality traits, "
  + "events, or outcomes.";

/** The expandable how-this-works explanation for the Atlas home. */
export const ATLAS_METHODOLOGY_POINTS = Object.freeze([
  "Every entry is deterministic, authored reference material shipped with the application — nothing is generated, fetched, or personalised at read time.",
  "Entries describe symbols in general. Where a symbol lands in YOUR chart comes from the calculation settings on the chart itself.",
  "Relationship type never changes what a symbol means; it changes which questions Compatibility asks of the same evidence.",
  "A symbol's meaning on its own does not replace full-chart context — placements, aspects, and houses qualify one another.",
]);
