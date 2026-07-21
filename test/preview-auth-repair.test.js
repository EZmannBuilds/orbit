// Orbit Axis :: mobile Preview authentication repair (Update 5.1.1).
//
// THE FAILURE THESE TESTS EXIST FOR
//
// The owner could open the deployed Preview but could not sign in. The phone
// showed:
//
//   Unexpected token 'T', "The page c"... is not valid JSON
//   The string did not match the expected pattern.
//
// Two engines' wording for the same thing: JSON.parse being handed a sentence.
// The sentence was "The page could not be found" — Vercel's own 404 — because
// every /api request was redirected away before it reached Orbit's function.
//
// Root cause: `cleanUrls: true` in vercel.json (added in Update 5.1 for the
// legal pages) generates a 308 redirect matching ANY path ending in `index`.
// vercel.json rewrites /api/(.*) to /api/index. So the rewrite destination was
// itself redirected to /api, which has no handler.
//
// Nothing caught it because the local dev server does not use vercel.json
// routing, and the Session 3 artifact verification invoked the function
// directly — bypassing Vercel's router entirely.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const APP_JS = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

const OUTPUT_CONFIG = new URL("../.vercel/output/config.json", import.meta.url);
const built = existsSync(OUTPUT_CONFIG);
const routes = built ? JSON.parse(readFileSync(OUTPUT_CONFIG, "utf8")).routes : [];

// ── The routing defect ──────────────────────────────────────────────────────

test("the API rewrite destination is not itself redirected away", { skip: !built ? "no build output" : false }, () => {
  // This is the exact failure. If any redirect rule matches the destination of
  // the /api rewrite, every API request lands somewhere with no handler and the
  // caller gets a hosting-provider 404 page instead of Orbit.
  const apiRewrite = (vercelConfig.rewrites || []).find((r) => r.source === "/api/(.*)");
  assert.ok(apiRewrite, "the /api rewrite must exist");
  const destination = apiRewrite.destination;

  for (const route of routes) {
    if (!route.src || ![301, 302, 307, 308].includes(route.status)) continue;
    assert.ok(!new RegExp(route.src).test(destination),
      `route ${route.src} (${route.status}) intercepts the API rewrite destination ${destination}`);
  }
});

test("cleanUrls is not enabled, because its generated rule catches /api/index", () => {
  // Kept as an explicit assertion rather than a comment: re-enabling cleanUrls
  // would silently break every API route again, and the symptom appears only on
  // a real deployment.
  assert.notEqual(vercelConfig.cleanUrls, true,
    "cleanUrls generates a 308 for any path ending in `index`, including the /api rewrite destination");
});

test("the public pages still have clean URLs, via explicit rewrites", () => {
  const rewrites = vercelConfig.rewrites || [];
  for (const page of ["privacy", "terms", "support", "source", "account-deletion"]) {
    const rule = rewrites.find((r) => r.source === `/${page}`);
    assert.ok(rule, `/${page} must have an explicit rewrite`);
    assert.equal(rule.destination, `/${page}.html`);
  }
});

test("the API rewrite is declared before the page rewrites", () => {
  // Order is load-bearing: a page rule that matched /api/... first would send an
  // API request to a static file.
  const sources = (vercelConfig.rewrites || []).map((r) => r.source);
  assert.equal(sources[0], "/api/(.*)", "the API rewrite must come first");
});

test("no rewrite or redirect can swallow an /api path", { skip: !built ? "no build output" : false }, () => {
  const apiPaths = [
    "/api/auth/signin", "/api/auth/signup", "/api/auth/session", "/api/auth/signout",
    "/api/auth/password/request", "/api/auth/password/update",
    "/api/v1/health", "/api/charts", "/api/features",
  ];
  for (const path of apiPaths) {
    for (const route of routes) {
      if (!route.src || ![301, 302, 307, 308].includes(route.status)) continue;
      assert.ok(!new RegExp(route.src).test(path),
        `${path} is redirected by ${route.src} before reaching the function`);
    }
  }
});

// ── The parsing defect ──────────────────────────────────────────────────────

/** The safe reader, lifted from the shipped source so the test exercises the real thing. */
async function loadReader() {
  const source = APP_JS.slice(
    APP_JS.indexOf("async function readApiResponse"),
    APP_JS.indexOf("async function request("),
  );
  const module = await import(
    `data:text/javascript,${encodeURIComponent(source + "\nexport { readApiResponse, apiTransportMessage };")}`
  );
  return module;
}

const fakeResponse = ({ status = 200, type = "application/json", body = "{}", redirected = false } = {}) => ({
  status, ok: status >= 200 && status < 300, redirected,
  headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) },
  text: async () => body,
});

test("the exact reported failure cannot recur", async () => {
  const { readApiResponse } = await loadReader();
  // Vercel's 404 body, verbatim. Parsing this is what produced both reported
  // messages — "Unexpected token 'T'" in Chromium, "The string did not match
  // the expected pattern." in WebKit.
  const result = await readApiResponse(fakeResponse({
    status: 404, type: "text/plain; charset=utf-8", body: "The page could not be found",
  }));
  assert.equal(result.kind, "missing-route");
  assert.equal(result.data, null, "the body must never reach the caller");
});

test("an HTML login page does not become a parser error", async () => {
  const { readApiResponse } = await loadReader();
  const result = await readApiResponse(fakeResponse({
    status: 200, type: "text/html; charset=utf-8",
    body: "<!doctype html><html><body>Log in to Vercel</body></html>",
  }));
  assert.equal(result.kind, "not-json");
  assert.equal(result.data, null);
});

test("a redirected non-JSON response is identified as such", async () => {
  const { readApiResponse } = await loadReader();
  const result = await readApiResponse(fakeResponse({ status: 200, type: "text/html", redirected: true }));
  assert.equal(result.kind, "redirected");
});

test("an empty body is handled rather than thrown on", async () => {
  const { readApiResponse } = await loadReader();
  assert.equal((await readApiResponse(fakeResponse({ body: "" }))).kind, "empty");
  assert.equal((await readApiResponse(fakeResponse({ body: "   " }))).kind, "empty");
});

test("a response that claims JSON but is not does not throw", async () => {
  const { readApiResponse } = await loadReader();
  const result = await readApiResponse(fakeResponse({ type: "application/json", body: "not actually json" }));
  assert.equal(result.kind, "malformed-json");
  assert.equal(result.data, null);
});

test("real JSON still parses, success and error alike", async () => {
  const { readApiResponse } = await loadReader();
  const ok = await readApiResponse(fakeResponse({ body: '{"signed_in":true}' }));
  assert.equal(ok.kind, "json");
  assert.equal(ok.data.signed_in, true);

  const bad = await readApiResponse(fakeResponse({ status: 400, body: '{"error":"Email or password did not match."}' }));
  assert.equal(bad.kind, "json");
  assert.equal(bad.ok, false);
  assert.equal(bad.data.error, "Email or password did not match.");
});

test("transport messages are readable and leak nothing", async () => {
  const { apiTransportMessage } = await loadReader();
  for (const kind of ["missing-route", "redirected", "empty", "not-json", "malformed-json"]) {
    const message = apiTransportMessage(kind, 404);
    assert.ok(message.length > 20, `${kind} needs a real sentence`);
    for (const leak of ["Vercel", "vercel", "/var/task", "supabase", "stack", "Error:", "<html", "undefined"]) {
      assert.ok(!message.includes(leak), `${kind} message leaks "${leak}"`);
    }
  }
});

// ── The frontend uses it everywhere ─────────────────────────────────────────

test("no shipped frontend code parses a response as JSON unguarded", () => {
  const lines = APP_JS.split("\n");
  const offenders = lines
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => /\.json\(\)/.test(line))
    .filter(({ line }) => !line.startsWith("*") && !line.startsWith("//"))
    .filter(({ line }) => !/catch|readApiResponse/.test(line));
  assert.deepEqual(offenders, [], `unguarded .json() at line(s): ${offenders.map((o) => o.n).join(", ")}`);
});

test("API requests are same-origin, so both session cookies travel", () => {
  // A cross-origin call loses the Orbit session AND the Vercel Preview access
  // cookie, and gets a login page instead of the application.
  assert.match(APP_JS, /credentials: "same-origin"/);
  // No absolute deployment URL should be constructed for an API call — mixing a
  // branch alias and a generated deployment URL is how requests leave the origin.
  assert.ok(!/fetch\(\s*["'`]https?:\/\//.test(APP_JS),
    "API calls must be relative so they stay on the deployment the page came from");
});

test("a network failure is reported as a network failure", () => {
  assert.match(APP_JS, /Orbit could not be reached/);
  assert.match(APP_JS, /kind = "network"|kind: "network"|error\.kind = "network"/);
});

// ── Auth routes exist and answer JSON ───────────────────────────────────────

test("every auth route the frontend calls is registered on the server", async () => {
  const server = readFileSync(new URL("../lib/server/create-app.js", import.meta.url), "utf8");
  for (const route of ["/api/auth/session", "/api/auth/signup", "/api/auth/signin",
                       "/api/auth/signout", "/api/auth/password/request", "/api/auth/password/update"]) {
    assert.ok(server.includes(`"${route}"`), `${route} must be registered`);
  }
});

test("an unknown API path returns JSON, never a text page", async () => {
  const server = readFileSync(new URL("../lib/server/create-app.js", import.meta.url), "utf8");
  assert.match(server, /route\.startsWith\("\/api\/"\)\) return json\(res, 404/,
    "unknown /api paths must fall through to a JSON 404");
});
