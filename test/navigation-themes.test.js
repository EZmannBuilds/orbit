// Orbit Axis :: Dev Update 1.3 — canonical navigation, themes, retired surfaces.
//
// The project deliberately has no browser test harness, so these are structural
// assertions over the shipped HTML, CSS, and controller source. That limits what
// they can prove — they cannot click anything — so each one pins a property that
// would otherwise regress *silently*: a sixth tab appearing, a retired page
// coming back, a theme resolving after first paint instead of before it.
//
// What they deliberately do NOT claim: that any of this was verified with a
// screen reader. Automated coverage and assistive-technology evidence are
// different things, and conflating them is how an accessibility claim becomes
// untrue.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const html = read("public", "index.html");
const appJs = read("public", "app.js");
const navCss = read("public", "styles", "navigation.css");
const tokensCss = read("public", "styles", "tokens.css");
const moreCss = read("public", "styles", "more.css");
const orbitAxisCss = read("public", "styles", "orbit-axis.css");

/** The five canonical destinations, in their canonical order. */
const CANONICAL = [
  { id: "home", label: "Home" },
  { id: "me", label: "My Chart" },
  { id: "transits", label: "Today’s Transits" },
  { id: "tools", label: "Tools" },
  { id: "more", label: "More" },
];

/** Parse the WORKSPACES registry entries in source order. */
function registry() {
  const block = appJs.slice(appJs.indexOf("const WORKSPACES = ["),
                            appJs.indexOf("];", appJs.indexOf("const WORKSPACES = [")));
  return [...block.matchAll(/\{ id: "([^"]+)", label: "([^"]+)"(.*)$/gm)].map((m) => ({
    id: m[1],
    label: m[2],
    primary: /primary: true/.test(m[3]),
    rest: m[3],
  }));
}

// ── One canonical navigation model ──────────────────────────────────────────

test("the primary navigation is exactly the five canonical destinations, in order", () => {
  const primary = registry().filter((ws) => ws.primary);
  assert.deepEqual(primary.map((ws) => ws.id), CANONICAL.map((d) => d.id));
  assert.deepEqual(primary.map((ws) => ws.label), CANONICAL.map((d) => d.label));
});

test("a sixth primary destination cannot be added without failing this test", () => {
  // The count is the point. Five labelled tabs fit a 375px phone; six do not,
  // and the failure mode is silent — labels truncate rather than break.
  assert.equal(registry().filter((ws) => ws.primary).length, 5);
});

test("mobile and desktop render from the same links, so they cannot disagree", () => {
  // One builder, one DOM. Two sets of markup would be two places for the order
  // and the labels to drift.
  const build = appJs.slice(appJs.indexOf("function buildRail()"), appJs.indexOf("function requestedRoute"));
  assert.match(build, /availableWorkspaces\(\)\.filter\(ws => ws\.primary\)/);
  assert.equal((html.match(/id="rail-nav"/g) || []).length, 1, "exactly one navigation container ships");
  assert.match(navCss, /@media \(max-width: 900px\)/, "the same container becomes the phone bar");
  assert.match(navCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
    "the phone bar must have exactly five columns");
});

test("the phone label is an abbreviation of the same name, never a different word", () => {
  for (const ws of registry().filter((ws) => ws.primary)) {
    const short = /mobileLabel: "([^"]+)"/.exec(ws.rest)?.[1];
    if (!short) continue;
    assert.ok(ws.label.includes(short),
      `"${short}" is not a shortening of "${ws.label}" — the two navigations would read differently`);
  }
});

test("Today's Transits opens the transits view directly, with no page in between", () => {
  const entry = registry().find((ws) => ws.id === "transits");
  assert.ok(entry?.primary, "Today's Transits must be primary navigation");
  assert.ok(html.includes('id="panel-transits"'), "and it must point at the real transits panel");
  // Arriving must also populate it, or a direct link lands on an empty page.
  const render = appJs.slice(appJs.indexOf("function renderRoute()"));
  assert.match(render, /id === "transits"[\s\S]{0,80}renderTransits\(\)/);
});

test("every routed destination has one page heading, tied to its panel", () => {
  const panels = [...html.matchAll(/id="(panel-[a-z-]+)"[^>]*aria-labelledby="([^"]+)"/g)];
  assert.ok(panels.length >= 5, `expected the routed panels, found ${panels.length}`);
  for (const [, panel, labelledBy] of panels) {
    assert.ok(new RegExp(`id="${labelledBy}"`).test(html),
      `${panel} points aria-labelledby at #${labelledBy}, which does not exist`);
  }
});

test("no panel claims to be a tab panel now that the navigation is links", () => {
  // role="tabpanel" without a tablist is a promise the markup does not keep.
  assert.ok(!/id="panel-[a-z-]+"[^>]*role="tabpanel"/.test(html));
  assert.ok(!html.includes('id="rail-nav" role="tablist"'));
});

test("the current page is stated in the accessibility tree and not by colour alone", () => {
  const render = appJs.slice(appJs.indexOf("function renderRoute()"));
  assert.match(render, /setAttribute\("aria-current", "page"\)/);
  assert.match(render, /removeAttribute\("aria-current"\)/,
    'inactive links must drop the attribute rather than set it to "false"');
  assert.match(navCss, /\.rail__link\[aria-current="page"\][\s\S]{0,200}font-weight/,
    "the current tab needs a non-colour signal too");
});

// ── Retired surfaces stay retired ───────────────────────────────────────────

test("Ask Orbit has no entry point anywhere in the shipped interface", () => {
  for (const relic of ['id="panel-ask"', 'href="#ask"', 'id="ask-input"', "axis-ask__btn"]) {
    assert.ok(!html.includes(relic), `${relic} must not ship`);
  }
  assert.ok(!appJs.includes("function wireAsk"), "the Ask wiring must be gone");
});

test("Overview, Research, and the old Charts page are gone as destinations", () => {
  for (const id of ["dashboard", "research", "charts"]) {
    assert.ok(!html.includes(`id="panel-${id}"`), `panel-${id} must not ship`);
    assert.ok(!new RegExp(`\\{ id: "${id}"`).test(appJs), `${id} must not be a workspace`);
  }
});

test("every retired route redirects somewhere that exists", () => {
  const block = appJs.slice(appJs.indexOf("const RETIRED_ROUTES"), appJs.indexOf("});", appJs.indexOf("const RETIRED_ROUTES")));
  const targets = [...block.matchAll(/to: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 4, "the known retired routes should be declared");
  const known = new Set(registry().map((ws) => ws.id));
  for (const target of targets) {
    assert.ok(known.has(target), `a retired route points at "${target}", which is not a workspace`);
  }
});

test("an unknown route recovers instead of showing a blank surface", () => {
  const resolve = appJs.slice(appJs.indexOf("function resolveLegacyRoute()"));
  assert.match(resolve, /location\.replace/, "a retired route must not pile up in history");
  assert.match(resolve, /isn't part of Orbit Axis/, "an unknown route must say so plainly");
  assert.match(appJs, /workspaceAvailable\(hash\) \? hash : "home"/, "and must still land on a real page");
});

test("Tarot, Learn, and News remain absent from the shipped markup", () => {
  for (const id of ["tarot", "learn", "news"]) {
    assert.ok(!html.includes(`id="panel-${id}"`), `panel-${id} must not ship`);
    assert.ok(!new RegExp(`id: "${id}"[^}]*primary: true`).test(appJs), `${id} must not be primary navigation`);
  }
});

test("no engineering diagnostic is presented to an ordinary user", () => {
  // Model names, prompt versions, token counts, ports, and connection status
  // are answers to questions a reader never asked, and they age badly in public.
  for (const relic of ['id="llm-status"', 'id="llm-model"', 'id="llm-prompt-version"',
                       'id="intel-form"', 'id="proposal-panel"', 'id="rail-status"',
                       'id="set-service"', 'id="system-status"']) {
    assert.ok(!html.includes(relic), `${relic} is a developer surface and must not ship`);
  }
  for (const relic of ["loadLocalIntelligence", "runIntelGenerate", "renderProposal"]) {
    assert.ok(!appJs.includes(relic), `${relic} must be gone from the controller`);
  }
  assert.ok(!/port \$\{/.test(appJs), "a port number must never reach the interface");
});

// ── Theme system ────────────────────────────────────────────────────────────

test("the theme resolves before first paint, without a network request", () => {
  // The inline script has to run before the stylesheets, or a light-mode user
  // sees a dark flash on every load. Position in <head> is the guarantee.
  const script = html.indexOf("localStorage.getItem(\"orbit.theme\")");
  const firstSheet = html.indexOf('<link rel="stylesheet"');
  assert.ok(script > 0, "a pre-paint theme script must exist");
  assert.ok(script < firstSheet, "it must run before the first stylesheet");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.ok(!/fetch\(|XMLHttpRequest/.test(head), "startup theming must not wait on the network");
});

test("System is the default, and an unrecognised stored value falls back to it", () => {
  assert.match(appJs, /THEME_CHOICES\.includes\(raw\) \? raw : "system"/);
  assert.match(html, /if \(stored !== "light" && stored !== "dark" && stored !== "system"\) stored = "system"/);
});

test("the pre-paint script and the controller resolve the theme identically", () => {
  // Two implementations of one rule will drift; this pins them to the same
  // media query and the same fallback direction.
  assert.match(html, /prefers-color-scheme: light/);
  assert.match(appJs, /matchMedia\?\.\("\(prefers-color-scheme: light\)"\)/);
  assert.match(html, /matches \? "light" : "dark"/);
  assert.match(appJs, /matches \? "light" : "dark"/);
});

test("the choice and the resolved theme are recorded separately", () => {
  // Collapsing them turns a "System" selection into a hard Light or Dark the
  // first time it is written back, and the device stops being followed.
  assert.match(appJs, /root\.dataset\.theme = resolved/);
  assert.match(appJs, /root\.dataset\.themePreference = choice/);
});

test("System keeps following the device; Light and Dark stop it", () => {
  const wire = appJs.slice(appJs.indexOf("function wireSettings()"));
  assert.match(wire, /readStoredTheme\(\) === "system"/, "only System reacts to a device change");
  assert.match(wire, /addEventListener\?\.\("change"/, "and it must actually subscribe");
});

test("the preference persists, and storage failure never breaks the app", () => {
  assert.match(appJs, /localStorage\.setItem\(THEME_STORAGE_KEY, choice\)/);
  // Safari private mode throws on setItem. A theme is not worth an exception.
  assert.match(appJs, /function storeTheme\(choice\) \{[\s\S]{0,160}catch/);
  assert.match(appJs, /function readStoredTheme\(\) \{[\s\S]{0,220}catch/);
});

test("color-scheme and the browser chrome colour both follow the theme", () => {
  assert.match(tokensCss, /:root\[data-theme="dark"\] \{[\s\S]{0,80}color-scheme: dark/);
  assert.match(tokensCss, /:root\[data-theme="light"\] \{[\s\S]{0,40}color-scheme: light/);
  assert.match(appJs, /meta\.setAttribute\("content", THEME_COLORS\[resolved\]/);
  assert.ok(html.includes('id="meta-theme-color"'), "the theme-color meta tag must exist to update");
});

test("the theme control offers three choices with visible text labels", () => {
  const control = html.slice(html.indexOf('id="set-theme"'), html.indexOf('id="set-theme-help"'));
  for (const value of ["system", "light", "dark"]) {
    assert.ok(control.includes(`data-value="${value}"`), `the ${value} choice must exist`);
  }
  for (const label of ["<span>System</span>", "<span>Light</span>", "<span>Dark</span>"]) {
    assert.ok(control.includes(label), `${label} must be visible text, not an icon alone`);
  }
  assert.match(control, /aria-pressed="(true|false)"/, "the selected state must be exposed");
  assert.match(control, /role="group" aria-labelledby="set-theme-label"/, "the group must be named");
  assert.ok(!/<svg[^>]*(?<!aria-hidden="true")>/.test(control.replace(/\n/g, "")) ||
            control.includes('aria-hidden="true"'), "the icons must be decorative");
});

test("the theme control meets the 44px target on every screen", () => {
  assert.match(moreCss, /\.o-segment--theme button \{[\s\S]{0,200}min-height: 44px/);
  assert.match(moreCss, /@media \(max-width: 420px\)[\s\S]{0,400}\.o-segment--theme \{ width: 100%/,
    "three targets must go full width rather than shrink on a narrow phone");
});

test("high-contrast and forced-colors support survives the theme work", () => {
  assert.match(tokensCss, /@media \(prefers-contrast: more\)/, "the contrast preference must still be honoured");
  assert.match(tokensCss, /:root\[data-contrast="high"\]/, "the explicit high-contrast tokens must remain");
  assert.match(navCss, /@media \(forced-colors: active\)/, "navigation must survive forced colours");
  assert.match(moreCss, /@media \(forced-colors: active\)/, "so must the selected control state");
});

// ── Light mode is designed, not inverted ────────────────────────────────────

test("light mode gets its own celestial palette rather than inverted darks", () => {
  assert.match(orbitAxisCss, /:root\[data-theme="light"\] \{[\s\S]{0,400}--axis-indigo/);
});

test("effects that only work on a dark page are withdrawn in light mode", () => {
  // White stars on a white page are invisible; a pale gradient wordmark on
  // white has no contrast at all.
  assert.match(orbitAxisCss, /:root\[data-theme="light"\] \.axis-starfield \{ display: none; \}/);
  assert.match(orbitAxisCss, /:root\[data-theme="light"\] \.axis-wordmark/);
});

test("the carried-over feature panels get light values for their legacy variables", () => {
  // These are hardcoded dark. Without light values, the chart form, the auth
  // gate, and every modal stay dark boxes on a light page.
  const features = read("public", "styles", "features.css");
  assert.match(features, /:root\[data-theme="light"\] #panel-me[\s\S]{0,400}--surface: #ffffff/);
  assert.match(features, /:root\[data-theme="light"\][\s\S]{0,500}--text: #12161c/);
});

// ── Tools is truthful ───────────────────────────────────────────────────────

test("every Tools action opens a destination that exists", () => {
  const panel = html.slice(html.indexOf('id="panel-tools"'), html.indexOf('id="panel-tools"') + 3000);
  const targets = [...panel.matchAll(/data-goto="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 3, `Tools should offer the working destinations, saw ${targets.join(", ")}`);
  const known = new Set(registry().map((ws) => ws.id));
  for (const target of targets) {
    assert.ok(known.has(target), `Tools links to "${target}", which is not a workspace`);
    assert.ok(html.includes(`id="panel-${target}"`), `Tools links to "${target}", which has no panel`);
  }
});

test("planned work is stated as prose, never as a control that does nothing", () => {
  const planned = html.slice(html.indexOf("tool-card--planned"), html.indexOf("</section>", html.indexOf("tool-card--planned")));
  assert.ok(!/<button/.test(planned), "a disabled button reads as a bug; a sentence reads as a roadmap");
  assert.ok(!/data-goto/.test(planned), "and it must not navigate anywhere");
  assert.match(planned, /not built yet/i, "it must say plainly that the work is not done");
});

// ── More is coherent ────────────────────────────────────────────────────────

test("More carries the account and application actions, each with a visible label", () => {
  const panel = html.slice(html.indexOf('id="panel-more"'), html.indexOf('id="panel-history"'));
  for (const id of ["account-email", "account-export", "account-password-reset",
                    "account-signout", "account-delete-open"]) {
    assert.ok(panel.includes(`id="${id}"`), `More must carry ${id}`);
  }
  for (const href of ["/privacy", "/terms", "/support", "/source", "/account-deletion"]) {
    assert.ok(panel.includes(`href="${href}"`), `More must link to ${href}`);
  }
  assert.match(panel, /data-goto="settings"/, "and it must reach Settings, where the theme lives");
});

test("deletion stays visually separated from the harmless actions", () => {
  const panel = html.slice(html.indexOf('id="panel-more"'), html.indexOf('id="panel-history"'));
  const exportAt = panel.indexOf('id="account-export"');
  const deleteAt = panel.indexOf('id="account-delete-open"');
  assert.ok(exportAt > 0 && deleteAt > exportAt, "delete must not sit beside the ordinary actions");
  assert.match(panel, /class="danger-zone"/, "and it must keep its own visual boundary");
});

// ── Dev Update 1.2 must survive ─────────────────────────────────────────────

test("authentication, export, and password reset are untouched", () => {
  for (const id of ["auth-gate", "auth-form", "auth-email", "auth-password", "auth-submit",
                    "account-export", "account-password-reset", "delete-account-modal"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} is Dev Update 1.2 behaviour and must survive`);
  }
  assert.match(appJs, /function wireAccountExport/);
  assert.match(appJs, /function wireAccountPasswordReset/);
  assert.match(appJs, /function wireAccountDeletion/);
});

test("the authentication gate keeps its accessible dialog semantics", () => {
  const gate = html.slice(html.indexOf('id="auth-gate"'), html.indexOf('id="auth-gate"') + 600);
  assert.match(gate, /role="dialog"/);
  assert.match(gate, /aria-modal="true"/);
  assert.match(gate, /aria-labelledby="auth-gate-title"/);
  assert.match(appJs, /function setBackgroundInert/, "the shell must still go inert behind it");
});
