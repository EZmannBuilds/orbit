// Orbit Axis :: the arithmetic. Pure, deterministic, and boring on purpose.
//
// Same evidence in, same numbers out, forever. No clock, no randomness, no
// network, no ordering dependence beyond what the engine already fixed. A test
// can call these functions directly and a reviewer can follow them by hand,
// which is the whole reason the scoring is not tangled into the service.

import {
  bandsFor, CATEGORY_WEIGHTS, MIN_EVIDENCE_FOR_BAND, NEUTRAL_SCORE, SCORE_SWING,
  COMPATIBILITY_VERSION,
} from "./weights.js";
import { CATEGORIES, categoryIds } from "./categories.js";

/**
 * Squash unbounded accumulated evidence into a bounded 0..1 lean.
 *
 * A relationship with forty contacts should not score off the scale relative to
 * one with fifteen; what matters is the BALANCE of support and strain, and how
 * much evidence stands behind it. `net / (total + k)` does both: it approaches
 * 1 only when evidence is both one-sided and plentiful, and it keeps a single
 * lucky tight aspect from pinning a category at the extreme.
 *
 * k = 2 means roughly two contributions of weight 1 must accumulate before the
 * lean can exceed half its possible value.
 */
const SATURATION_K = 2;

export function leanFrom(supportive, straining) {
  const total = supportive + straining;
  if (!(total > 0)) return 0;
  return (supportive - straining) / (total + SATURATION_K);
}

/**
 * The band a score falls into. Scores are clamped before this is called.
 *
 * The thresholds are shared across modes; only the WORDS differ, and only for
 * self (see SELF_BANDS). Splitting the numbers per mode would have made two
 * scales to keep honest instead of one.
 */
export function bandFor(score, mode, scope = "overall") {
  const bands = bandsFor(mode, scope);
  return bands.find((b) => score >= b.min) ?? bands[bands.length - 1];
}

/**
 * Score one category from its contributions.
 *
 * `mixed` contributions (direction 0 — a conjunction whose pair is genuinely
 * both) count toward evidence and toward neither side. That is the honest
 * treatment: they are why a category can be well-evidenced and still land in
 * the middle, which is a real result rather than a missing one.
 */
export function scoreCategory(contributions, mode) {
  let supportive = 0, straining = 0, mixed = 0;
  for (const c of contributions) {
    if (c.direction > 0) supportive += c.magnitude;
    else if (c.direction < 0) straining += c.magnitude;
    else mixed += c.magnitude;
  }
  const evidence = supportive + straining + mixed;
  const lean = leanFrom(supportive, straining);
  const raw = NEUTRAL_SCORE + lean * SCORE_SWING;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const hasBand = evidence >= MIN_EVIDENCE_FOR_BAND;
  // These carry a `Weight` suffix because a category definition already owns
  // `supportive` and `straining` — those are the AUTHORED SENTENCES describing
  // a high or low result. The two sets get merged into one object downstream,
  // and when these were named plainly the numbers overwrote the copy: every
  // category summary rendered as a bare decimal. Nothing type-checks that.
  return {
    score, evidence: round2(evidence),
    supportiveWeight: round2(supportive),
    strainingWeight: round2(straining),
    mixedWeight: round2(mixed),
    hasBand,
    band: hasBand ? bandFor(score, mode, "category") : null,
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Rank contributions for display: loudest first, then a stable tiebreak.
 *
 * The tiebreak matters more than it looks. Two contacts of identical magnitude
 * must always order the same way or the "top three factors" list would shuffle
 * between identical runs and determinism would be quietly false.
 */
export function rankContributions(contributions) {
  return [...contributions].sort((a, b) =>
    b.magnitude - a.magnitude
    || a.orb - b.orb
    || a.contact.localeCompare(b.contact)
    || a.aspect.localeCompare(b.aspect)
    || a.categoryId.localeCompare(b.categoryId));
}

/**
 * Score every category for a mode, plus the weighted overall.
 *
 * Categories with no evidence still appear — silently dropping them would
 * misrepresent the comparison as narrower than it is, and "we found little
 * here" is a legitimate answer a person can act on.
 */
export function scoreComparison(evidence, mode) {
  const ids = categoryIds(mode);
  const weights = CATEGORY_WEIGHTS[mode] || {};
  const byCategory = new Map(ids.map((id) => [id, []]));
  for (const c of evidence) {
    if (byCategory.has(c.categoryId)) byCategory.get(c.categoryId).push(c);
  }

  const categories = (CATEGORIES[mode] || []).map((definition) => {
    const contributions = byCategory.get(definition.id) || [];
    const scored = scoreCategory(contributions, mode);
    const ranked = rankContributions(contributions);
    return {
      ...definition,
      ...scored,
      weight: weights[definition.id] ?? 0,
      supporting: ranked.filter((c) => c.direction > 0),
      straining_factors: ranked.filter((c) => c.direction < 0),
      mixed_factors: ranked.filter((c) => c.direction === 0),
    };
  });

  // The overall is a weighted mean of the categories that actually have
  // evidence. Including empty ones would drag every sparse comparison toward
  // neutral and make the overall a measure of how many aspects exist rather
  // than of what they say.
  let weighted = 0, weightUsed = 0;
  for (const category of categories) {
    if (!category.hasBand) continue;
    weighted += category.score * category.weight;
    weightUsed += category.weight;
  }
  const hasOverall = weightUsed > 0;
  const overallScore = hasOverall
    ? Math.max(0, Math.min(100, Math.round(weighted / weightUsed)))
    : NEUTRAL_SCORE;

  return {
    version: COMPATIBILITY_VERSION,
    mode,
    categories,
    overall: {
      score: overallScore,
      band: hasOverall ? bandFor(overallScore, mode) : null,
      hasBand: hasOverall,
      // How much of the mode's weighting had evidence behind it. A comparison
      // resting on a third of its categories should say so rather than present
      // the same confidence as one resting on all of them.
      coverage: Math.round(weightUsed * 100) / 100,
    },
  };
}

/**
 * The categories a person should look at first.
 *
 * Strengths are the highest-scoring well-evidenced categories; growth areas the
 * lowest. Both are capped at three: a list of eight "key areas" is not a list
 * of key areas. Ties break on category id so repeated runs agree.
 */
export function highlightCategories(categories, { limit = 3 } = {}) {
  const evidenced = categories.filter((c) => c.hasBand);
  const byScore = (dir) => [...evidenced].sort((a, b) =>
    dir * (b.score - a.score) || a.id.localeCompare(b.id));
  const strengths = byScore(1).filter((c) => c.score > NEUTRAL_SCORE).slice(0, limit);
  const growth = byScore(-1).filter((c) => c.score < NEUTRAL_SCORE).slice(0, limit);
  return { strengths, growth };
}
