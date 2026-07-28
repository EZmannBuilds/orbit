// Orbit Axis :: Dev Update 1.2 — authentication gate accessibility.
//
// The project has no browser/DOM harness on purpose (it stays dependency-free),
// so these are structural assertions against the served HTML and the client
// source. They cannot prove that a screen reader behaves correctly — that is
// what the manual pass in docs/manual-auth-accessibility-test.md is for — but
// they CAN prove that the specific mistakes this update fixed do not come back
// silently in a later refactor.
//
// The mistake being guarded against is the original one: an overlay that looked
// modal, obscured the whole application, and left keyboard focus and the
// accessibility tree free to wander behind it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
const appJs = readFileSync(join(ROOT, "public", "app.js"), "utf8");
const authCss = readFileSync(join(ROOT, "public", "styles", "auth.css"), "utf8");

/** The opening tag of an element by id, which is where its attributes live. */
function openingTag(id) {
  const at = html.indexOf(`id="${id}"`);
  assert.notEqual(at, -1, `#${id} should exist in index.html`);
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf(">", at);
  return html.slice(start, end + 1);
}

test("the authentication gate declares real dialog semantics", () => {
  const tag = openingTag("auth-gate");
  assert.match(tag, /role="dialog"/, "the gate must be a dialog, not a decorative overlay");
  assert.match(tag, /aria-modal="true"/, "assistive technology must know the rest is unavailable");
  assert.match(tag, /aria-labelledby="auth-gate-title"/, "the dialog needs an accessible name");
  assert.match(tag, /aria-describedby="auth-gate-description"/, "and a description worth having");
});

test("the elements the gate points at actually exist", () => {
  // An aria-labelledby pointing at nothing is worse than none at all: it looks
  // correct in review and produces an unnamed dialog in practice.
  assert.ok(html.includes('id="auth-gate-title"'), "the title target must exist");
  assert.ok(html.includes('id="auth-gate-description"'), "the description target must exist");
});

test("every field is associated with its own label", () => {
  // Previously each input was WRAPPED in its label, so the password field's
  // accessible name absorbed the Show/Hide button's text.
  for (const id of ["auth-email", "auth-password", "auth-confirm"]) {
    assert.ok(html.includes(`for="${id}"`), `#${id} needs an explicit label association`);
  }
});

test("the password visibility control has an accessible name and a state", () => {
  const tag = openingTag("auth-toggle-password");
  assert.match(tag, /aria-label="Show password"/, "an icon-free button still needs a stable name");
  assert.match(tag, /aria-pressed="false"/, "the initial state must be declared, not implied");
  assert.match(appJs, /button\.setAttribute\("aria-pressed", String\(!showing\)\)/,
    "and it must be kept in sync when toggled");
});

test("errors and loading are announced, not merely displayed", () => {
  const tag = openingTag("auth-message");
  assert.match(tag, /role="status"/);
  assert.match(tag, /aria-live="assertive"/, "a failed sign-in must not have to be hunted for");
  assert.match(tag, /aria-atomic="true"/, "the whole message is read, not the changed word");
});

test("opening any dialog makes the application shell inert", () => {
  assert.match(appJs, /function setBackgroundInert/, "there must be one place this happens");
  assert.match(appJs, /region\.setAttribute\("inert", ""\)/,
    "inert is what stops pointer, find-in-page, and virtual-cursor access");
  assert.match(appJs, /region\.setAttribute\("aria-hidden", "true"\)/,
    "and aria-hidden is what removes it from the accessibility tree");
  assert.match(appJs, /if \(modalStack\.length === 1\) setBackgroundInert\(true\)/,
    "only the outermost dialog sets it");
  assert.match(appJs, /if \(!modalStack\.length\) setBackgroundInert\(false\)/,
    "and only the last one to close releases it");
});

test("inertness is released before focus is restored", () => {
  // Restoring focus into a still-inert shell silently drops it to <body>, which
  // is how "focus returns to what opened this" quietly stops being true.
  const close = appJs.slice(appJs.indexOf("function closeModal"));
  const release = close.indexOf("setBackgroundInert(false)");
  const restore = close.indexOf("entry.restoreTo.focus()");
  assert.ok(release !== -1 && restore !== -1, "both steps must exist in closeModal");
  assert.ok(release < restore, "the shell must be interactive again before focus goes back to it");
});

test("the gate is opened through the shared dialog machinery, not a raw toggle", () => {
  assert.match(appJs, /function showAuthGate/);
  assert.match(appJs, /function hideAuthGate/);
  assert.match(appJs, /openModal\(gate, \{ dismissible: false/,
    "the gate opens as a dialog so it inherits the focus trap and inertness");
  // Five scattered `hidden` assignments is how three of them forget the shell.
  const raw = appJs.match(/\$\("#auth-gate"\)\.hidden\s*=/g) || [];
  assert.equal(raw.length, 0, "no code path may toggle the gate's `hidden` directly");
});

test("Escape does not dismiss the gate, because there is nothing behind it", () => {
  assert.match(appJs, /dismissible = true/, "every other dialog stays dismissible by default");
  assert.match(appJs, /if \(!dismissible\) return;/,
    "the non-dismissible case must be handled before preventDefault and close");
});

test("initial focus lands inside the gate once it is actually visible", () => {
  assert.match(appJs, /initialFocus: \$\("#auth-email"\)/, "focus starts on the first field");
  // The startup gate covers the auth gate during session restore, so focusing
  // at open time would target something nobody can see yet.
  const finish = appJs.slice(appJs.indexOf("function finishStartup"), appJs.indexOf("function renderAccount"));
  assert.match(finish, /\$\("#auth-email"\)\?\.focus\(\)/,
    "focus is placed again once the startup cover is gone");
});

test("Tab is trapped inside the open dialog", () => {
  assert.match(appJs, /if \(event\.key !== "Tab"\) return;/);
  assert.match(appJs, /event\.shiftKey && document\.activeElement === first/);
  assert.match(appJs, /document\.activeElement === last/);
});

test("interaction targets in the gate meet the 44px minimum", () => {
  const block = authCss.slice(authCss.indexOf("Dev Update 1.2"));
  assert.match(block, /min-height: 44px/, "buttons in the gate declare a 44px minimum");
  assert.match(block, /\.auth-form \.linklike[\s\S]*min-height: 44px/,
    "the Forgot password control is a real target, not bare text");
});

test("the gate scrolls rather than clipping at 200% zoom", () => {
  const block = authCss.slice(authCss.indexOf("Dev Update 1.2"));
  assert.match(block, /overflow-y: auto/, "a zoomed gate must be scrollable");
  assert.match(block, /align-content: safe center/,
    "safe centering keeps the top of the card reachable when it overflows");
});

test("privacy, terms, and support are reachable before any data is requested", () => {
  const gate = html.slice(html.indexOf('id="auth-gate"'), html.indexOf('id="onboarding-gate"'));
  assert.match(gate, /href="\/privacy"/);
  assert.match(gate, /href="\/terms"/);
  assert.match(gate, /href="\/support"/);
});

test("the gate explains what birth data is collected and that AI is not required", () => {
  // Collapsed, because this is prose in an HTML file: it wraps where the line
  // length says, not where a regex would prefer. Asserting against the raw
  // source would make every future reflow a test failure.
  const gate = html
    .slice(html.indexOf('id="auth-gate"'), html.indexOf('id="onboarding-gate"'))
    .replace(/\s+/g, " ");
  assert.match(gate, /birth date, birth time, and birthplace/i,
    "say exactly what is collected");
  assert.match(gate, /visible only to you/i, "say who can see it");
  assert.match(gate, /never sold or shared/i, "say whether it is shared");
  assert.match(gate, /export it or delete your account/i, "say how to get it back or remove it");
  assert.match(gate, /do not depend on generative AI/i,
    "the deterministic promise is part of the trust story");
});
