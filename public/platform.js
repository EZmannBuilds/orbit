// Orbit Axis :: platform adapter (Update 1.1.1).
//
// THE ONE PLACE THAT KNOWS WHICH CONTAINER ORBIT IS RUNNING IN.
//
// Orbit Axis is one web application served two ways:
//
//   - the browser, from https://<host>, where the API is same-origin
//   - the iOS app, from capacitor://localhost, where it is not
//
// Everything else in the application should be unable to tell the difference.
// That is why this file exists: without it, `window.Capacitor` checks end up
// sprinkled through unrelated components, and every one of them is a place the
// web build can break for a native reason.
//
// THE RULE
//
// On the web, every function here is a no-op or an identity. `apiBase()`
// returns "" so requests stay exactly as relative as they have always been —
// same URL, same cookie, same behavior, byte for byte. If this file were
// deleted the browser build would still work; that is the property that keeps
// the web version the source application rather than a build target.
//
// NO BUNDLER
//
// Orbit ships hand-written ES modules with no build step, so this is a plain
// module the browser loads directly. It reads its configuration from an
// optional global that `scripts/app-config.js` writes at build time, rather
// than from `process.env`, which does not exist here.

/**
 * @typedef {object} OrbitAppConfig
 * @property {string} apiBaseUrl  Absolute origin the native app calls, e.g.
 *   "https://example.com". Empty string means same-origin, which is always
 *   correct in a browser.
 */

/** @returns {OrbitAppConfig} */
function appConfig() {
  const raw = globalThis.ORBIT_APP_CONFIG;
  if (!raw || typeof raw !== "object") return { apiBaseUrl: "" };
  const base = typeof raw.apiBaseUrl === "string" ? raw.apiBaseUrl.trim() : "";
  return { apiBaseUrl: base };
}

/**
 * Is this the native iOS container?
 *
 * Feature-detected through the global Capacitor injects, not through a build
 * flag. A browser has no such global, so this is false there without the web
 * build needing to know Capacitor exists at all.
 */
export function isNativeApp() {
  const cap = globalThis.Capacitor;
  return Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

/**
 * The origin to prefix API paths with.
 *
 * "" in a browser, so `apiBase() + "/api/auth/session"` is the same relative
 * URL the application has always requested.
 *
 * In the native container the app is served from capacitor://localhost, where
 * a relative /api request would resolve against the app bundle and 404. It
 * needs an absolute origin, and that origin is CONFIGURATION — never a domain
 * hardcoded in source, because the value differs between a developer's laptop,
 * a preview, and production.
 */
export function apiBase() {
  if (!isNativeApp()) return "";
  return appConfig().apiBaseUrl;
}

/**
 * Has the native container been given somewhere to send its API calls?
 *
 * Used to show an honest configuration error instead of a screen full of
 * failed requests. A native build with no API origin cannot work, and saying
 * so plainly is better than letting every panel fail on its own.
 */
export function isApiReachable() {
  return !isNativeApp() || apiBase().length > 0;
}

/**
 * Resolve an application-relative API path for the current container.
 *
 * @param {string} path e.g. "/api/auth/session"
 */
export function apiUrl(path) {
  const base = apiBase();
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A Capacitor plugin, if the native bridge has registered it.
 *
 * Reached through the global bridge rather than `import "@capacitor/browser"`.
 * Orbit ships no bundler, so a bare module specifier is unresolvable in both
 * the browser and the WebView — the npm packages exist so `cap sync` can find
 * and install the native pods, not so this file can import them.
 *
 * @param {string} name
 */
function plugin(name) {
  return globalThis.Capacitor?.Plugins?.[name];
}

/**
 * Open a URL that should leave the application.
 *
 * In a browser this is ordinary navigation. In the native container an
 * ordinary navigation would replace the app's own WebView with a web page and
 * leave the person with no way back — the "navigation trap" this update exists
 * to avoid. The system browser gives them a Done button.
 *
 * Falls back to normal navigation if the bridge is missing, because a link
 * that opens awkwardly is better than a link that does nothing.
 *
 * @param {string} url
 */
export async function openExternal(url) {
  if (!isNativeApp()) {
    globalThis.open?.(url, "_blank", "noopener,noreferrer");
    return;
  }
  const browser = plugin("Browser");
  if (!browser?.open) {
    globalThis.location.assign(url);
    return;
  }
  try {
    await browser.open({ url });
  } catch {
    globalThis.location.assign(url);
  }
}

/**
 * Absolute URL for a page that lives outside the single-page shell.
 *
 * The browser reaches Privacy at "/privacy", which Vercel rewrites to
 * /privacy.html. There is no rewrite server inside the app bundle, so the same
 * link would 404 there. Resolving against the configured origin keeps those
 * pages working and sends them to the system browser, which is also where a
 * legal page belongs — it is a document to read, not part of the app.
 *
 * @param {string} path
 */
export function externalPageUrl(path) {
  const base = apiBase();
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
