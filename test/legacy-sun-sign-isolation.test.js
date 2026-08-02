// Orbit Axis :: the legacy Sun-sign surfaces stay legacy (Dev Update 1.11).
//
// WHAT THIS IS ABOUT
//
// Orbit shipped a Sun-sign compatibility endpoint long before it had a real
// synastry engine. `GET /api/compatibility?a=&b=` scores two ZODIAC SIGNS by
// counting the steps between them on the wheel and returns a `harmony_score`.
// Two more public routes — `POST /api/query` and `POST /api/stella/chat` —
// surface the same number through answerPrompt().
//
// Dev Update 1.11 introduced full-chart compatibility, which rejects exactly
// that model: it reads ten bodies across two saved charts and never looks at
// Sun signs. Both now exist in the same process, one of them called
// "compatibility", and the failure mode is obvious in hindsight and invisible
// in review — a later change quietly sourcing a number from the cheap one.
//
// So this file pins the boundary rather than trusting it. The legacy routes
// keep working (removing a live, documented, public endpoint is a separate,
// bounded decision — see docs/deployment/legacy-sun-sign-endpoints.md); they
// simply cannot reach, feed, or be reached by the 1.11 engine.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const APP = readFileSync(join(ROOT, "public", "app.js"), "utf8");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

function readDir(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readDir(full));
    else if (entry.endsWith(".js")) out.push([full, readFileSync(full, "utf8")]);
  }
  return out;
}

const COMPAT_FILES = readDir(join(ROOT, "lib", "compatibility"));

// ── Code isolation ──────────────────────────────────────────────────────────

test("the compatibility engine shares no code with the Sun-sign endpoint", () => {
  assert.ok(COMPAT_FILES.length >= 7, "expected the full compatibility module");
  for (const [path, src] of COMPAT_FILES) {
    assert.ok(!/symbols\.js/.test(src),
      `${path} imports lib/symbols.js, where the Sun-sign scorer lives`);
    for (const banned of ["signGeometry", "harmony_score", "answerPrompt", "ZODIAC_ORDER", "DISTANCE_ASPECTS"]) {
      assert.ok(!src.includes(banned),
        `${path} references ${banned} — a Sun-sign score must not touch full-chart results`);
    }
  }
});

test("compatibility scores are built only from engine aspects", () => {
  const service = COMPAT_FILES.find(([p]) => p.endsWith("service.js"))[1];
  // The single source of evidence. If a second one ever appears, this fails.
  assert.match(service, /computeSynastryAspects/);
  const evidence = COMPAT_FILES.find(([p]) => p.endsWith("evidence.js"))[1];
  assert.match(evidence, /ASPECT_WEIGHTS/);
  assert.ok(!/sign|Sign/.test(evidence.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "evidence.js reasons about a sign — the engine's synastry is planet-to-planet only");
});

// ── The interface never calls the legacy route ──────────────────────────────

test("the 1.11 interface never calls the legacy endpoint", () => {
  // Substring matching is not enough here: "/api/compatibility/options" starts
  // with "/api/compatibility". Only a BARE path is the legacy route.
  const bare = APP.match(/["'`]\/api\/compatibility(["'`?]|\$\{)/g) || [];
  assert.deepEqual(bare, [],
    `the browser calls the legacy Sun-sign endpoint: ${bare.join(", ")}`);
  // And the two it does call are the namespaced 1.11 ones.
  assert.match(APP, /\/api\/compatibility\/options/);
  assert.match(APP, /\/api\/compatibility\/compare/);

  // The other two Sun-sign surfaces are not called from the browser either.
  for (const route of ["/api/query", "/api/stella/chat", "/api/stella/daily"]) {
    assert.ok(!APP.includes(route), `the browser calls ${route}, a legacy Sun-sign surface`);
  }
});

// ── Route dispatch cannot collide ───────────────────────────────────────────

test("the legacy route is exact-match and cannot swallow the new namespace", () => {
  const server = readFileSync(join(ROOT, "lib", "server", "create-app.js"), "utf8");
  // An exact equality check. A startsWith here would route
  // /api/compatibility/compare into the Sun-sign handler and return a
  // harmony_score to the new interface — the exact confusion this file exists
  // to prevent.
  assert.match(server, /if \(route === "\/api\/compatibility"\)/,
    "the legacy route must be exact-match, never a prefix");
  assert.ok(!/route\.startsWith\("\/api\/compatibility"\)/.test(server),
    "a prefix match on /api/compatibility would capture the 1.11 endpoints");
  assert.match(server, /route\.startsWith\("\/api\/compatibility\/"\)/,
    "the 1.11 namespace is matched with its trailing slash");
});

// ── Deprecation is documented, without a removal date ───────────────────────

test("the legacy Sun-sign endpoints are marked deprecated in the docs", () => {
  const doc = readFileSync(join(ROOT, "docs", "deployment", "legacy-sun-sign-endpoints.md"), "utf8");
  for (const route of ["/api/compatibility", "/api/query", "/api/stella/chat"]) {
    assert.ok(doc.includes(route), `the deprecation note omits ${route}`);
  }
  assert.match(doc, /Deprecated/i);
  // Deliberately no removal date: nothing here has proven what external
  // consumers exist, and announcing a date we cannot stand behind is worse
  // than announcing none.
  assert.ok(!/removed? (on|in|by) \d{4}-\d{2}-\d{2}|removal date: \d/i.test(doc),
    "the note claims a removal date the dependency audit does not support");

  // README must warn at the point of use, or nobody reads the separate note.
  const row = README.split("\n").find((l) => l.includes("`/api/compatibility?a=&b=`"));
  assert.ok(row, "the README endpoint table no longer lists the legacy route");
  assert.match(row, /Deprecated/i,
    "the README lists the legacy endpoint without marking it deprecated");
  assert.match(row, /Sun-sign|sign-distance/i,
    "the README must say this is Sun-sign scoring, not the 1.11 engine");
});

test("the README distinguishes the two compatibility surfaces", () => {
  assert.match(README, /\/api\/compatibility\/compare/,
    "the README does not document the 1.11 endpoint, so the legacy row reads as the only one");
});
