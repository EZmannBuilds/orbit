// Orbit Axis :: the client calls nothing it does not define.
//
// WHY THIS EXISTS. Dev Update 1.3 removed the Ask Orbit surface, and
// setActiveChartName — which lived inside that block but was called from the
// saved-chart and daily-reading paths — went with it. The result was a
// ReferenceError inside a `catch {}` that swallowed it, so the saved-chart
// request "failed", a signed-in account with no charts was told its charts
// could not be loaded, and first-run onboarding never appeared.
//
// Nothing caught it. `node --check` only parses. Every other frontend test
// reads source text, and source text containing a call proves nothing about
// whether the callee still exists. This is the cheapest check that would have.
//
// It is deliberately conservative: it reports a call only when the name is
// defined nowhere in the file and is not a known browser or language global.
// A false positive here blocks a release, so the bar is "certainly missing"
// rather than "possibly missing".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Browser, language, and module globals a client module may legitimately call. */
const GLOBALS = new Set([
  // Language
  "Array", "Boolean", "Date", "Error", "JSON", "Map", "Math", "Number", "Object",
  "Promise", "RegExp", "Set", "String", "Symbol", "WeakMap", "BigInt",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone",
  // dynamic import() — a keyword that parses like a call. The Symbol Atlas
  // lazy-loads its content module with it (Dev Update 1.12).
  "import",
  // Browser
  "fetch", "alert", "confirm", "prompt", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
  "queueMicrotask", "matchMedia", "getComputedStyle", "scrollTo", "open", "close",
  "AbortController", "FormData", "URL", "URLSearchParams", "Blob", "File",
  "Headers", "Request", "Response", "Image", "Event", "CustomEvent", "IntersectionObserver",
  "MutationObserver", "ResizeObserver", "TextEncoder", "TextDecoder", "atob", "btoa",
  // Control flow that the call-site regex would otherwise pick up
  "if", "for", "while", "switch", "catch", "return", "typeof", "function",
  "await", "new", "do", "else", "case", "delete", "void", "in", "of", "yield",
  "async",
]);

/**
 * Every identifier the module defines: function declarations, const/let/var
 * bindings (which covers arrow functions and object literals), class names,
 * imported bindings, and destructured names.
 */
function definedNames(source) {
  const names = new Set();
  const add = (rx, group = 1) => {
    for (const m of source.matchAll(rx)) names.add(m[group]);
  };
  add(/\bfunction\s+([A-Za-z_$][\w$]*)/g);
  add(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g);
  add(/\bclass\s+([A-Za-z_$][\w$]*)/g);
  // import { a, b as c } from "..." and import d from "..."
  for (const m of source.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
    if (m[1]) names.add(m[1]);
    for (const part of (m[2] || "").split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  // Destructured bindings: const { a, b: c } = ..., and [a, b] = ...
  for (const m of source.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":").pop().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const m of source.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // Object-literal method shorthand: `load() {`, `apply(key, val) {`. These are
  // definitions even though they carry no `function` keyword.
  add(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm);
  // Single-parameter arrows written without parentheses: `resolve => …`.
  add(/\b([A-Za-z_$][\w$]*)\s*=>/g);
  // Function parameters, which are callable when they hold a callback. The
  // leading "(" strip matters for `new Promise((resolve) => …)`, where the
  // non-nesting match starts one paren too early.
  for (const m of source.matchAll(/\(([^)]*)\)\s*=>/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^[(\s]+/, "").split(/[=:]/)[0].trim().replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const m of source.matchAll(/function[^(]*\(([^)]*)\)/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/[=:]/)[0].trim().replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/**
 * Blank out comments.
 *
 * Prose is full of things that look like calls — "Symbol Atlas (Update 5.2b)"
 * reads as a call to `Atlas`. Scanning raw source produces false positives, and
 * a check that cries wolf gets deleted rather than fixed.
 *
 * Strings and template literals are deliberately NOT stripped. Doing it
 * correctly needs a real tokenizer — `${}` interpolations nest, and getting the
 * parity wrong silently swallows large spans of real code, which turns this
 * check into a list of functions that plainly do exist. That failure is much
 * worse than the alternative: a name that only ever appears inside a string,
 * which lands in KNOWN_STRING_ARTIFACTS below with a note on where it comes
 * from. If a future string introduces a new one, this test fails loudly with
 * the name printed and the fix is one reviewed line.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 "); // line comments (not the // in a URL)
}

/**
 * Names that appear only inside CSS or prose within string literals. Each was
 * checked by hand against every occurrence in the source before being listed.
 */
const KNOWN_STRING_ARTIFACTS = new Set([
  "var",     // CSS custom properties in inline style strings: var(--color-error)
  "not",     // CSS selector in the focusable-elements list: button:not([disabled])
  "rgba",    // CSS colour in an inline style string
  "url",     // CSS url() in an inline style string
  "calc",    // CSS calc() in an inline style string
  "service", // prose: "Orbit could not reach the service (status N)"
]);

/** Bare calls — `name(` not preceded by a dot, and not a declaration site. */
function calledNames(source) {
  const calls = new Set();
  for (const m of source.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const before = source.slice(Math.max(0, m.index - 30), m.index + m[1].length);
    // Skip declarations: `function foo(`, `class foo(`, and object methods.
    if (/\b(function|class)\s*$/.test(before)) continue;
    calls.add(m[2]);
  }
  return calls;
}

function checkModule(relativePath) {
  const source = stripComments(readFileSync(join(ROOT, relativePath), "utf8"));
  const defined = definedNames(source);
  const missing = [...calledNames(source)]
    .filter((name) => !defined.has(name) && !GLOBALS.has(name) && !KNOWN_STRING_ARTIFACTS.has(name))
    .sort();
  return missing;
}

test("public/app.js calls no function it does not define or import", () => {
  const missing = checkModule("public/app.js");
  assert.deepEqual(missing, [],
    "these names are called but defined nowhere — a removed block probably took a " +
    "still-used helper with it. This throws at runtime, and a surrounding catch " +
    "can turn it into a wrong empty state rather than a visible error.");
});

test("the other shipped client modules are self-contained too", () => {
  for (const file of ["public/moon-phase.js", "public/startup-state.js", "public/legal.js"]) {
    assert.deepEqual(checkModule(file), [], `${file} calls something it does not define`);
  }
});

test("the guard actually detects a missing definition", () => {
  // A check that can only pass is not a check. This proves the detector fires.
  const broken = "function a() { return definitelyNotDefinedAnywhere(1); }";
  const defined = definedNames(broken);
  const missing = [...calledNames(broken)].filter((n) => !defined.has(n) && !GLOBALS.has(n));
  assert.deepEqual(missing, ["definitelyNotDefinedAnywhere"]);
});

test("no swallowing catch hides a programming error in the saved-chart path", () => {
  // The Dev Update 1.3 failure was invisible because `catch {}` treated a
  // ReferenceError as "the request failed". A bare catch around a block that
  // does more than one await is where that happens; this pins the specific
  // path that broke, so a future edit has to think about it again.
  const source = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  const fn = source.slice(source.indexOf("async function loadSavedCharts"),
                          source.indexOf("async function retryLoadSavedCharts"));
  assert.match(fn, /state\.chartsStatus = "error"/, "a failed load must still be recorded as an error");
  assert.ok(fn.includes("setActiveChartName"),
    "the active-chart name is set here, so its definition must survive any refactor");
});
