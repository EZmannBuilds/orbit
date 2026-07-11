#!/usr/bin/env node
// Orbit vault → Supabase sync tool.
//
// Conservative, one-way (vault → db), dry-run by default. Zero runtime
// dependencies — pure Node standard library (Node 18+ for global fetch).
//
// Commands:
//   scan       List every note and its parsed metadata.
//   validate   Check frontmatter; non-zero exit on any error (CI-friendly).
//   status     Compare vault against the vault_notes index in Supabase.
//   sync       Push eligible notes. DRY-RUN unless --push is passed.
//
// Flags:
//   --vault <path>   Override vault location.
//   --json           Machine-readable output.
//   --push           For `sync`: actually write (otherwise dry-run).
//
// The vault is the human-readable source of truth. Only notes with
// `supabase_sync: true` are ever considered. Writes go through the Supabase
// REST API as the *authenticated user* — a user access token is required for
// `--push` (RLS blocks anonymous writes by design). See docs/supabase-setup.md.

import { readFileSync, readdirSync, statSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ── config ───────────────────────────────────────────────────────────────────
loadEnvLocal();

const DEFAULT_VAULT = process.env.ORBIT_VAULT_PATH
  || join(REPO_ROOT, "..", "Orbit vault");

const SUPPORTED_TYPES = new Set([
  "person", "birth_chart", "planet", "sign", "house", "aspect", "transit",
  "tarot_card", "tarot_reading", "journal_entry", "dream", "symbol", "research",
  "product_feature", "technical_decision", "project", "event",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Templates are scaffolding (blank ids, {{placeholders}}), not content — skip.
const SKIP_DIRS = new Set([".obsidian", ".git", "Attachments", "Templates"]);

// ── tiny arg parser ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = {
  vault: takeFlag("--vault") || DEFAULT_VAULT,
  json: argv.includes("--json"),
  push: argv.includes("--push"),
};

function takeFlag(name) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

// ── entry ────────────────────────────────────────────────────────────────────
const commands = { scan, validate, status, sync };
if (!commands[cmd]) {
  console.log(`Orbit vault sync

Usage: node scripts/vault-sync.js <command> [--vault <path>] [--json] [--push]

Commands:
  scan       List notes and parsed metadata
  validate   Validate frontmatter (exit 1 on errors)
  status     Compare vault vs Supabase vault_notes index
  sync       Push eligible notes (dry-run unless --push)

Vault: ${DEFAULT_VAULT}`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((err) => { console.error("ERROR:", err.message); process.exit(1); });

// ── commands ─────────────────────────────────────────────────────────────────
async function scan() {
  const notes = collectNotes(flags.vault);
  if (flags.json) return void console.log(JSON.stringify(notes, null, 2));
  console.log(`Scanned ${notes.length} note(s) in ${flags.vault}\n`);
  for (const n of notes) {
    const sync = n.frontmatter.supabase_sync ? "sync" : "----";
    console.log(`  [${sync}] ${(n.frontmatter.type || "?").padEnd(18)} ${n.relPath}`);
  }
}

async function validate() {
  const all = collectNotes(flags.vault);
  // A note is "managed" once it opens with a frontmatter block. Plain notes
  // (e.g. Obsidian's default Welcome.md) are unmanaged — not errors, just not
  // synced. Malformed frontmatter (unterminated/unparseable) is still an error.
  const unmanaged = all.filter((n) => n.parseError === "no frontmatter");
  const notes = all.filter((n) => n.parseError !== "no frontmatter");
  const errors = [];
  const seenIds = new Map();

  for (const n of notes) {
    const fm = n.frontmatter;
    const where = n.relPath;
    if (n.parseError) errors.push(`${where}: frontmatter parse error — ${n.parseError}`);
    if (!fm.id) errors.push(`${where}: missing required 'id'`);
    else if (!UUID_RE.test(String(fm.id))) errors.push(`${where}: 'id' is not a UUID (${fm.id})`);
    else {
      if (seenIds.has(fm.id)) errors.push(`${where}: DUPLICATE id ${fm.id} (also in ${seenIds.get(fm.id)})`);
      else seenIds.set(fm.id, where);
    }
    if (!fm.title) errors.push(`${where}: missing 'title'`);
    if (!fm.type) errors.push(`${where}: missing 'type'`);
    else if (!SUPPORTED_TYPES.has(fm.type)) errors.push(`${where}: unsupported type '${fm.type}'`);
    if (fm.supabase_sync === undefined) errors.push(`${where}: missing 'supabase_sync' (true/false)`);
  }

  if (flags.json) {
    console.log(JSON.stringify({
      ok: errors.length === 0, managed: notes.length, unmanaged: unmanaged.length, errors,
    }, null, 2));
  } else if (errors.length === 0) {
    console.log(`OK — ${notes.length} managed note(s), no frontmatter errors.`);
    if (unmanaged.length) console.log(`(${unmanaged.length} unmanaged note(s) without frontmatter, skipped: ${unmanaged.map((n) => n.relPath).join(", ")})`);
  } else {
    console.log(`FAIL — ${errors.length} error(s) across ${notes.length} managed note(s):\n`);
    for (const e of errors) console.log("  - " + e);
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

async function status() {
  const notes = collectNotes(flags.vault).filter((n) => n.frontmatter.supabase_sync);
  const { url, key } = supabaseConfig();
  if (!url || !key) {
    console.log("No Supabase config (SUPABASE_URL / SUPABASE_ANON_KEY). Showing local view only.\n");
    console.log(`${notes.length} note(s) eligible to sync.`);
    return;
  }
  const remote = await sbSelect(url, key, "vault_notes", "note_id,content_hash,sync_status");
  const remoteById = new Map((remote || []).map((r) => [r.note_id, r]));
  let unchanged = 0, changed = 0, missing = 0;
  const rows = [];
  for (const n of notes) {
    const r = remoteById.get(n.frontmatter.id);
    let state;
    if (!r) { state = "new"; missing++; }
    else if (r.content_hash !== n.contentHash) { state = "changed"; changed++; }
    else { state = "in-sync"; unchanged++; }
    rows.push({ note: n.relPath, id: n.frontmatter.id, state });
  }
  if (flags.json) return void console.log(JSON.stringify({ unchanged, changed, missing, rows }, null, 2));
  console.log(`Eligible: ${notes.length}  |  in-sync: ${unchanged}  changed: ${changed}  new: ${missing}\n`);
  for (const r of rows) console.log(`  [${r.state.padEnd(8)}] ${r.note}`);
}

async function sync() {
  const all = collectNotes(flags.vault);
  const eligible = all.filter((n) => n.frontmatter.supabase_sync);

  // validate first — never push malformed notes
  const dupes = findDuplicateIds(all);
  if (dupes.length) {
    console.error("Refusing to sync: duplicate note ids detected:");
    for (const d of dupes) console.error("  - " + d);
    process.exit(1);
  }

  const { url, key } = supabaseConfig();
  const willPush = flags.push;

  if (!willPush) {
    console.log(`DRY-RUN — ${eligible.length} eligible note(s) would be upserted into vault_notes.`);
    console.log("(no writes performed; pass --push to apply)\n");
    for (const n of eligible) {
      console.log(`  would upsert: ${n.frontmatter.type?.padEnd(16)} ${n.relPath}  (hash ${n.contentHash.slice(0, 12)})`);
    }
    logSync("vault_to_db", "dry-run", `${eligible.length} eligible`, "ok");
    return;
  }

  if (!url || !key) {
    console.error("--push requires SUPABASE_URL and a user access token (SUPABASE_ANON_KEY + SUPABASE_ACCESS_TOKEN).");
    console.error("RLS blocks anonymous writes by design. See docs/supabase-setup.md.");
    process.exit(1);
  }
  const userToken = process.env.SUPABASE_ACCESS_TOKEN || key;
  let ok = 0, failed = 0;
  for (const n of eligible) {
    const row = {
      note_id: n.frontmatter.id,
      note_path: n.relPath,
      title: n.frontmatter.title || null,
      note_type: n.frontmatter.type || null,
      content_hash: n.contentHash,
      frontmatter: n.frontmatter,
      last_synced_at: new Date().toISOString(),
      sync_status: "synced",
    };
    try {
      await sbUpsert(url, key, userToken, "vault_notes", row, "owner_id,note_id");
      ok++;
      logSync("vault_to_db", "push", n.relPath, "ok");
    } catch (e) {
      failed++;
      logSync("vault_to_db", "push", n.relPath, "error", e.message);
      console.error(`  FAILED ${n.relPath}: ${e.message}`);
    }
  }
  console.log(`Push complete — ${ok} ok, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

// ── note collection & parsing ────────────────────────────────────────────────
function collectNotes(vaultPath) {
  if (!existsSync(vaultPath)) throw new Error(`vault not found: ${vaultPath}`);
  const notes = [];
  walk(vaultPath, (file) => {
    if (!file.endsWith(".md")) return;
    const raw = readFileSync(file, "utf8");
    const { frontmatter, body, parseError } = parseFrontmatter(raw);
    notes.push({
      path: file,
      relPath: relative(vaultPath, file),
      frontmatter,
      parseError,
      contentHash: createHash("sha256").update(body, "utf8").digest("hex"),
    });
  });
  return notes.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

// Minimal YAML-frontmatter parser for the flat schema Orbit uses:
// scalar `key: value`, block lists (`- item`), and empty values. Not a full
// YAML implementation — deliberately small and predictable.
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw, parseError: "no frontmatter" };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw, parseError: "unterminated frontmatter" };
  const fmText = raw.slice(3, end).replace(/^\n/, "");
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  let parseError = null;
  const lines = fmText.split("\n");
  let curKey = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && curKey) {
      if (!Array.isArray(fm[curKey])) fm[curKey] = [];
      fm[curKey].push(coerce(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (!kv) { parseError = `unparseable line: ${line}`; continue; }
    curKey = kv[1];
    const val = kv[2];
    fm[curKey] = val === "" ? null : coerce(val);
  }
  return { frontmatter: fm, body, parseError };
}

function coerce(v) {
  const s = v.trim().replace(/^["']|["']$/g, "");
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "") return null;
  return s;
}

function findDuplicateIds(notes) {
  const seen = new Map(), dupes = [];
  for (const n of notes) {
    const id = n.frontmatter.id;
    if (!id) continue;
    if (seen.has(id)) dupes.push(`${id} in ${n.relPath} and ${seen.get(id)}`);
    else seen.set(id, n.relPath);
  }
  return dupes;
}

// ── supabase REST helpers (fetch, no SDK) ────────────────────────────────────
function supabaseConfig() {
  return { url: process.env.SUPABASE_URL || null, key: process.env.SUPABASE_ANON_KEY || null };
}

async function sbSelect(url, key, table, columns) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbUpsert(url, key, token, table, row, onConflict) {
  const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

// ── logging ──────────────────────────────────────────────────────────────────
function logSync(direction, phase, detail, status, error = "") {
  try {
    const logDir = join(flags.vault, "System", "Logs");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const line = `${new Date().toISOString()}\t${direction}\t${phase}\t${status}\t${detail}\t${error}\n`;
    appendFileSync(join(logDir, "sync.log"), line);
  } catch { /* logging is best-effort */ }
}

// ── .env.local loader (no dotenv dependency) ─────────────────────────────────
function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const p = join(REPO_ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
