// Orbit Axis :: base authenticated data export (Dev Update 1.2).
//
// WHY THIS USES THE USER'S OWN TOKEN, NOT THE SERVICE-ROLE KEY
//
// The obvious implementation reads every table with the service-role key and
// filters by owner id in application code. That works right up until one query
// forgets its filter, at which point the export quietly hands one person
// somebody else's birth data.
//
// Instead, every request here is made with the SIGNED-IN USER'S access token.
// Row-level security then does the filtering, in the database, for every table
// at once, whether or not this file remembered to ask. A missing `owner_id`
// filter becomes an empty result rather than a data breach — the failure mode
// is disappointing instead of catastrophic, which is the right way round.
//
// It also means export works where deletion currently cannot: the approved
// shared-database configuration refuses to run with a service-role key present,
// so anything that requires one is unavailable in production today. Export
// needs no such key and so has no such problem.
//
// WHAT IS DELIBERATELY ABSENT
//
// No job table, no queue, no expiring link, no archive format. The data a
// single account owns today is a few kilobytes of JSON. An asynchronous export
// pipeline would be a new store to secure, to include in this very export, and
// to delete on account closure — three new obligations to solve a problem
// nobody has. Dev Update 2.4 revisits this when journals make it real.

import { getSupabaseUser } from "../auth/supabase-auth.js";
import { supabaseConfig } from "../local-llm/config.js";
import { relationshipExportStatus } from "../charts/identity.js";

/**
 * Bumped whenever the shape changes in a way a consumer could notice.
 * Additive fields do not require a bump; removing or retyping one does.
 * 1.1.0: chart identity (Dev Update 1.10) — relationship_type_status and the
 * avatar_present / avatar_exported / avatar_export_limitation trio joined
 * each birth profile, and the internal avatar storage columns were removed
 * from the rows (they name the private bucket layout, which is not the
 * account holder's content).
 */
export const EXPORT_SCHEMA_VERSION = "1.1.0";

/** Why the picture bytes are absent, stated inside the export itself. */
export const AVATAR_EXPORT_LIMITATION =
  "private avatar images are not included in this export format";

/**
 * A birth profile as the export presents it.
 *
 * The stored relationship value is exported EXACTLY as stored — a legacy
 * 'other' or 'public_figure' is the user's data — with a status field that
 * says what the value means today, so a reader two years from now does not
 * need this codebase to interpret it. The avatar is reported honestly:
 * whether one exists, that its bytes are not in this JSON document, and why.
 * The raw storage path and version are internals of the private bucket, not
 * account content, and never leave the server.
 */
export function presentExportChart(row) {
  if (!row || typeof row !== "object") return row;
  const { avatar_storage_path, avatar_version, ...rest } = row;
  const present = Boolean(avatar_storage_path);
  return {
    ...rest,
    relationship_type_status: relationshipExportStatus(row.relationship_type ?? null),
    avatar_present: present,
    avatar_exported: false,
    avatar_export_limitation: present ? AVATAR_EXPORT_LIMITATION : null,
  };
}

/**
 * The tables this export reads, and how each is scoped to its owner.
 *
 * `column` is belt AND braces: RLS already restricts these rows, but an
 * explicit filter documents the intent at the call site and keeps the query
 * honest if a policy is ever loosened by accident.
 *
 * Tables absent from this list are absent on purpose:
 *   - ask_conversations / ask_messages — Ask Orbit is approved for removal in
 *     Dev Update 1.3. Exporting a surface that is about to disappear would
 *     promise continuity the roadmap has already decided against. Dev Update
 *     2.4 revisits retired-feature data explicitly.
 *   - chart_calculations — derived output, recomputed from the birth profile by
 *     the engine. Exporting it would ship megabytes of cache as if it were
 *     something the user authored.
 *   - llm_runs / vault_* / sync_events / business_metrics — operational and
 *     owner-tooling records, not the account holder's personal content.
 */
export const EXPORT_SOURCES = Object.freeze([
  { key: "profile", table: "profiles", column: "user_id", single: true },
  { key: "birth_profiles", table: "birth_profiles", column: "owner_id", order: "created_at.asc" },
  { key: "people", table: "people", column: "owner_id", order: "created_at.asc" },
  { key: "fortune_history", table: "daily_fortunes", column: "owner_id", order: "fortune_date.desc" },
  { key: "journal_entries", table: "journal_entries", column: "owner_id", order: "created_at.asc" },
]);

/**
 * Columns that must never leave the database, checked by name after the rows
 * are fetched rather than by trusting the select list.
 *
 * The select list is written by a person and can be widened by a later change
 * that means well. This runs on the actual result, so a column added to a table
 * in six months cannot ride along silently.
 */
const FORBIDDEN_KEYS = Object.freeze([
  "password", "encrypted_password", "password_hash",
  "access_token", "refresh_token", "token", "token_hash",
  "service_role", "service_role_key", "apikey", "api_key",
  "secret", "session_id", "confirmation_token", "recovery_token",
]);

export class AccountExportError extends Error {
  constructor(stage, message, { status = 500, cause = null } = {}) {
    super(message);
    this.name = "AccountExportError";
    this.stage = stage;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * Recursively strip anything named like a credential.
 *
 * Whole-key match rather than substring: a substring rule would delete
 * `lucky_color_token` if such a thing were ever added, and silently returning
 * an incomplete export is its own kind of wrong.
 */
export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key.toLowerCase())) continue;
      out[key] = stripSecrets(inner);
    }
    return out;
  }
  return value;
}

/**
 * Build the export document for the account belonging to a VERIFIED token.
 *
 * The user id is derived from the token, never from a parameter — the same rule
 * that governs deletion, for the same reason.
 *
 * @param {object} options
 * @param {string} options.accessToken
 * @param {string} [options.timezone]  IANA name, used only for a human-readable
 *                                     local timestamp alongside the UTC one.
 * @param {Function} [options.fetchImpl]
 * @param {Function} [options.verifyUser]
 * @param {Function} [options.now]
 */
export async function buildAccountExport({
  accessToken,
  timezone = "UTC",
  fetchImpl = fetch,
  verifyUser = getSupabaseUser,
  now = () => new Date(),
} = {}) {
  if (!accessToken) {
    throw new AccountExportError("authentication", "Sign in to export your data.", { status: 401 });
  }

  const identity = await verifyUser(accessToken);
  if (!identity?.ok || !identity.user?.id) {
    throw new AccountExportError("authentication",
      "Your session is no longer valid. Sign in again.", { status: 401 });
  }
  const user = identity.user;

  const config = supabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new AccountExportError("configuration",
      "Export is not available on this instance.", { status: 503 });
  }
  const root = config.url.replace(/\/+$/, "");

  const read = async ({ table, column, order }) => {
    const query = new URLSearchParams();
    query.set(column, `eq.${user.id}`);
    query.set("select", "*");
    if (order) query.set("order", order);
    let res;
    try {
      res = await fetchImpl(`${root}/rest/v1/${table}?${query}`, {
        headers: {
          apikey: config.anonKey,
          // The USER's token. RLS is the ownership check.
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new AccountExportError("read",
        "Your data could not be gathered just now. Please try again.",
        { status: 503, cause: error });
    }
    if (!res.ok) {
      // The database's own message is never forwarded: it can name columns,
      // policies, and internal constraints.
      throw new AccountExportError("read",
        "Your data could not be gathered just now. Please try again.",
        { status: 502 });
    }
    return res.json();
  };

  const data = {};
  for (const source of EXPORT_SOURCES) {
    const rows = await read(source);
    data[source.key] = source.single ? (rows[0] ?? null) : rows;
  }

  const generatedAt = now();
  const document = {
    orbit_axis_export: {
      schema_version: EXPORT_SCHEMA_VERSION,
      generated_at_utc: generatedAt.toISOString(),
      generated_at_local: localTimestamp(generatedAt, timezone),
      timezone,
      // Says what this file is, in the file, for someone opening it in a text
      // editor two years from now with no other context.
      about: "Everything Orbit Axis stores about your account. Calculated chart "
        + "results are not included because they are recomputed from your birth "
        + "details rather than stored as your own content.",
    },
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? user.confirmed_at ?? null,
    },
    active_chart_id: data.profile?.active_birth_profile_id ?? null,
    preferences: {
      astrology_detail_level: data.profile?.astrology_detail_level ?? null,
      current_timezone_name: data.profile?.current_timezone_name ?? null,
      current_timezone_source: data.profile?.current_timezone_source ?? null,
    },
    profile: data.profile,
    birth_profiles: (data.birth_profiles || []).map(presentExportChart),
    people: data.people,
    fortune_history: data.fortune_history,
    journal_entries: data.journal_entries,
    // Named so the gap is visible rather than inferred from silence. A user
    // reading their export should not have to guess whether a category is
    // missing or simply empty.
    not_yet_included: {
      note: "These categories do not exist yet. Dev Update 2.4 adds them to this "
        + "export in the same change that creates them.",
      categories: [
        "gratitude", "dreams", "wellness", "saved_insights",
        "notification_preferences", "compatibility_notes", "researcher_data",
      ],
    },
  };

  return stripSecrets(document);
}

/** A readable local timestamp, or null when the timezone name is unusable. */
function localTimestamp(date, timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(date);
  } catch {
    // An invalid IANA name is the caller's problem to notice, not a reason to
    // fail an export the user is entitled to.
    return null;
  }
}

/**
 * A filename someone can find again in their Downloads folder.
 *
 * Date only — a time would make every export look like a different document,
 * and the precise instant is inside the file anyway.
 */
export function exportFilename(date = new Date()) {
  return `orbit-axis-export-${date.toISOString().slice(0, 10)}.json`;
}
