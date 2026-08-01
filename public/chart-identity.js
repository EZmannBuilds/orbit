// Orbit Axis :: saved-chart identity — names and relationship types.
//
// Served to the browser AND imported by Node tests, the same way
// public/moon-phase.js is. lib/ is never served, so a single shared copy
// has to live here. It imports nothing and touches no I/O.
//
// Two boundaries, deliberately different, and the difference is the whole
// point of this module:
//
//   the DATABASE tolerates six relationship values plus null, because the
//   application running in Production writes 'other' by default and a
//   migration that breaks the live site is not additive;
//
//   this LAYER accepts only four on a new write, because that is the product
//   model Dev Update 1.10 ships.
//
// Legacy values are read, displayed honestly, and never rewritten by accident.
// They are only replaced when someone explicitly chooses a new one.

/** What the interface offers. New writes must be one of these. */
export const RELATIONSHIP_TYPES = Object.freeze(["self", "family", "friend", "partner"]);

/**
 * What the pre-1.10 application wrote and the constraint still permits.
 * Readable forever; never selectable, never written by this update.
 */
export const LEGACY_RELATIONSHIP_TYPES = Object.freeze(["other", "public_figure"]);

/** Everything the database will accept, for tests and for the constraint. */
export const STORED_RELATIONSHIP_TYPES = Object.freeze([
  ...RELATIONSHIP_TYPES, ...LEGACY_RELATIONSHIP_TYPES,
]);

export const RELATIONSHIP_LABELS = Object.freeze({
  self: "Self",
  family: "Family",
  friend: "Friend",
  partner: "Partner",
});

export const RELATIONSHIP_DESCRIPTIONS = Object.freeze({
  self: "A chart representing you.",
  family: "A relative or chosen-family connection.",
  friend: "A friendship or other platonic connection.",
  partner: "A romantic, dating, or committed-partner connection.",
});

export const UNSET_LABEL = "Relationship not set";
export const UNSET_HELP = "Choose how this chart relates to you.";
export const CHOOSE_ACTION = "Choose relationship";
export const PUBLIC_FIGURE_LABEL = "Legacy classification: Public figure";
export const PUBLIC_FIGURE_HELP =
  "Choose a current relationship type when you are ready to update this chart.";

/**
 * How a stored value should present.
 *
 * `other` and null are the same thing to a reader — the pre-1.10 interface
 * labelled 'other' as "Not specified" — so both read as unset. `public_figure`
 * is different: it is a real classification someone chose, and showing it as
 * "not set" would quietly discard information the account owner entered.
 */
export function relationshipDisplay(value) {
  if (value === null || value === undefined || value === "other") {
    return Object.freeze({
      value: value ?? null, label: UNSET_LABEL, help: UNSET_HELP,
      status: "unset", needsChoice: true, isLegacy: value === "other",
    });
  }
  if (value === "public_figure") {
    return Object.freeze({
      value, label: PUBLIC_FIGURE_LABEL, help: PUBLIC_FIGURE_HELP,
      status: "legacy_classification", needsChoice: true, isLegacy: true,
    });
  }
  if (RELATIONSHIP_TYPES.includes(value)) {
    return Object.freeze({
      value, label: RELATIONSHIP_LABELS[value],
      help: RELATIONSHIP_DESCRIPTIONS[value],
      status: "set", needsChoice: false, isLegacy: false,
    });
  }
  // An unrecognised value should never reach here — the constraint refuses
  // them — but showing the raw string beats inventing a label for it.
  return Object.freeze({
    value, label: String(value), help: UNSET_HELP,
    status: "unknown", needsChoice: true, isLegacy: true,
  });
}

/** The status string the export uses, so a legacy row exports honestly. */
export function relationshipExportStatus(value) {
  if (value === "other") return "legacy_unclassified";
  if (value === "public_figure") return "legacy_classification";
  if (value === null || value === undefined) return "unset";
  if (RELATIONSHIP_TYPES.includes(value)) return "set";
  return "unknown";
}

export class IdentityError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Validates a relationship on a NEW write.
 *
 * A legacy value is refused with its own code rather than a generic "invalid",
 * because the client needs to tell the difference between "you sent nonsense"
 * and "that value exists in your data but can no longer be chosen".
 */
export function validateRelationship(value, { required = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new IdentityError("relationship_type_required",
        "Choose how this chart relates to you.");
    }
    return null;
  }
  if (LEGACY_RELATIONSHIP_TYPES.includes(value)) {
    throw new IdentityError("relationship_type_not_selectable",
      "That relationship type is no longer available. Choose Self, Family, Friend, or Partner.");
  }
  if (!RELATIONSHIP_TYPES.includes(value)) {
    throw new IdentityError("relationship_type_invalid",
      "Choose Self, Family, Friend, or Partner.");
  }
  return value;
}

export const NAME_MAX = 60;
export const DEFAULT_FIRST_CHART_NAME = "My Chart";
export const DEFAULT_FIRST_CHART_RELATIONSHIP = "self";

/**
 * Chart names.
 *
 * Unicode and emoji are allowed — people name charts in their own language and
 * with whatever characters they like. Control characters are not: they are
 * invisible, they break line rendering, and a name nobody can see is a name
 * nobody can distinguish. The length limit counts code points rather than
 * UTF-16 units so an emoji costs one character, not two.
 */
export function validateName(raw) {
  if (typeof raw !== "string") {
    throw new IdentityError("chart_name_required", "Enter a name for this chart.");
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new IdentityError("chart_name_required", "Enter a name for this chart.");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\u2028\u2029]/.test(trimmed)) {
    throw new IdentityError("chart_name_invalid", "That name contains characters Orbit can't display.");
  }
  if ([...trimmed].length > NAME_MAX) {
    throw new IdentityError("chart_name_too_long", `Keep the name to ${NAME_MAX} characters or fewer.`);
  }
  return trimmed;
}

/**
 * The first visible grapheme of a word.
 *
 * Grapheme, not code point: a combining-mark name ("é" spelled e + U+0301)
 * keeps its accent, and a ZWJ emoji sequence stays one visible symbol instead
 * of decomposing into its first component. The code-point path is the fallback
 * for engines without Intl.Segmenter, where losing a combining mark is the
 * graceful degradation rather than the design.
 */
function firstGrapheme(word) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)) {
      return part.segment;
    }
    return "";
  }
  return [...word][0] ?? "";
}

/**
 * Deterministic initials for the fallback avatar.
 *
 * Two charts sharing a name share initials — that is correct, and it is why
 * the fallback is never the only thing distinguishing them: the relationship
 * label sits beside it.
 */
export function chartInitials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = firstGrapheme(words[0]) || "?";
  if (words.length === 1) return first.toUpperCase();
  const second = firstGrapheme(words[words.length - 1]);
  return (first + second).toUpperCase();
}

/**
 * The identity a chart API response may carry.
 *
 * `avatar_storage_path` is deliberately absent. The path contains the owner's
 * user id and the bucket layout, and no client needs either — `hasAvatar` plus
 * a version for cache-busting is the whole contract.
 */
export function publicIdentity(chart) {
  if (!chart) return null;
  const rel = relationshipDisplay(chart.relationship_type ?? null);
  return Object.freeze({
    id: chart.id,
    name: chart.nickname || DEFAULT_FIRST_CHART_NAME,
    initials: chartInitials(chart.nickname),
    relationship: rel,
    isPrimary: chart.is_primary === true,
    hasAvatar: Boolean(chart.avatar_storage_path),
    avatarVersion: Number.isFinite(chart.avatar_version) ? chart.avatar_version : 0,
    updatedAt: chart.updated_at ?? null,
  });
}

/** Fields a client may send to the identity endpoint. Nothing else is read. */
export const IDENTITY_WRITABLE_FIELDS = Object.freeze([
  "nickname", "relationship_type", "expected_updated_at",
]);

/**
 * Builds the patch for an identity update.
 *
 * Only the keys actually present are returned, so a name-only save leaves
 * relationship_type untouched — which is what keeps an avatar or rename from
 * silently converting somebody's `public_figure` row into something else.
 */
export function buildIdentityPatch(input, { isFirstChart = false } = {}) {
  const patch = {};
  if (input && Object.prototype.hasOwnProperty.call(input, "nickname")) {
    patch.nickname = validateName(input.nickname);
  }
  if (input && Object.prototype.hasOwnProperty.call(input, "relationship_type")) {
    patch.relationship_type = validateRelationship(input.relationship_type, { required: true });
  } else if (isFirstChart && !Object.keys(patch).length) {
    // Nothing to do; the caller decides whether an empty patch is an error.
  }
  return patch;
}
