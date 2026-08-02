// Orbit Axis :: Symbol Atlas search (Dev Update 1.12).
//
// Small, deterministic, and entirely local. No network request, no library,
// no fuzziness, no stored queries — a query is plain text that lives exactly
// as long as the keystroke that typed it.
//
// THE RANKING, documented because it is the contract:
//
//   0  exact title        "moon" → Moon
//   1  exact alias        "mc" → Midheaven, "first house" → 1st House
//   2  title prefix       "sag" → Sagittarius
//   3  keyword match      "career" → Midheaven, 10th House…
//   4  category match     "planets" → every planet
//   5  summary substring  "friction" → Square
//
// Within a rank, ties break by category order then authored entry order —
// the same two lists every screen uses — so identical queries return
// identical orderings, forever. Tested rank by rank.

import { ATLAS_ENTRIES, ATLAS_CATEGORIES, categoryOrder } from "./index.js";

export const RANK_REASONS = Object.freeze([
  "exact title", "exact alias", "title prefix", "keyword", "category", "summary",
]);

/** Lowercase, trim, collapse whitespace, strip edge punctuation. */
function normalise(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1st house" and "first house" should meet in the middle. */
const ORDINAL_WORDS = Object.freeze({
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
  eleventh: "11th", twelfth: "12th",
});

function withOrdinalForms(query) {
  const swapped = query.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/g,
    (word) => ORDINAL_WORDS[word]);
  return swapped === query ? [query] : [query, swapped];
}

// Per-entry search surface, built once on first use. Lazy because index.js
// re-exports this module — an eager build would read ATLAS_ENTRIES while that
// module is still initializing (a real crash, found the first time this ran).
// ~50 entries means the build is microseconds either way.
let INDEX = null;
let CATEGORY_TERMS = null;
function ensureIndex() {
  if (INDEX) return;
  INDEX = ATLAS_ENTRIES.map((entry) => ({
    entry,
    title: normalise(entry.title),
    aliases: (entry.aliases || []).map(normalise),
    keywords: (entry.keywords || []).map(normalise),
    summary: normalise(entry.summary),
    category: entry.category,
  }));
  CATEGORY_TERMS = new Map();
  for (const c of ATLAS_CATEGORIES) {
    for (const term of [normalise(c.name), normalise(c.shortName), c.slug, ...(c.searchTerms || []).map(normalise)]) {
      if (term) CATEGORY_TERMS.set(term, c.slug);
    }
  }
}

/**
 * Search the Atlas. Returns [{ entry, rank, reason }] sorted best-first, or []
 * for a blank query. `limit` caps the list AFTER ranking, so a tight limit
 * still surfaces the best matches rather than the first file's.
 */
export function searchAtlas(rawQuery, { limit = 30 } = {}) {
  ensureIndex();
  const base = normalise(rawQuery);
  if (!base) return [];
  const queries = withOrdinalForms(base);

  const matches = [];
  for (const item of INDEX) {
    let best = Infinity;
    for (const q of queries) {
      if (item.title === q) { best = Math.min(best, 0); continue; }
      if (item.aliases.some((a) => a === q)) { best = Math.min(best, 1); continue; }
      if (item.title.startsWith(q)) { best = Math.min(best, 2); continue; }
      if (item.keywords.some((k) => k === q || k.startsWith(q))) { best = Math.min(best, 3); continue; }
      const categoryHit = CATEGORY_TERMS.get(q);
      if (categoryHit && item.category === categoryHit) { best = Math.min(best, 4); continue; }
      if (q.length >= 3 && item.summary.includes(q)) { best = Math.min(best, 5); continue; }
    }
    if (best !== Infinity) matches.push({ entry: item.entry, rank: best, reason: RANK_REASONS[best] });
  }

  matches.sort((a, b) =>
    a.rank - b.rank
    || categoryOrder(a.entry.category) - categoryOrder(b.entry.category)
    || a.entry.order - b.entry.order);

  return matches.slice(0, limit);
}
