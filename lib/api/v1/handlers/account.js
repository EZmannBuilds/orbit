// Orbit Axis API v1 :: account operations.
//
// The first AUTHENTICATED route in v1. Everything else here is public and
// stateless; this one is neither, and it is destructive, so it carries its own
// checks rather than inheriting the permissive defaults the calculation routes
// were designed around.

import { ApiError } from "../errors/codes.js";
import { deleteAccount, DELETION_CONFIRMATION, AccountDeletionError } from "../../../account/deletion.js";
import { getSessionCookie } from "../../../auth/supabase-auth.js";

/**
 * DELETE /api/v1/account
 *
 * Identity comes from the session cookie or an Authorization header, and is
 * verified with Supabase before anything is removed. A `userId` in the request
 * body is IGNORED — not rejected with a special message, simply never read,
 * because the only id this endpoint can act on is the one the token proves.
 */
export async function remove(body, { req, deps = {} } = {}) {
  const accessToken = bearerToken(req);
  if (!accessToken) {
    throw new ApiError("UNAUTHORIZED", {
      message: "Sign in to delete your account.",
    });
  }

  const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
  if (confirmation !== DELETION_CONFIRMATION) {
    throw new ApiError("CONFIRMATION_REQUIRED", {
      message: `Type ${DELETION_CONFIRMATION} to confirm. This cannot be undone.`,
      details: { field: "confirmation" },
    });
  }

  try {
    const result = await deleteAccount({ accessToken, confirmation, ...deps });
    return {
      deleted: true,
      // Reported so a client can tell the difference between "we just deleted
      // it" and "it was already gone" — both are success, but only one is worth
      // a confirmation message.
      alreadyRemoved: result.alreadyGone,
      sessionsRevoked: result.sessionsRevoked,
      verifiedTables: result.tablesVerified,
    };
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      // Stages map to distinct codes so a client can respond appropriately: a
      // confirmation problem is the user's to fix, an authentication problem
      // means sign in again, and an incomplete deletion means contact support.
      if (error.stage === "confirmation") {
        throw new ApiError("CONFIRMATION_REQUIRED", { message: error.message, details: { field: "confirmation" } });
      }
      if (error.stage === "authentication") {
        throw new ApiError("UNAUTHORIZED", { message: error.message });
      }
      if (error.stage === "verification") {
        throw new ApiError("DELETION_INCOMPLETE", { message: error.message, cause: error });
      }
      if (error.stage === "configuration") {
        throw new ApiError("ENGINE_UNAVAILABLE", { message: error.message, cause: error });
      }
      throw new ApiError("INTERNAL_ERROR", { message: error.message, cause: error });
    }
    throw error;
  }
}

/**
 * The access token, from either transport.
 *
 * The cookie is Orbit's own web session. The Authorization header is what a
 * future iOS client will send, since a native app has no cookie jar shared with
 * a browser. Supporting both here means the contract does not have to change
 * when that client arrives.
 */
function bearerToken(req) {
  const header = String(req?.headers?.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  const session = getSessionCookie(req);
  return session?.access_token || "";
}

export { bearerToken };
