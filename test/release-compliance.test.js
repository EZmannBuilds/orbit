// Orbit Axis :: release compliance.
//
// Legal pages, source disclosure, contact configuration, and the production
// artifact. The theme throughout is that Orbit must not state something nobody
// decided — a plausible support address or an invented jurisdiction is worse
// than a visible gap, because a gap gets fixed and a plausible lie does not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { legalConfig, publicLegalConfig, safeSourceUrl, REQUIRED_BEFORE_PUBLIC }
  from "../lib/legal/config.js";

const page = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");
const repoFile = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const PAGES = ["privacy.html", "terms.html", "support.html", "source.html", "account-deletion.html"];

// ── The pages exist and are real ────────────────────────────────────────────

test("every public information page ships", () => {
  for (const name of PAGES) {
    assert.ok(existsSync(new URL(`../public/${name}`, import.meta.url)), `${name} is missing`);
  }
});

test("no page contains placeholder filler", () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.doesNotMatch(html, /lorem ipsum/i, `${name} contains lorem ipsum`);
    assert.doesNotMatch(html, /\bTODO\b|\bFIXME\b|\bXXX\b/, `${name} contains an unfinished marker`);
    assert.ok(html.length > 2000, `${name} is too short to be a real document`);
  }
});

test("the phrase 'Terms and Services' is never used", () => {
  // It is not the name of anything. The document is Terms of Use.
  for (const name of [...PAGES, "index.html"]) {
    assert.doesNotMatch(page(name), /Terms and Services/i, `${name} uses the wrong name`);
  }
  assert.match(page("terms.html"), /Terms of Use/);
});

test("no page ships an invented contact, company, or jurisdiction", () => {
  // The failure this guards against is a page that looks complete because it
  // contains a plausible support address nobody reads.
  const invented = [
    /support@orbitaxis\./i, /hello@orbit/i, /contact@orbit/i,
    /\bOrbit Axis,? (Inc|LLC|Ltd|GmbH|Limited)\b/i,
    /\b\d+ [A-Z][a-z]+ (Street|Avenue|Road)\b/,
    /State of California|Delaware|England and Wales/i,
  ];
  for (const name of PAGES) {
    const html = page(name);
    for (const rx of invented) {
      assert.doesNotMatch(html, rx, `${name} appears to ship an invented detail: ${rx}`);
    }
  }
});

test("contact and legal facts are slots, not hardcoded values", () => {
  for (const name of PAGES) {
    assert.match(page(name), /data-legal="/, `${name} must resolve its facts from configuration`);
  }
});

test("a mailto link is never rendered before an address is configured", () => {
  // A dead mailto is a broken promise. The href is only filled in once a real
  // address exists.
  for (const name of PAGES) {
    assert.doesNotMatch(page(name), /href="mailto:/, `${name} hardcodes a mailto link`);
  }
  assert.match(readFileSync(new URL("../public/legal.js", import.meta.url), "utf8"),
    /el\.href = `mailto:\$\{resolved\}`/,
    "the mailto must be built at runtime from a validated address");
});

// ── Configuration validation ────────────────────────────────────────────────

test("missing configuration is reported rather than filled in", () => {
  const config = legalConfig({});
  assert.deepEqual(config.missing.sort(), [...REQUIRED_BEFORE_PUBLIC].sort());
  assert.equal(config.readyForPublicRelease, false);
  assert.equal(config.supportEmail, null);
  assert.equal(config.jurisdiction, null);
});

test("a complete configuration is accepted", () => {
  const config = legalConfig({
    ORBIT_SUPPORT_EMAIL: "help@example.com",
    ORBIT_LEGAL_ENTITY: "Example Publisher",
    ORBIT_GOVERNING_JURISDICTION: "Example Jurisdiction",
    ORBIT_MINIMUM_AGE: "16",
  });
  assert.deepEqual(config.missing, []);
  assert.equal(config.readyForPublicRelease, true);
  assert.equal(config.minimumAge, 16);
});

test("a malformed support address is refused rather than shipped", () => {
  for (const bad of ["not-an-email", "@example.com", "a@b", "a b@example.com", "", "   "]) {
    assert.equal(legalConfig({ ORBIT_SUPPORT_EMAIL: bad }).supportEmail, null, `"${bad}" must be refused`);
  }
});

test("an implausible minimum age is refused rather than published", () => {
  // "You must be 1 year old" is a typo, not a policy.
  for (const bad of ["0", "1", "5", "12", "99", "abc", "", "16.5"]) {
    assert.equal(legalConfig({ ORBIT_MINIMUM_AGE: bad }).minimumAge, null, `"${bad}" must be refused`);
  }
  for (const good of ["13", "16", "18", "21"]) {
    assert.equal(legalConfig({ ORBIT_MINIMUM_AGE: good }).minimumAge, Number(good));
  }
});

test("only https URLs on known code hosts are accepted as source links", () => {
  assert.ok(safeSourceUrl("https://github.com/owner/repo"));
  assert.ok(safeSourceUrl("https://codeberg.org/owner/repo"));
  for (const bad of [
    "http://github.com/owner/repo",              // not https
    "https://evil.example.com/owner/repo",        // unknown host
    "javascript:alert(1)",
    "//github.com/owner/repo",
    "not a url", "", null, undefined, 42,
  ]) {
    assert.equal(safeSourceUrl(bad), null, `${String(bad)} must be refused`);
  }
});

test("the public config exposes values but never the configuration itself", () => {
  const body = JSON.stringify(publicLegalConfig({
    ORBIT_SUPPORT_EMAIL: "help@example.com",
    SUPABASE_SERVICE_ROLE_KEY: "must-not-appear",
    SUPABASE_URL: "https://exampleprojectref000.supabase.co",
  }));
  for (const forbidden of ["ORBIT_SUPPORT_EMAIL", "SUPABASE", "must-not-appear", "supabase.co", "missing"]) {
    assert.ok(!body.includes(forbidden), `the public config must not expose ${forbidden}`);
  }
  assert.ok(body.includes("help@example.com"), "but it must carry the value itself");
});

// ── Disclaimers ─────────────────────────────────────────────────────────────

test("the astrology disclaimer says reflection and entertainment", () => {
  // Whitespace-collapsed: the phrase is real, it just wraps across lines in the
  // source. Asserting on formatting rather than wording would make the test
  // fail every time the paragraph is rewrapped.
  const terms = page("terms.html").replace(/\s+/g, " ");
  assert.match(terms, /reflection and entertainment/i);
});

test("the not-professional-advice disclaimer names every category", () => {
  const terms = page("terms.html");
  for (const field of ["medical", "mental-health", "legal", "financial", "emergency"]) {
    assert.match(terms, new RegExp(field, "i"), `the disclaimer must mention ${field}`);
  }
  assert.match(terms, /crisis|emergency services/i, "it must point somewhere real in a crisis");
});

test("the AI disclaimer distinguishes calculated fact from wording", () => {
  const terms = page("terms.html");
  assert.match(terms, /deterministic/i);
  assert.match(terms, /no external AI provider|not.*sent to an external AI/i);
});

test("no reading is claimed to predict the future", () => {
  const terms = page("terms.html");
  assert.match(terms, /not a prediction|No outcome is guaranteed/i);
});

// ── Source disclosure ───────────────────────────────────────────────────────

test("the source page states the licence and the Swiss Ephemeris relationship", () => {
  const html = page("source.html");
  assert.match(html, /AGPL-3\.0-or-later/);
  assert.match(html, /Astrodienst/);
  assert.match(html, /dual-licensed/i);
  assert.match(html, /inherited/i, "the page must explain WHY Orbit is AGPL");
});

test("the source page shows publication as pending rather than a broken link", () => {
  assert.match(page("source.html"), /Repository publication pending/);
});

test("versions are read live rather than typed into the page", () => {
  assert.match(page("source.html"), /data-version="application"/);
  assert.match(page("source.html"), /data-version="engine"/);
  assert.doesNotMatch(page("source.html"), /\bv?\d+\.\d+\.\d+\b/, "no version may be hardcoded");
});

// ── Deletion page matches the implementation ────────────────────────────────

test("the deletion page describes the real flow", () => {
  const html = page("account-deletion.html");
  assert.match(html, /More/);
  assert.match(html, /Account/);
  assert.match(html, /<code>DELETE<\/code>/, "the typed confirmation must be stated exactly");
  assert.match(html, /permanent/i);
  assert.match(html, /cannot be undone|cannot restore/i);
});

test("the deletion page does not promise deleting files that do not exist", () => {
  const html = page("account-deletion.html");
  // The project has no storage buckets. Claiming uploads are deleted would be a
  // claim about something that cannot happen.
  assert.match(html, /no file upload today|If Orbit ever supports uploaded files/i);
});

test("the deletion page keeps internal table names out of user-facing copy", () => {
  const html = page("account-deletion.html");
  for (const internal of ["birth_profiles", "ask_conversations", "daily_fortunes", "auth.users", "owner_id"]) {
    assert.ok(!html.includes(internal), `${internal} is an implementation detail, not user copy`);
  }
});

test("the deletion page is honest about provider backups", () => {
  // Claiming instant erasure from a provider's backups would be unverifiable.
  assert.match(page("account-deletion.html"), /backups/i);
});

// ── Open-source files ───────────────────────────────────────────────────────

test("the repository carries every file a published project needs", () => {
  for (const f of ["LICENSE", "NOTICE", "SOURCE.md", "SECURITY.md",
                   "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "THIRD_PARTY_NOTICES.md", "README.md"]) {
    assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${f} is missing`);
  }
});

test("the licence is the real AGPL text, not a summary", () => {
  const licence = repoFile("LICENSE");
  assert.match(licence, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(licence, /Version 3, 19 November 2007/);
  assert.ok(licence.length > 30000, "the full licence text is ~34KB; a summary is not a licence");
});

test("package.json declares the licence and refuses accidental publication", () => {
  const pkg = JSON.parse(repoFile("package.json"));
  assert.equal(pkg.license, "AGPL-3.0-or-later");
  assert.equal(pkg.private, true, "this is an application, not an npm package");
});

test("NOTICE explains the inherited obligation and network use", () => {
  const notice = repoFile("NOTICE");
  assert.match(notice, /Swiss Ephemeris/);
  assert.match(notice, /Astrodienst AG/);
  assert.match(notice, /inherited/i);
  assert.match(notice, /NETWORK USE/i, "AGPL section 13 is the whole reason this matters");
});

test("public documents contain no private local paths or secrets", () => {
  for (const f of ["LICENSE", "NOTICE", "SOURCE.md", "SECURITY.md", "CONTRIBUTING.md",
                   "THIRD_PARTY_NOTICES.md", "README.md"]) {
    const text = repoFile(f);
    assert.doesNotMatch(text, /\/Users\/mr\.mann/, `${f} exposes a private local path`);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}\./, `${f} contains something shaped like a token`);
    assert.doesNotMatch(text, /mtdrazdastcgiweauwoj/, `${f} exposes the Supabase project reference`);
  }
});

// ── The production artifact ─────────────────────────────────────────────────

const ARTIFACT = new URL("../.vercel/output/static/", import.meta.url);
const built = existsSync(ARTIFACT);

test("unfinished features are absent from the production HTML", { skip: !built ? "no build output" : false }, () => {
  const html = readFileSync(new URL("index.html", ARTIFACT), "utf8");
  for (const id of ["tarot", "learn", "news"]) {
    assert.ok(!html.includes(`id="panel-${id}"`), `panel-${id} must not ship`);
    assert.ok(!html.includes(`panel-${id}`), `no reference to panel-${id} may ship`);
  }
});

test("the unfinished markup is not anywhere in the static output", { skip: !built ? "no build output" : false }, () => {
  // The fragments live outside public/ precisely so they cannot be copied here.
  for (const id of ["tarot", "learn", "news"]) {
    assert.ok(!existsSync(new URL(`features/panels/${id}.html`, ARTIFACT)));
    assert.ok(!existsSync(new URL(`${id}.html`, ARTIFACT)));
  }
});

test("the future implementations are still preserved in the repository", () => {
  // A flag is pretending if the work it gates has been deleted.
  for (const id of ["tarot", "learn", "news"]) {
    assert.ok(existsSync(new URL(`../features/panels/${id}.html`, import.meta.url)),
      `the ${id} panel must be preserved for future work`);
  }
});

test("every public page ships in the built output", { skip: !built ? "no build output" : false }, () => {
  for (const name of [...PAGES, "reset-password.html", "legal.js", "styles/legal.css"]) {
    assert.ok(existsSync(new URL(name, ARTIFACT)), `${name} is missing from the artifact`);
  }
});

test("the built client carries no service-role key and no private paths", { skip: !built ? "no build output" : false }, () => {
  const files = execFileSync("find", [new URL(ARTIFACT).pathname, "-type", "f"], { encoding: "utf8" })
    .split("\n").filter(Boolean);
  assert.ok(files.length > 5, "the artifact should contain many files — an empty scan proves nothing");
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(!text.includes("service_role"), `${file} mentions service_role`);
    assert.ok(!text.includes("/Users/mr.mann"), `${file} contains a private path`);
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/.test(text), `${file} carries a key`);
  }
});
