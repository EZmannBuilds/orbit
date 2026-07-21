// Orbit :: Vercel project-link verification (Update 4.0.4.1).
//
// Regression tests for a real incident. `npx vercel link` was run in the Orbit
// repository; with no Orbit project to pick, it attached the directory to
// `the-lorehouse`. Vercel downloaded that project's Preview settings and
// environment file into Orbit's working tree, and the build used its Vite
// preset — output directory `dist` — instead of Orbit's `public`. The build
// failed with "No Output Directory named dist found", which read like an Orbit
// bug and was not one.
//
// Two independent things went wrong, so both are tested here:
//   1. the link pointed at the wrong project
//   2. the build ran from a checkout that predated the portable runtime
//
// Only NON-SECRET fields are ever read. Project and org ids are never
// inspected, compared, or reported — the project name is the signal, and it is
// not a credential.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  inspectVercelLink, checkoutPortability, vercelArtifactsIgnored,
  configuredApprovedProjects, APPROVED_VERCEL_PROJECTS, PORTABILITY_MARKERS,
} from "../lib/deploy/vercel-link.js";
import { REPO_ROOT } from "../lib/local-llm/config.js";

// Build a throwaway directory containing a .vercel/project.json.
function fakeCheckout(projectJson, { markers = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "orbit-link-test-"));
  if (projectJson !== null) {
    mkdirSync(join(root, ".vercel"), { recursive: true });
    writeFileSync(join(root, ".vercel", "project.json"),
      typeof projectJson === "string" ? projectJson : JSON.stringify(projectJson));
  }
  if (markers) {
    for (const rel of PORTABILITY_MARKERS) {
      const full = join(root, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "stub");
    }
  }
  return root;
}
const cleanup = (root) => rmSync(root, { recursive: true, force: true });

// Ids here are obvious fakes; nothing reads them, which is the point.
const FAKE_IDS = { projectId: "prj_TEST_NOT_REAL", orgId: "team_TEST_NOT_REAL" };

// ── the approved project ────────────────────────────────────────────────────

test("an approved Orbit project link is accepted", () => {
  const root = fakeCheckout({ ...FAKE_IDS, projectName: "orbit-axis", settings: { framework: null, outputDirectory: "public", nodeVersion: "22.x" } });
  try {
    const r = inspectVercelLink({ root, env: {} });
    assert.equal(r.status, "ok");
    assert.equal(r.projectName, "orbit-axis");
    assert.equal(r.context.outputDirectory, "public");
  } finally { cleanup(root); }
});

test("orbit-axis is the approved project name and it is a name, not an id", () => {
  assert.ok(APPROVED_VERCEL_PROJECTS.includes("orbit-axis"));
  for (const name of APPROVED_VERCEL_PROJECTS) {
    assert.doesNotMatch(name, /^prj_|^team_/, "approved entries must be project names, never account ids");
  }
});

test("an extra approved project can be configured without editing code", () => {
  const approved = configuredApprovedProjects({ ORBIT_VERCEL_PROJECTS: "orbit-axis-staging, orbit-axis" });
  assert.ok(approved.includes("orbit-axis-staging"));
  assert.ok(approved.includes("orbit-axis"));
  assert.equal(new Set(approved).size, approved.length, "no duplicates");
});

// ── the incident ────────────────────────────────────────────────────────────

test("a link to the-lorehouse is rejected as a foreign project", () => {
  const root = fakeCheckout({ ...FAKE_IDS, projectName: "the-lorehouse", settings: { framework: "vite", outputDirectory: null, nodeVersion: "24.x" } });
  try {
    const r = inspectVercelLink({ root, env: {} });
    assert.equal(r.status, "foreign");
    assert.equal(r.projectName, "the-lorehouse");
    assert.match(r.detail, /Lorehouse/);
    // The detail should name the actual cause of the failed build.
    assert.match(r.detail, /dist/, "the message should explain the dist mismatch");
  } finally { cleanup(root); }
});

test("the foreign-project verdict surfaces the framework that caused the dist error", () => {
  const root = fakeCheckout({ ...FAKE_IDS, projectName: "the-lorehouse", settings: { framework: "vite", outputDirectory: null } });
  try {
    const r = inspectVercelLink({ root, env: {} });
    assert.equal(r.context.framework, "vite");
    assert.equal(r.context.outputDirectory, null,
      "Vercel used the Vite preset default (dist) because no output directory was set");
  } finally { cleanup(root); }
});

test("any unknown project is rejected, not just the-lorehouse", () => {
  const root = fakeCheckout({ ...FAKE_IDS, projectName: "some-other-app", settings: {} });
  try {
    const r = inspectVercelLink({ root, env: {} });
    assert.equal(r.status, "unapproved");
    assert.match(r.detail, /some-other-app/);
  } finally { cleanup(root); }
});

test("a missing link is reported as absent, which is not the same as wrong", () => {
  const root = fakeCheckout(null);
  try {
    const r = inspectVercelLink({ root, env: {} });
    assert.equal(r.status, "absent");
    assert.equal(r.projectName, null);
  } finally { cleanup(root); }
});

// ── malformed metadata ──────────────────────────────────────────────────────

for (const [label, body] of [
  ["not JSON", "{ this is not json"],
  ["empty file", ""],
  ["a JSON array", "[]"],
  ["a JSON string", '"orbit-axis"'],
  ["an object with no projectName", JSON.stringify({ ...FAKE_IDS })],
  ["a blank projectName", JSON.stringify({ ...FAKE_IDS, projectName: "   " })],
  ["a non-string projectName", JSON.stringify({ ...FAKE_IDS, projectName: 42 })],
]) {
  test(`malformed project metadata is rejected: ${label}`, () => {
    const root = fakeCheckout(body);
    try {
      const r = inspectVercelLink({ root, env: {} });
      assert.equal(r.status, "malformed", `${label} should be malformed, got ${r.status}`);
    } finally { cleanup(root); }
  });
}

test("a malformed link never reports itself as approved", () => {
  const root = fakeCheckout("{ broken");
  try {
    assert.notEqual(inspectVercelLink({ root, env: {} }).status, "ok");
  } finally { cleanup(root); }
});

// ── secrets are never read or surfaced ──────────────────────────────────────

test("no verdict ever contains a project id or org id", () => {
  const secretish = { projectId: "prj_SUPERSECRETVALUE12345", orgId: "team_SUPERSECRETVALUE12345" };
  for (const name of ["orbit-axis", "the-lorehouse", "unknown-project"]) {
    const root = fakeCheckout({ ...secretish, projectName: name, settings: {} });
    try {
      const serialized = JSON.stringify(inspectVercelLink({ root, env: {} }));
      assert.doesNotMatch(serialized, /SUPERSECRETVALUE/, `${name}: the verdict leaked an id`);
      assert.doesNotMatch(serialized, /prj_|team_/, `${name}: the verdict referenced an id field`);
    } finally { cleanup(root); }
  }
});

// ── stale checkout: the second half of the incident ─────────────────────────

test("the real portability worktree is recognised as capable of a correct build", () => {
  const r = checkoutPortability(REPO_ROOT);
  assert.equal(r.ok, true, r.detail);
  assert.deepEqual(r.missing, []);
});

test("a checkout without the portable runtime is rejected", () => {
  // This models the actual failure: the build ran from a checkout on Update
  // 4.0.2, which had no vercel.json, no deploy:check, and no Linux runtime.
  const root = fakeCheckout(null, { markers: false });
  try {
    const r = checkoutPortability(root);
    assert.equal(r.ok, false);
    assert.ok(r.missing.includes("vercel.json"));
    assert.ok(r.missing.includes("scripts/deploy-check.js"));
    assert.ok(r.missing.includes("vendor/orbit-axis-engine/bin/linux-x64/swetest"));
  } finally { cleanup(root); }
});

test("a checkout missing only the Linux runtime is still rejected", () => {
  const root = fakeCheckout(null);
  try {
    rmSync(join(root, "vendor/orbit-axis-engine/bin/linux-x64/swetest"));
    const r = checkoutPortability(root);
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ["vendor/orbit-axis-engine/bin/linux-x64/swetest"]);
    assert.match(r.detail, /linux-x64/);
  } finally { cleanup(root); }
});

test("the portability markers include everything a correct build needs", () => {
  for (const required of ["vercel.json", "api/index.js", "vendor/orbit-axis-engine/src/adapters/swiss-ephemeris/manifest.json", "vendor/orbit-axis-engine/bin/linux-x64/swetest", "scripts/deploy-check.js"]) {
    assert.ok(PORTABILITY_MARKERS.includes(required), `${required} should be a portability marker`);
  }
});

// ── downloaded Vercel files must stay untracked ─────────────────────────────

test("Vercel-generated files and local env files are all git-ignored", () => {
  // Uses the same predicate deploy:check uses, against the real repository.
  const r = vercelArtifactsIgnored((p) => spawnSync("git", ["check-ignore", "-q", p], { cwd: REPO_ROOT }).status === 0);
  assert.equal(r.ok, true, r.detail);
});

test("the ignore check fails loudly if an artifact would become trackable", () => {
  const r = vercelArtifactsIgnored((p) => p !== ".vercel/.env.preview.local");
  assert.equal(r.ok, false);
  assert.ok(r.exposed.includes(".vercel/.env.preview.local"));
});

test("tracked env templates are not swept up by the ignore rules", () => {
  // Vercel's own edit added a blanket `.env*` rule, which would have started
  // ignoring the placeholder templates this repository deliberately tracks.
  for (const template of [".env.example", ".env.preview.example", ".env.production.example"]) {
    const ignored = spawnSync("git", ["check-ignore", "-q", template], { cwd: REPO_ROOT }).status === 0;
    assert.equal(ignored, false, `${template} must remain trackable`);
  }
});
