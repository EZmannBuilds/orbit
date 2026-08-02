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

/**
 * Every entry, in canonical display order. Authored order inside each file IS
 * the category's display order (planets in chart order, signs Aries→Pisces,
 * houses 1→12, aspects by convention) — nothing here is ever sorted
 * alphabetically, because a house list starting "10th, 11th, 12th, 1st…" is
 * the sort of helpful a reference library cannot afford.
 *
 * `id` and `status` are derived here so no author can mistype them: the id is
 * always `category-slug`, and every 1.12 entry is a starter entry. "Starter"
 * describes the release boundary (Dev Update 3.1 deepens content), not a
 * quality apology — nothing in the interface renders it.
 */
export const ATLAS_ENTRIES = Object.freeze(
  [
    ...PLANET_ENTRIES, ...SIGN_ENTRIES, ...HOUSE_ENTRIES,
    ...ASPECT_ENTRIES, ...ELEMENT_ENTRIES, ...MODALITY_ENTRIES, ...ANGLE_ENTRIES,
  ].map((entry, index) => Object.freeze({
    aliases: [], advanced: [], facts: {},
    ...entry,
    id: `${entry.category}-${entry.slug}`,
    status: "starter",
    order: index,
  })));

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

/**
 * Validate the whole content set. Returns a list of problems; empty means
 * publishable. Run by the test gate, so a malformed entry fails CI rather
 * than shipping as a blank card or a dead link.
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
  // The tone rules, enforced. Lowercased word-boundary scan over every string
  // an entry renders. "always"/"never" stay conversational words in code
  // comments — but not in reference copy about what a symbol MEANS.
  const banned = /\b(always|never|guarantees?|guaranteed|proves?|proven|destined|destiny|doomed|fated to)\b/i;

  for (const e of entries) {
    const where = `${e.category}/${e.slug}`;
    if (!slugRe.test(e.slug || "")) problems.push(`${where}: slug invalid`);
    if (!categorySlugs.has(e.category)) problems.push(`${where}: unknown category`);
    if (seenId.has(e.id)) problems.push(`${where}: duplicate id "${e.id}"`);
    seenId.add(e.id);
    if (e.id !== `${e.category}-${e.slug}`) problems.push(`${where}: id does not derive from category-slug`);
    if (e.status !== "starter") problems.push(`${where}: status "${e.status}" claims beyond Dev Update 1.12`);

    if (!e.title || typeof e.title !== "string") problems.push(`${where}: missing title`);
    if (!e.summary || e.summary.length < 40) problems.push(`${where}: summary missing or too thin to be useful`);
    if (!Array.isArray(e.themes) || e.themes.length < 3) problems.push(`${where}: needs at least three themes`);
    if (!Array.isArray(e.strengths) || e.strengths.length < 2) problems.push(`${where}: needs at least two strengths`);
    if (!Array.isArray(e.challenges) || e.challenges.length < 2) problems.push(`${where}: needs at least two challenges`);
    if (!e.chartRole || e.chartRole.length < 40) problems.push(`${where}: chartRole missing or too thin`);
    if (!Array.isArray(e.keywords) || e.keywords.length < 3) problems.push(`${where}: needs at least three keywords`);

    for (const ref of e.related || []) {
      if (!refs.has(ref)) problems.push(`${where}: related "${ref}" resolves to nothing`);
      if (ref === where) problems.push(`${where}: relates to itself`);
    }
    for (const alias of e.aliases || []) {
      if (typeof alias !== "string" || !alias.trim()) problems.push(`${where}: empty alias`);
      if (alias !== alias.toLowerCase()) problems.push(`${where}: alias "${alias}" must be lowercase for matching`);
    }

    const rendered = [
      e.title, e.summary, e.chartRole,
      ...(e.themes || []), ...(e.strengths || []), ...(e.challenges || []),
      ...(e.advanced || []), ...Object.values(e.facts || {}),
    ].join(" ");
    const hit = rendered.match(banned);
    if (hit) problems.push(`${where}: fatalistic language "${hit[0]}"`);
    if (/[<>]/.test(rendered)) problems.push(`${where}: angle bracket in content — entries are data, not markup`);
  }

  // Starter-content completeness: the exact 1.12 boundary, by count and name.
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
