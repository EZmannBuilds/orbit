// Orbit :: Vercel project-link verification (Update 4.0.4.1).
//
// Why this exists: `npx vercel link` was run in the Orbit repository and, with
// no Orbit project to choose from, it attached the directory to a DIFFERENT
// project — `the-lorehouse`. Vercel then downloaded that project's Preview
// settings and environment file into Orbit's working tree, and the build used
// the wrong framework preset (Vite → output directory `dist`) instead of
// Orbit's `public`. The build failed with "No Output Directory named dist
// found", which looked like an Orbit bug and was not one.
//
// Nothing about that was detectable from inside Orbit at the time. This module
// makes it detectable: `npm run deploy:check` now refuses to treat a checkout
// as deployable when the local link points somewhere it should not.
//
// Everything here is read-only and reads only NON-SECRET fields. Project ids
// and org ids exist in `.vercel/project.json` but are deliberately never read
// into a finding, never logged, and never compared — the project NAME is the
// identifying signal, and it is not a credential.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../local-llm/config.js";

// The Vercel project(s) Orbit is allowed to be linked to. A name, not an id:
// ids are account-private and would have to be committed to be useful here,
// which is exactly the wrong trade. Extendable via ORBIT_VERCEL_PROJECTS for
// a rename or a second environment, without editing code.
export const APPROVED_VERCEL_PROJECTS = Object.freeze(["orbit-axis"]);

// Named explicitly so the failure message can say what actually happened
// rather than "unexpected project". This is the project the incident attached
// Orbit to; it belongs to a different application entirely.
export const KNOWN_FOREIGN_PROJECTS = Object.freeze({
  "the-lorehouse": "the Lorehouse Vercel project — a different application that expects a Vite build with output directory 'dist'",
});

export function configuredApprovedProjects(env = process.env) {
  const extra = String(env.ORBIT_VERCEL_PROJECTS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...APPROVED_VERCEL_PROJECTS, ...extra])];
}

// Files that must contain Update 4.0.4's portable runtime. A checkout without
// them cannot produce a correct Vercel build, which is the second half of the
// incident: the build ran from a checkout that predated all of this.
export const PORTABILITY_MARKERS = Object.freeze([
  "vercel.json",
  "api/index.js",
  "lib/server/create-app.js",
  "lib/astro/runtime/manifest.json",
  "lib/astro/runtime/resolve.js",
  "lib/astro/bin/linux-x64/swetest",
  "scripts/deploy-check.js",
]);

// Is THIS source tree capable of a correct Orbit deployment?
export function checkoutPortability(root = REPO_ROOT) {
  const missing = PORTABILITY_MARKERS.filter((p) => !existsSync(join(root, p)));
  return {
    ok: missing.length === 0,
    missing,
    detail: missing.length === 0
      ? "This checkout contains the Update 4.0.4 portable runtime."
      : `This checkout is missing ${missing.length} file(s) required for a correct Vercel build: ${missing.join(", ")}.`,
  };
}

// Read the local link, if any. Returns a structured verdict; never throws.
//
// status:
//   "absent"    — no link. Not an error by itself; `vercel build` cannot run.
//   "malformed" — the file exists but cannot be trusted.
//   "foreign"   — linked to a known different project (the incident).
//   "unapproved"— linked to some project that is not on the approved list.
//   "ok"        — linked to an approved Orbit project.
export function inspectVercelLink({ root = REPO_ROOT, env = process.env } = {}) {
  const path = join(root, ".vercel", "project.json");
  const approved = configuredApprovedProjects(env);

  if (!existsSync(path)) {
    return {
      status: "absent", projectName: null, approved,
      detail: "This checkout is not linked to any Vercel project.",
    };
  }

  let raw, parsed;
  try {
    raw = readFileSync(path, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: "malformed", projectName: null, approved,
      detail: "The local Vercel link file exists but is not readable JSON.",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "malformed", projectName: null, approved, detail: "The local Vercel link file does not contain a project object." };
  }

  const projectName = typeof parsed.projectName === "string" ? parsed.projectName.trim() : "";
  if (!projectName) {
    return { status: "malformed", projectName: null, approved, detail: "The local Vercel link file does not name a project." };
  }

  // Framework and output directory are surfaced because they are what actually
  // broke the build, and they are not secret. Ids are never read.
  const settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
  const context = {
    framework: settings.framework ?? null,
    outputDirectory: settings.outputDirectory ?? null,
    nodeVersion: settings.nodeVersion ?? null,
  };

  if (Object.prototype.hasOwnProperty.call(KNOWN_FOREIGN_PROJECTS, projectName)) {
    return {
      status: "foreign", projectName, approved, context,
      detail: `This checkout is linked to ${KNOWN_FOREIGN_PROJECTS[projectName]}.`,
    };
  }
  if (!approved.includes(projectName)) {
    return {
      status: "unapproved", projectName, approved, context,
      detail: `This checkout is linked to the Vercel project "${projectName}", which is not an approved Orbit project.`,
    };
  }
  return {
    status: "ok", projectName, approved, context,
    detail: `Linked to the approved Orbit Vercel project "${projectName}".`,
  };
}

// Downloaded Vercel environment files must never become tracked. `.vercel/` is
// git-ignored, but this is checked rather than assumed: a single mis-edited
// ignore rule is all it would take to commit another project's Preview
// environment, which is precisely what landed in the working tree during the
// incident.
export function vercelArtifactsIgnored(isIgnored) {
  const paths = [
    ".vercel/project.json",
    ".vercel/.env.preview.local",
    ".vercel/.env.production.local",
    ".vercel/output/config.json",
    ".env.local",
    ".env.preview.local",
  ];
  const exposed = paths.filter((p) => !isIgnored(p));
  return {
    ok: exposed.length === 0,
    exposed,
    detail: exposed.length === 0
      ? "Vercel-generated files and local env files are all git-ignored."
      : `These would NOT be ignored by git: ${exposed.join(", ")}.`,
  };
}
