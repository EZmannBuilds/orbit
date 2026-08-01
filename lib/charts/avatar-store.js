// Orbit Axis :: private avatar objects (Supabase Storage).
//
// Same shape as store.js and for the same reason: every call carries the
// signed-in user's access token, so Storage RLS evaluates auth.uid() and the
// owner-scoped policies decide. No service-role key is used here. Account
// deletion is the only place that is allowed one, and this is not that.
//
// The path always begins with the owner id, which is what the policies compare
// against — see the migration. The application ALSO verifies chart ownership
// before calling any of this, because a path that happens to be well-formed is
// not the same as a chart the caller owns.

import { supabaseConfig } from "../local-llm/config.js";

export const AVATAR_BUCKET = "chart-avatars";

function base(auth = null) {
  const config = supabaseConfig();
  const url = auth?.url || config.url;
  const anonKey = auth?.anonKey || config.anonKey;
  const accessToken = auth?.accessToken || config.accessToken;
  if (!url || !anonKey || !accessToken) return { ready: false };
  return {
    ready: true,
    root: url.replace(/\/+$/, ""),
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
  };
}

export function createAvatarStore(auth = null) {
  const object = (path) =>
    `${base(auth).root}/storage/v1/object/${AVATAR_BUCKET}/${path}`;

  return {
    ready: () => base(auth).ready,

    /**
     * Writes the object. `upsert` is true because the path is stable per
     * chart — one avatar, one place — so a replacement overwrites rather than
     * accumulating orphans nobody will ever collect.
     */
    async put(path, bytes, contentType) {
      const b = base(auth);
      if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
      const res = await fetch(object(path), {
        method: "POST",
        headers: {
          ...b.headers,
          "content-type": contentType,
          "cache-control": "private, max-age=0, must-revalidate",
          "x-upsert": "true",
        },
        body: bytes,
      });
      // The body is only read to distinguish failure modes; it is never
      // returned to a caller and never logged.
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    },

    /** Reads the bytes back. A 404 is a real answer, not an error to throw on. */
    async get(path) {
      const b = base(auth);
      if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
      const res = await fetch(object(path), { headers: b.headers });
      if (res.status === 404) return { ok: false, missing: true };
      if (!res.ok) return { ok: false, status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, bytes: buf, contentType: res.headers.get("content-type") || "image/webp" };
    },

    /**
     * Idempotent by design: an object that is already gone is a success, not a
     * failure. Removal exists to reach a state, and that state is "no object".
     */
    async remove(path) {
      const b = base(auth);
      if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
      const res = await fetch(object(path), { method: "DELETE", headers: b.headers });
      if (res.ok || res.status === 404) return { ok: true, alreadyGone: res.status === 404 };
      return { ok: false, status: res.status };
    },

    /**
     * Every object under one owner, for account deletion.
     *
     * Scoped to the owner's own prefix. There is deliberately no "list the
     * bucket" call anywhere in this module: the policies would refuse it, and
     * offering the shape invites someone to try.
     */
    async listOwned(ownerId) {
      const b = base(auth);
      if (!b.ready) return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
      const res = await fetch(`${b.root}/storage/v1/object/list/${AVATAR_BUCKET}`, {
        method: "POST",
        headers: { ...b.headers, "content-type": "application/json" },
        body: JSON.stringify({ prefix: `${ownerId}/`, limit: 1000 }),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, objects: Array.isArray(data) ? data : [] };
    },
  };
}

export const avatarStore = createAvatarStore();
