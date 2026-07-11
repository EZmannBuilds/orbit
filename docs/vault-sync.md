# Vault ↔ Supabase sync

A conservative, one-way (vault → database), dry-run-by-default sync. The
Obsidian vault stays the human-readable knowledge layer; Supabase stays the
structured application database.

## What belongs where

| Put it in **Markdown (the vault)** | Put it in **Supabase** |
| --- | --- |
| Interpretations, essays, symbolism | Birth data (dates, coords, tz) |
| Journal prose, dream narratives | Journal *records* (typed, queryable) |
| Card meanings written by you | Computed chart data (`chart_calculations`) |
| Product/technical notes, decisions | Transit/celestial *events* |
| Anything you want to link + browse | Tarot *readings* as data; sync state |

Rule of thumb: **prose and meaning → Markdown; facts the app computes on →
Supabase.** The sync tool projects only the structured slice (frontmatter +
content hash) into `vault_notes`; it never dumps whole note bodies into the DB.

## Commands

```bash
npm run orbit:vault:scan       # list notes + parsed metadata
npm run orbit:vault:validate   # validate frontmatter (exit 1 on errors)
npm run orbit:vault:status     # compare vault vs Supabase vault_notes index
npm run orbit:vault:sync       # DRY-RUN: show what would be pushed
npm run orbit:vault:push       # actually push (sync --push)
```

Direct form: `node scripts/vault-sync.js <cmd> [--vault <path>] [--json] [--push]`.
Vault path defaults to `../Orbit vault`, override with `--vault` or
`ORBIT_VAULT_PATH`.

## Safety properties

- **Dry-run by default.** Nothing writes unless you pass `--push`.
- **Validation gate.** `validate` fails on missing `id`/`title`/`type`,
  non-UUID ids, unsupported types, malformed frontmatter, and **duplicate ids**.
- **`sync` refuses** to run if duplicate note ids exist anywhere.
- **Only opt-in notes sync** (`supabase_sync: true`). Templates and
  frontmatter-less notes are skipped.
- **Content hashing** (`sha256` of the body) drives change detection so
  unchanged notes aren't rewritten; this is the basis for conflict detection.
- **Every run logs** to `Orbit vault/System/Logs/sync.log`.

## Pushing requires auth

`vault_notes` is RLS-protected — anonymous writes are blocked by design. To
`--push`, provide an authenticated user token via `SUPABASE_ACCESS_TOKEN`
(a signed-in user's access token). The publishable/anon key alone can read but
not write user-owned rows.

## Frontmatter contract

See the vault note **System/Schema/Orbit Metadata Schema** for the full field
list, supported note types, and the type → table mapping.

## Roadmap

Two-way sync (DB → vault) is intentionally **not** implemented yet. Prove
one-way push with conflict detection first.
