// Orbit Axis :: permanent account deletion.
//
// WHY THIS IS SHORT
//
// Every user-owned table references auth.users with ON DELETE CASCADE, and the
// tables that do not reference it directly cascade through a parent that does:
//
//   auth.users
//     ├── profiles, people, birth_profiles, daily_fortunes, journal_entries,
//     │   llm_runs, pattern_insights, sync_events, tarot_readings,
//     │   transit_events, business_metrics, vault_notes, vault_note_versions,
//     │   vault_edit_proposals, ask_conversations, ask_messages
//     └── via birth_profiles → chart_calculations, chart_settings,
//         daily_fortunes, transit_events
//         via journal_entries → journal_links
//         via ask_conversations → ask_messages
//
// So deleting the auth identity removes everything, in ONE database
// transaction, enforced by Postgres rather than by a list in application code
// that someone must remember to update when a table is added.
//
// This was verified against the real schema rather than assumed: a query
// confirmed that no public table has an owner_id / user_id / created_by column
// without a cascading foreign key to auth.users, and that the project has no
// storage buckets and no storage objects.
//
// WHY IT STILL VERIFIES AFTERWARDS
//
// Because "the schema says it cascades" is a claim, and this project has been
// burned more than once by claims that were true in a model and false in
// reality. After the delete, it counts what is left. If anything survives, the
// caller is told the deletion was incomplete rather than shown a success
// message — an account that reports itself deleted while its data remains is
// the worst possible outcome here.

import { getSupabaseUser } from "../auth/supabase-auth.js";
import { supabaseConfig } from "../local-llm/config.js";

/** Typed exactly, by a person, on purpose. Not a checkbox, not a single click. */
export const DELETION_CONFIRMATION = "DELETE";

/**
 * Tables checked for survivors after the cascade. This list is for VERIFYING,
 * never for deleting — deletion is the database's job. If a table is added to
 * the schema and forgotten here, the consequence is a weaker check, not
 * abandoned data, which is the right way round for a list to be wrong.
 */
export const USER_OWNED_TABLES = Object.freeze([
  { table: "profiles", column: "user_id" },
  { table: "people", column: "owner_id" },
  { table: "birth_profiles", column: "owner_id" },
  { table: "daily_fortunes", column: "owner_id" },
  { table: "ask_conversations", column: "owner_id" },
  { table: "ask_messages", column: "owner_id" },
  { table: "journal_entries", column: "owner_id" },
  { table: "llm_runs", column: "owner_id" },
  { table: "pattern_insights", column: "owner_id" },
  { table: "sync_events", column: "owner_id" },
  { table: "tarot_readings", column: "owner_id" },
  { table: "transit_events", column: "owner_id" },
  { table: "business_metrics", column: "owner_id" },
  { table: "vault_notes", column: "owner_id" },
  { table: "vault_note_versions", column: "owner_id" },
  { table: "vault_edit_proposals", column: "owner_id" },
]);

export class AccountDeletionError extends Error {
  constructor(stage, message, { cause = null, retryable = false } = {}) {
    super(message);
    this.name = "AccountDeletionError";
    this.stage = stage;
    this.retryable = retryable;
    this.cause = cause;
  }
}

function adminConfig() {
  const config = supabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!config.url || !serviceKey) {
    throw new AccountDeletionError("configuration",
      "Account deletion is not available on this instance.", { retryable: false });
  }
  return { url: config.url, anonKey: config.anonKey, serviceKey };
}

/**
 * Delete the account belonging to the VERIFIED access token.
 *
 * The user id is derived from the token by asking Supabase who it belongs to.
 * A client-supplied id is never accepted — that would turn this into a way to
 * delete somebody else's account, which is the single worst bug this endpoint
 * could have.
 *
 * @param {object} options
 * @param {string} options.accessToken   verified server-side, not trusted blindly
 * @param {string} options.confirmation  must equal DELETION_CONFIRMATION
 * @param {Function} [options.fetchImpl] injectable so failure paths are testable
 *                                        without damaging hosted state
 * @param {Function} [options.verifyUser] injectable identity lookup
 */
export async function deleteAccount({
  accessToken,
  confirmation,
  fetchImpl = fetch,
  verifyUser = getSupabaseUser,
} = {}) {
  if (confirmation !== DELETION_CONFIRMATION) {
    throw new AccountDeletionError("confirmation",
      `Type ${DELETION_CONFIRMATION} to confirm.`, { retryable: false });
  }
  if (!accessToken) {
    throw new AccountDeletionError("authentication", "Sign-in required.", { retryable: false });
  }

  // ── 1. Establish WHO, from the token itself ───────────────────────────────
  const identity = await verifyUser(accessToken);
  if (!identity?.ok || !identity.user?.id) {
    throw new AccountDeletionError("authentication",
      "Your session is no longer valid. Sign in again.", { retryable: false });
  }
  const userId = identity.user.id;

  const { url, serviceKey } = adminConfig();
  const admin = (path, init = {}) => fetchImpl(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  // ── 2. Revoke sessions BEFORE deleting ────────────────────────────────────
  // Ordering matters. If the identity delete succeeds but this had been left
  // until afterwards, there is no identity left to revoke sessions for, and an
  // already-issued access token would stay valid until it expired on its own.
  // A failure here is not fatal — deleting the identity invalidates tokens too
  // — so it is recorded and the deletion continues rather than stranding the
  // user with an account they have been told is going away.
  let sessionsRevoked = true;
  try {
    // scope=global ends every session this user has anywhere, not just the one
    // that made this request — someone deleting their account from a laptop
    // should not stay signed in on a phone while the deletion completes.
    const logout = await admin("/auth/v1/logout?scope=global", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    sessionsRevoked = logout.ok || logout.status === 204;
  } catch {
    sessionsRevoked = false;
  }

  // ── 3. Delete the identity; Postgres cascades the rest ────────────────────
  let deleteResponse;
  try {
    deleteResponse = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  } catch (error) {
    throw new AccountDeletionError("auth_delete",
      "Your account could not be deleted just now. Nothing was removed. Please try again.",
      { cause: error, retryable: true });
  }

  // 404 means the identity is already gone — a retry after a partial failure,
  // or a double submission. That is a SUCCESS for this operation, not an error:
  // the caller asked for the account to not exist, and it does not exist.
  const alreadyGone = deleteResponse.status === 404;
  if (!deleteResponse.ok && !alreadyGone) {
    throw new AccountDeletionError("auth_delete",
      "Your account could not be deleted just now. Please try again.",
      { retryable: deleteResponse.status >= 500 });
  }

  // ── 4. Verify, rather than trust the cascade ──────────────────────────────
  const survivors = await findSurvivingRows({ userId, admin });

  if (survivors.length) {
    // Deliberately NOT reported as success. Some data remains, and the honest
    // thing is to say so and let the person retry — a retry is safe because the
    // identity is already gone and the cascade is idempotent.
    throw new AccountDeletionError("verification",
      "Your account was removed, but some data could not be confirmed deleted. "
      + "Please contact support with the reference below so it can be finished.",
      { retryable: true });
  }

  return {
    deleted: true,
    alreadyGone,
    sessionsRevoked,
    tablesVerified: USER_OWNED_TABLES.length,
  };
}

/**
 * Count anything still carrying the deleted user's id.
 *
 * Uses HEAD with an exact count so no row contents are ever fetched — this runs
 * with the service-role key, and pulling rows back would mean handling the very
 * personal data the operation exists to destroy.
 *
 * A table that cannot be queried is reported as unknown rather than empty.
 * Treating "I could not check" as "it is clean" is how a verification step
 * becomes decoration.
 */
export async function findSurvivingRows({ userId, admin }) {
  const survivors = [];
  for (const { table, column } of USER_OWNED_TABLES) {
    try {
      const res = await admin(
        `/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}&select=${column}`,
        { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } },
      );
      if (!res.ok) {
        survivors.push({ table, count: "unknown" });
        continue;
      }
      const total = Number(String(res.headers.get("content-range") || "").split("/")[1]);
      if (Number.isFinite(total) && total > 0) survivors.push({ table, count: total });
    } catch {
      survivors.push({ table, count: "unknown" });
    }
  }
  return survivors;
}
