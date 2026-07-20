import { supabaseConfig } from "../local-llm/config.js";

export const SESSION_COOKIE = "oa_session";

function authBase() {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) return { ready: false };
  return { ready: true, root: url.replace(/\/+$/, ""), anonKey };
}

function safeUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email || "" };
}

function encodeSession(session) {
  return Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
    user: safeUser(session.user),
  }), "utf8").toString("base64url");
}

function decodeSession(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { return null; }
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map(part => {
    const [name, ...rest] = part.trim().split("=");
    return [name, decodeURIComponent(rest.join("=") || "")];
  }).filter(([name]) => name));
}

export function getSessionCookie(req) {
  return decodeSession(parseCookies(req)[SESSION_COOKIE]);
}

// ── Cookie security (Update 4.0.3) ───────────────────────────────────────────
// The session cookie carries a Supabase access token, so it must be Secure
// anywhere the connection is HTTPS. Orbit sits behind Vercel's proxy, which
// terminates TLS and forwards the original scheme in x-forwarded-proto — the
// socket itself is plain HTTP, so `req.socket.encrypted` would wrongly report
// an insecure connection and the flag would never be set.
//
// The forwarded header is only trusted when the resolved environment says this
// process really is a Vercel deployment. On a deployment we additionally set
// Secure unconditionally: a deployed Orbit is always served over HTTPS, so an
// absent or stripped header must not be able to downgrade the cookie.
//
// Local HTTP development deliberately does not set Secure, because a Secure
// cookie is discarded by browsers over http://localhost in some contexts and
// that would silently break sign-in locally.
export function isSecureRequest(req, env = null) {
  if (env?.isDeployed) return true;
  const forwarded = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (forwarded) {
    // Only a deployment context may speak for the original scheme. Anyone can
    // send this header to a local server.
    if (env?.isVercel) return forwarded === "https";
    return false;
  }
  return Boolean(req?.socket?.encrypted);
}

function cookieAttributes(req, env) {
  const attrs = ["HttpOnly", "SameSite=Lax", "Path=/"];
  if (isSecureRequest(req, env)) attrs.push("Secure");
  return attrs.join("; ");
}

// `context` is { req, env }. Both are optional so existing callers and tests
// that only pass a session keep working — they simply get the local, non-Secure
// attributes, which is the correct answer for a plain HTTP local server.
export function sessionCookie(session, context = {}) {
  const maxAge = Math.max(60, Number(session.expires_in || 3600));
  return `${SESSION_COOKIE}=${encodeSession(session)}; ${cookieAttributes(context.req, context.env)}; Max-Age=${maxAge}`;
}

export function clearSessionCookie(context = {}) {
  return `${SESSION_COOKIE}=; ${cookieAttributes(context.req, context.env)}; Max-Age=0`;
}

async function supabaseAuth(path, { method = "GET", token = "", body = null } = {}) {
  const base = authBase();
  if (!base.ready) return { ok: false, status: 503, data: { error: "Supabase is not configured." } };
  const headers = { apikey: base.anonKey, "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base.root}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  return { ok: res.ok, status: res.status, data };
}

export async function signUpWithPassword({ email, password }) {
  const result = await supabaseAuth("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (!result.ok) return result;
  const session = result.data.session || (result.data.access_token ? result.data : null);
  return { ...result, session, user: safeUser(result.data.user || session?.user) };
}

export async function signInWithPassword({ email, password }) {
  const result = await supabaseAuth("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (!result.ok) return result;
  return { ...result, session: result.data, user: safeUser(result.data.user) };
}

export async function refreshSession(session) {
  if (!session?.refresh_token) return { ok: false, status: 401, data: { error: "No refresh token." } };
  const result = await supabaseAuth("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token },
  });
  if (!result.ok) return result;
  return { ...result, session: result.data, user: safeUser(result.data.user) };
}

export async function getSupabaseUser(accessToken) {
  if (!accessToken) return { ok: false, status: 401, data: { error: "No access token." } };
  const result = await supabaseAuth("/auth/v1/user", { token: accessToken });
  if (!result.ok) return result;
  return { ...result, user: safeUser(result.data) };
}

export async function signOutSupabase(accessToken) {
  if (!accessToken) return { ok: true, status: 200, data: {} };
  return supabaseAuth("/auth/v1/logout", { method: "POST", token: accessToken });
}

// `env` is the resolved environment. It is threaded through so every cookie
// this function re-issues (on refresh, and on expiry) carries the same security
// attributes as the one issued at sign-in — otherwise a refresh silently
// downgrades a Secure cookie to a non-Secure one on a deployment.
export async function authenticateRequest(req, env = null) {
  const context = { req, env };
  const stored = getSessionCookie(req);
  if (!stored?.access_token) return { ok: false, user: null, session: null, setCookie: null };

  const expiresAtMs = Number(stored.expires_at || 0) * 1000;
  if (expiresAtMs && expiresAtMs - Date.now() < 60000 && stored.refresh_token) {
    const refreshed = await refreshSession(stored);
    if (!refreshed.ok || !refreshed.session?.access_token) {
      return { ok: false, user: null, session: null, setCookie: clearSessionCookie(context), expired: true };
    }
    return {
      ok: true,
      user: refreshed.user,
      session: refreshed.session,
      setCookie: sessionCookie(refreshed.session, context),
    };
  }

  const user = await getSupabaseUser(stored.access_token);
  if (!user.ok) return { ok: false, user: null, session: null, setCookie: clearSessionCookie(context), expired: true };
  return { ok: true, user: user.user, session: stored, setCookie: null };
}
