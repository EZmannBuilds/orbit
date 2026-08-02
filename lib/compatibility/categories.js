// Orbit Axis :: compatibility categories, one set per relationship type.
//
// THE WHOLE POINT OF THIS UPDATE, IN ONE PARAGRAPH
//
// The astrology does not change with the relationship. Venus square Mars is the
// same geometry whoever the two charts belong to. What changes is which
// question you were asking. "Is there friction in how we pursue what we want"
// lands differently between partners, friends, and a parent — not because the
// aspect means something different, but because those relationships are ASKED
// different things. So the evidence is shared and the CATEGORIES differ.
//
// This file holds only the questions and their language. Weights live in
// weights.js, the evidence mapping in evidence.js, the arithmetic in
// scoring.js. Splitting them is what makes each one testable on its own, and
// what stops a copy edit from silently moving a number.
//
// TONE, inherited from lib/interpretation/aspects.js: squares are not bad and
// trines are not good. A category that reads like a school report is both wrong
// and boring. Nothing here grades a relationship, because a chart cannot know
// one.

/** The four relationship types Dev Update 1.10 ships, and nothing else. */
export const COMPATIBILITY_MODES = Object.freeze(["partner", "friend", "family", "self"]);

/**
 * Relationship values that must NOT reach a calculation.
 *
 * `other` and null are unset — the pre-1.10 interface wrote 'other' by default,
 * so it means "nobody chose", not "the other category". `public_figure` is a
 * real classification somebody chose, but it is not one of the four modes and
 * guessing which one it resembles would be inventing a relationship. All three
 * stop at the door with an explanation, never a silent fallback.
 */
export const BLOCKED_RELATIONSHIP_VALUES = Object.freeze(["other", "public_figure", null]);

/**
 * Category definitions per mode.
 *
 * `id`      stable key, used by weights and tests
 * `label`   what the person reads
 * `question` the thing this category is actually asking, shown under the label
 * `supportive` / `straining` how to describe a high or low result IN THIS MODE
 *
 * The same underlying evidence feeds several of these; the wording is what
 * makes each one about its own relationship.
 */
export const CATEGORIES = Object.freeze({
  partner: Object.freeze([
    {
      id: "overall_dynamic", label: "Overall Dynamic",
      question: "How these two charts meet each other day to day.",
      supportive: "There is a lot of natural contact between these charts.",
      straining: "These charts meet at fewer points, which tends to mean more is built deliberately than assumed.",
    },
    {
      id: "emotional_connection", label: "Emotional Connection",
      question: "How emotional needs and instincts line up.",
      supportive: "Emotional rhythms tend to recognise each other quickly.",
      straining: "Emotional needs run on different clocks, so comfort may need asking for rather than assuming.",
    },
    {
      id: "communication", label: "Communication",
      question: "How thinking and talking meet.",
      supportive: "Explaining things to each other tends to take fewer attempts.",
      straining: "The same sentence can land differently than it was meant, so checking beats guessing.",
    },
    {
      id: "attraction_intimacy", label: "Attraction and Intimacy",
      question: "How desire, affection, and closeness interact.",
      supportive: "There is real pull here, and it tends to renew itself.",
      straining: "Wanting and being close may operate on different terms, which is workable once it is named.",
    },
    {
      id: "trust_reliability", label: "Trust and Reliability",
      question: "How dependability and commitment sit between these charts.",
      supportive: "Follow-through tends to be legible to each other.",
      straining: "Reliability may be shown in ways the other does not automatically read as reliable.",
    },
    {
      id: "boundaries", label: "Boundaries",
      question: "How independence and togetherness are negotiated.",
      supportive: "Space and closeness tend to be easy to alternate.",
      straining: "Where one ends and the other begins may need stating out loud more often.",
    },
    {
      id: "conflict_repair", label: "Conflict and Repair",
      question: "What friction looks like, and how it settles.",
      supportive: "Disagreement tends to stay survivable and repair comes back around.",
      straining: "Friction here has momentum, so repair is a skill worth practising rather than assuming.",
    },
    {
      id: "long_term_rhythm", label: "Long-Term Rhythm",
      question: "How these charts handle duration, structure, and change.",
      supportive: "There is staying-power in how these two build.",
      straining: "The pace of change may differ, which asks for renegotiation rather than endurance.",
    },
  ]),

  friend: Object.freeze([
    {
      id: "overall_dynamic", label: "Overall Dynamic",
      question: "How these two charts meet each other.",
      supportive: "There is a lot of natural contact between these charts.",
      straining: "These charts meet at fewer points, so the friendship is more chosen than automatic.",
    },
    {
      id: "trust_reliability", label: "Trust and Reliability",
      question: "How dependability shows up between friends.",
      supportive: "Showing up for each other tends to be legible on both sides.",
      straining: "Reliability may be expressed in ways the other does not immediately register.",
    },
    {
      id: "communication", label: "Communication",
      question: "How conversation moves between these charts.",
      supportive: "Talking tends to be easy and worth doing for its own sake.",
      straining: "Conversation may need more deliberate translation than either expects.",
    },
    {
      id: "shared_energy", label: "Shared Energy",
      question: "How drive, pace, and enthusiasm meet.",
      supportive: "There is momentum here — plans tend to actually happen.",
      straining: "Energy arrives at different times, so plans may need scheduling rather than spontaneity.",
    },
    {
      id: "mutual_support", label: "Mutual Support",
      question: "How encouragement and care travel in both directions.",
      supportive: "Support tends to flow both ways without much bookkeeping.",
      straining: "Support may need asking for, because it is not always offered in the expected shape.",
    },
    {
      id: "boundaries_independence", label: "Boundaries and Independence",
      question: "How much room each chart wants, and how easily it is given.",
      supportive: "Time apart does not cost this friendship anything.",
      straining: "Closeness and distance may need naming, because assumptions differ.",
    },
    {
      id: "conflict_repair", label: "Conflict and Repair",
      question: "What friction looks like, and whether it mends.",
      supportive: "Disagreement here tends not to be fatal.",
      straining: "Friction can linger unless somebody addresses it directly.",
    },
    {
      id: "growth_inspiration", label: "Growth and Inspiration",
      question: "How these charts move each other forward.",
      supportive: "Each tends to widen what the other considers possible.",
      straining: "Growth may come through challenge rather than encouragement, which is slower but real.",
    },
  ]),

  family: Object.freeze([
    {
      id: "overall_dynamic", label: "Overall Dynamic",
      question: "How these two charts meet each other.",
      supportive: "There is a lot of natural contact between these charts.",
      straining: "These charts meet at fewer points, so understanding is built rather than inherited.",
    },
    {
      id: "emotional_safety", label: "Emotional Safety",
      question: "How settled these charts tend to feel around each other.",
      supportive: "Emotional footing tends to come easily here.",
      straining: "Feeling at ease may take more deliberate effort than family is usually assumed to need.",
    },
    {
      id: "communication", label: "Communication",
      question: "How things get said, and heard, between these charts.",
      supportive: "Explaining tends to work on the first attempt.",
      straining: "The same words can carry different weight, so checking meaning is worth the time.",
    },
    {
      id: "support_responsibility", label: "Support and Responsibility",
      question: "How care and obligation are carried.",
      supportive: "Responsibility tends to be shared in a way both can read.",
      straining: "What counts as help may differ, so expectations are better stated than assumed.",
    },
    {
      id: "family_roles", label: "Family Roles",
      question: "How authority, seniority, and role expectations interact.",
      supportive: "Roles here tend to sit comfortably rather than being fought over.",
      straining: "Roles may be assumed rather than agreed, which is worth examining together.",
    },
    {
      id: "boundaries", label: "Boundaries",
      question: "How much separateness is available inside the relationship.",
      supportive: "Independence and closeness coexist without much friction.",
      straining: "Where one person ends and another begins may need saying more than once.",
    },
    {
      id: "conflict_repair", label: "Conflict and Repair",
      question: "What friction looks like, and how it settles.",
      supportive: "Disagreement tends to resolve rather than accumulate.",
      straining: "Friction here has staying-power, so repair benefits from being explicit.",
    },
    {
      id: "generational_patterns", label: "Generational Patterns",
      question: "Which long-running patterns these charts hold in common.",
      supportive: "Shared patterns here tend to be a resource rather than a weight.",
      straining: "Some patterns repeat across these charts, which is useful to notice rather than inherit unexamined.",
    },
  ]),

  self: Object.freeze([
    {
      id: "overall_integration", label: "Overall Integration",
      question: "How much these two saved configurations describe the same person the same way.",
      supportive: "These two configurations largely agree with each other.",
      straining: "These two configurations describe noticeably different emphases.",
    },
    {
      id: "emotional_needs", label: "Emotional Needs",
      question: "What each configuration says is needed to feel settled.",
      supportive: "Both configurations point at similar emotional needs.",
      straining: "The two configurations describe different emotional needs, which is worth comparing against lived experience.",
    },
    {
      id: "communication_style", label: "Communication Style",
      question: "How each configuration describes thinking and expression.",
      supportive: "Both describe a similar way of taking in and handing back information.",
      straining: "The configurations describe different thinking styles.",
    },
    {
      id: "drive_regulation", label: "Drive and Regulation",
      question: "How each configuration describes motivation and its brakes.",
      supportive: "Drive is described consistently across both.",
      straining: "The two differ on how effort starts and how it is restrained.",
    },
    {
      id: "inner_tension", label: "Inner Tension",
      question: "Where the two configurations pull against each other.",
      supportive: "There is little friction between these two descriptions.",
      straining: "These configurations disagree in ways that are worth examining directly.",
    },
    {
      id: "self_trust", label: "Self-Trust",
      question: "How steadiness and self-reliance are described.",
      supportive: "Both describe a similar relationship with your own judgement.",
      straining: "The configurations describe steadiness differently.",
    },
    {
      id: "growth_patterns", label: "Growth Patterns",
      question: "Where each configuration says expansion tends to happen.",
      supportive: "Both point in a similar direction for growth.",
      straining: "The two suggest different directions, which is information rather than a problem.",
    },
    {
      id: "integration_opportunities", label: "Integration Opportunities",
      question: "Where the differences between these configurations are most usable.",
      supportive: "The two fit together with little effort.",
      straining: "The differences here are the most interesting part of the comparison.",
    },
  ]),
});

/** Human title for the comparison surface, per mode. */
export const MODE_TITLES = Object.freeze({
  partner: "Compatibility",
  friend: "Compatibility",
  family: "Compatibility",
  // Self is deliberately not called compatibility: nobody is in a relationship
  // with themselves, and calling it that would be the update's worst sentence.
  self: "Self Pattern Comparison",
});

/** One line under the title explaining what is being compared, per mode. */
export const MODE_SUBTITLES = Object.freeze({
  partner: "How these two charts meet, read for a partner relationship.",
  friend: "How these two charts meet, read for a friendship.",
  family: "How these two charts meet, read for a family relationship.",
  self: "This compares two chart configurations you have both saved as Self. "
      + "It is not a comparison between two people.",
});

/** Optional reflection prompts. Short, and never instructions. */
export const REFLECTION_PROMPTS = Object.freeze({
  partner: Object.freeze([
    "How do we repair after conflict?",
    "Where would clearer boundaries help?",
  ]),
  friend: Object.freeze([
    "What helps this friendship feel mutual?",
    "How do we give each other enough independence?",
  ]),
  family: Object.freeze([
    "Which responsibilities are assumed rather than discussed?",
    "Where would clearer boundaries reduce tension?",
  ]),
  self: Object.freeze([
    "Which description feels more accurate in daily life?",
    "What changes when the birth time or place assumption changes?",
  ]),
});

/** Every category id used by a mode. */
export function categoryIds(mode) {
  return (CATEGORIES[mode] || []).map((c) => c.id);
}

/** Is this stored relationship value allowed to reach a calculation? */
export function isCalculableRelationship(value) {
  return COMPATIBILITY_MODES.includes(value);
}
