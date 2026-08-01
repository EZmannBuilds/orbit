// Orbit Axis :: saved-chart identity — names, relationship types, and the
// deliberate gap between what the database tolerates and what the product
// offers.
//
// The gap is the thing worth testing. A four-value constraint would have been
// simpler and would have broken the running site, so these tests pin both
// halves: six values readable at the database boundary, four writable through
// the Dev Update 1.10 API.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELATIONSHIP_TYPES, LEGACY_RELATIONSHIP_TYPES, STORED_RELATIONSHIP_TYPES,
  RELATIONSHIP_LABELS, relationshipDisplay, relationshipExportStatus,
  validateRelationship, validateName, chartInitials, publicIdentity,
  buildIdentityPatch, NAME_MAX, DEFAULT_FIRST_CHART_NAME,
  DEFAULT_FIRST_CHART_RELATIONSHIP, IdentityError,
} from "../public/chart-identity.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase", "migrations", "20260801120000_chart_identity_relationship_avatars.sql"),
  "utf8");

const threw = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

// ── The four the product offers ─────────────────────────────────────────────

test("exactly four relationship types are offered, and each has a label", () => {
  assert.deepEqual([...RELATIONSHIP_TYPES], ["self", "family", "friend", "partner"]);
  for (const t of RELATIONSHIP_TYPES) {
    assert.ok(RELATIONSHIP_LABELS[t], `${t} has no label`);
  }
  assert.ok(!RELATIONSHIP_TYPES.includes("other"));
  assert.ok(!RELATIONSHIP_TYPES.includes("public_figure"));
});

test("all four are accepted on a new write", () => {
  for (const t of RELATIONSHIP_TYPES) assert.equal(validateRelationship(t), t);
});

test("the first chart defaults to Self and My Chart", () => {
  assert.equal(DEFAULT_FIRST_CHART_RELATIONSHIP, "self");
  assert.equal(DEFAULT_FIRST_CHART_NAME, "My Chart");
});

test("an additional chart has no silent default — the choice is required", () => {
  assert.equal(threw(() => validateRelationship(null)), "relationship_type_required");
  assert.equal(threw(() => validateRelationship(undefined)), "relationship_type_required");
  assert.equal(threw(() => validateRelationship("")), "relationship_type_required");
  // And nothing quietly becomes "friend" or "other".
  assert.equal(validateRelationship(null, { required: false }), null);
});

test("multiple Self charts are allowed — no uniqueness rule exists", () => {
  assert.doesNotMatch(MIGRATION, /unique[^;]*relationship_type/i);
  assert.doesNotMatch(MIGRATION, /relationship_type[^;]*unique/i);
  // Two charts can both be self; nothing in validation objects.
  assert.equal(validateRelationship("self"), "self");
  assert.equal(validateRelationship("self"), "self");
});

// ── The two the database still tolerates ────────────────────────────────────

test("the constraint permits six values plus null, so Production keeps working", () => {
  const clause = MIGRATION.slice(
    MIGRATION.indexOf("birth_profiles_relationship_type_check"),
    MIGRATION.indexOf("validate constraint"));
  for (const v of STORED_RELATIONSHIP_TYPES) {
    assert.ok(clause.includes(`'${v}'`), `${v} missing from the constraint`);
  }
  assert.match(clause, /relationship_type is null/,
    "legacy nulls must remain writable");
});

test("legacy values are refused on a NEW write, with their own code", () => {
  for (const v of LEGACY_RELATIONSHIP_TYPES) {
    assert.equal(threw(() => validateRelationship(v)), "relationship_type_not_selectable",
      `${v} must be distinguishable from nonsense, not lumped in with it`);
  }
  assert.equal(threw(() => validateRelationship("nonsense")), "relationship_type_invalid");
});

test("`other` and null both read as unset, because the old UI called it Not specified", () => {
  for (const v of [null, undefined, "other"]) {
    const d = relationshipDisplay(v);
    assert.equal(d.label, "Relationship not set");
    assert.equal(d.status, "unset");
    assert.ok(d.needsChoice, "and both offer a way to classify it");
  }
  assert.equal(relationshipDisplay("other").isLegacy, true);
  assert.equal(relationshipDisplay(null).isLegacy, false);
});

test("`public_figure` is preserved and named, never disguised as something else", () => {
  const d = relationshipDisplay("public_figure");
  assert.match(d.label, /Legacy classification: Public figure/);
  assert.equal(d.status, "legacy_classification");
  assert.ok(d.needsChoice);
  // It must not be shown as one of the four, nor as merely unset.
  assert.notEqual(d.label, "Relationship not set");
  for (const t of RELATIONSHIP_TYPES) assert.notEqual(d.label, RELATIONSHIP_LABELS[t]);
});

test("export states the stored value honestly, with its status", () => {
  assert.equal(relationshipExportStatus("other"), "legacy_unclassified");
  assert.equal(relationshipExportStatus("public_figure"), "legacy_classification");
  // Distinct from legacy_unclassified: this row NEVER carried a value, while
  // an 'other' row carries the pre-1.10 default the old application wrote.
  assert.equal(relationshipExportStatus(null), "unclassified");
  assert.equal(relationshipExportStatus("partner"), "set");
});

test("an avatar-only or name-only save never rewrites a legacy relationship", () => {
  // The patch carries only the keys actually sent. A rename cannot silently
  // convert somebody's public_figure row into one of the four.
  assert.deepEqual(buildIdentityPatch({ nickname: "Renamed" }), { nickname: "Renamed" });
  assert.ok(!("relationship_type" in buildIdentityPatch({ nickname: "Renamed" })));
  assert.deepEqual(buildIdentityPatch({}), {});
  // An explicit change does replace it, and must be one of the four.
  assert.deepEqual(buildIdentityPatch({ relationship_type: "family" }), { relationship_type: "family" });
  assert.equal(threw(() => buildIdentityPatch({ relationship_type: "public_figure" })),
    "relationship_type_not_selectable");
});

test("nothing infers a relationship from the chart name", () => {
  const src = readFileSync(join(ROOT, "public", "chart-identity.js"), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n");
  for (const word of ["mother", "father", "sister", "brother", "wife", "husband", "mum", "dad"]) {
    assert.ok(!code.toLowerCase().includes(word), `${word} suggests name-based inference`);
  }
  // Neither validator so much as receives the name alongside the relationship.
  assert.equal(validateRelationship("friend"), "friend");
});

// ── Names ───────────────────────────────────────────────────────────────────

test("names are trimmed, bounded, and may hold Unicode and emoji", () => {
  assert.equal(validateName("  Ada  "), "Ada");
  assert.equal(validateName("Ada Lovelace"), "Ada Lovelace");
  assert.equal(validateName("Zoë Müller"), "Zoë Müller");
  assert.equal(validateName("🌙 Luna"), "🌙 Luna");
  assert.equal(validateName("x".repeat(NAME_MAX)).length, NAME_MAX);
  assert.equal(threw(() => validateName("x".repeat(NAME_MAX + 1))), "chart_name_too_long");
  assert.equal(threw(() => validateName("   ")), "chart_name_required");
  assert.equal(threw(() => validateName(null)), "chart_name_required");
});

test("the length limit counts code points, so an emoji costs one character", () => {
  // "😀" is two UTF-16 units. Sixty of them is 120 units but sixty characters.
  assert.equal(validateName("😀".repeat(NAME_MAX)).length, NAME_MAX * 2);
  assert.equal(threw(() => validateName("😀".repeat(NAME_MAX + 1))), "chart_name_too_long");
});

test("control characters are refused, because an invisible name is unusable", () => {
  for (const cp of [0x00, 0x07, 0x1B, 0x7F, 0x2028]) {
    assert.equal(threw(() => validateName("A" + String.fromCharCode(cp) + "B")),
      "chart_name_invalid", `U+${cp.toString(16)} should be refused`);
  }
});

test("duplicate names are allowed, and initials alone do not distinguish them", () => {
  assert.equal(validateName("Alex"), "Alex");
  assert.equal(validateName("Alex"), "Alex");
  assert.equal(chartInitials("Alex"), chartInitials("Alex"));
  // Which is exactly why identity carries a relationship too.
  const a = publicIdentity({ id: "1", nickname: "Alex", relationship_type: "friend" });
  const b = publicIdentity({ id: "2", nickname: "Alex", relationship_type: "partner" });
  assert.equal(a.name, b.name);
  assert.notEqual(a.relationship.label, b.relationship.label);
});

test("initials are deterministic and degrade rather than throw", () => {
  assert.equal(chartInitials("Ada Lovelace"), "AL");
  assert.equal(chartInitials("Luna"), "L");
  assert.equal(chartInitials("  spaced   out  "), "SO");
  assert.equal(chartInitials(""), "?");
  assert.equal(chartInitials(null), "?");
  assert.equal(chartInitials("Ada Lovelace"), chartInitials("Ada Lovelace"));
  const src = readFileSync(join(ROOT, "public", "chart-identity.js"), "utf8");
  assert.ok(!src.includes("Math.random"), "the fallback is deterministic");
});

test("initials keep whole graphemes: emoji, ZWJ sequences, combining marks", () => {
  // An emoji name yields the emoji, not half a surrogate pair.
  assert.equal(chartInitials("🌙 Chart"), "🌙C");
  // A ZWJ family stays one visible symbol instead of decomposing.
  assert.equal(chartInitials("👨‍👩‍👧‍👦 Fam"), "👨‍👩‍👧‍👦F");
  // A combining accent travels with its base letter.
  assert.equal(chartInitials("éva"), "é".toUpperCase());
  // Unicode words work like any others.
  assert.equal(chartInitials("Ólafur Grímsson"), "ÓG");
});

test("initials are safe for punctuation-leading and hostile-ish names", () => {
  for (const name of ["'Round Midnight", "…ellipsis", "-dash", "«quoted»", "。start"]) {
    const initials = chartInitials(name);
    assert.ok(initials.length > 0, `${name} yields something visible`);
    assert.equal(initials, chartInitials(name), `${name} is deterministic`);
  }
  // Whitespace-only legacy nicknames degrade to the placeholder, not a crash.
  assert.equal(chartInitials("   "), "?");
  assert.equal(chartInitials(undefined), "?");
});

// ── What leaves the server ──────────────────────────────────────────────────

test("the storage path never reaches a chart API response", () => {
  const id = publicIdentity({
    id: "c1", nickname: "Ada", relationship_type: "self", is_primary: true,
    avatar_storage_path: "9f2b/c1/avatar.webp", avatar_version: 3,
  });
  assert.ok(!("avatar_storage_path" in id), "the path holds the owner id and the bucket layout");
  assert.equal(id.hasAvatar, true, "presence is the whole contract");
  assert.equal(id.avatarVersion, 3);
  assert.ok(!JSON.stringify(id).includes("9f2b"));
});

test("a chart with no avatar still has a usable identity", () => {
  const id = publicIdentity({ id: "c2", nickname: "Bo", relationship_type: null });
  assert.equal(id.hasAvatar, false);
  assert.equal(id.avatarVersion, 0);
  assert.equal(id.initials, "B");
  assert.equal(id.relationship.label, "Relationship not set");
});

// ── Migration shape ─────────────────────────────────────────────────────────

test("the migration is additive and reuses the columns that already existed", () => {
  assert.match(MIGRATION, /add column if not exists avatar_storage_path/);
  assert.match(MIGRATION, /add column if not exists avatar_version/);
  // Nothing renamed, nothing dropped, no duplicate identity columns.
  assert.doesNotMatch(MIGRATION, /rename column/i);
  assert.doesNotMatch(MIGRATION, /drop column/i);
  assert.doesNotMatch(MIGRATION, /add column if not exists display_name/i);
  assert.doesNotMatch(MIGRATION, /add column if not exists nickname/i);
  assert.doesNotMatch(MIGRATION, /add column if not exists is_primary/i);
});

test("the backfill is deterministic and touches nothing explicit", () => {
  const backfill = MIGRATION.slice(MIGRATION.indexOf("update public.birth_profiles"),
                                   MIGRATION.indexOf("-- ── Private avatar bucket"));
  assert.match(backfill, /set relationship_type = 'self'/);
  assert.match(backfill, /where is_primary = true/);
  assert.match(backfill, /and relationship_type is null/,
    "an explicit value must never be overwritten by the backfill");
});

test("the avatar bucket is private and owner-scoped", () => {
  assert.match(MIGRATION, /'chart-avatars'/);
  const insert = MIGRATION.slice(MIGRATION.indexOf("insert into storage.buckets"),
                                 MIGRATION.indexOf("-- ── Owner-scoped storage policies"));
  assert.match(insert, /false,/, "public = false");
  assert.match(insert, /set public = false/, "and a re-run cannot flip it public");
  // Every policy compares the first path segment against the caller.
  const policies = MIGRATION.slice(MIGRATION.indexOf("-- ── Owner-scoped storage policies"));
  const guards = policies.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) || [];
  assert.ok(guards.length >= 5, `expected owner guards on every policy, found ${guards.length}`);
  assert.ok(!/to anon/.test(policies), "anonymous matches no policy, which is the refusal");
});

test("recovery is documented rather than a rollback being called harmless", () => {
  assert.match(MIGRATION, /RECOVERY, not rollback/);
  assert.match(MIGRATION, /data loss/i);
});

test("the future constraint tightening is written down but not performed", () => {
  assert.match(MIGRATION, /Future cleanup/);
  assert.match(MIGRATION, /not assigned to Dev Update 1\.11/);
  // The narrow four-value constraint must not be in this migration.
  const clause = MIGRATION.slice(MIGRATION.indexOf("check ("), MIGRATION.indexOf("not valid"));
  assert.ok(clause.includes("'other'"), "tightening here would break the live site");
});

test("IdentityError carries a structured code for every rejection", () => {
  const e = new IdentityError("chart_name_required", "x");
  assert.ok(e instanceof Error);
  assert.equal(e.code, "chart_name_required");
});
