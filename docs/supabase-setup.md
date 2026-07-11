# Supabase setup

Orbit's structured data lives in Supabase. This is the connect-and-run guide.

## Project

- **Name:** `orbit`
- **Ref:** `mtdrazdastcgiweauwoj`
- **URL:** `https://mtdrazdastcgiweauwoj.supabase.co`
- **Org:** EZmannBuild's · **Region:** us-west-2 · **Postgres:** 17

## Keys and where they go

| Key | Safe in browser? | Where |
| --- | --- | --- |
| Publishable (`sb_publishable_...`) / legacy anon JWT | ✅ yes | `.env.local` → `SUPABASE_ANON_KEY`; ships to client |
| Service role | ❌ **never** | backend env only; bypasses RLS |

Copy `.env.example` → `.env.local` and fill in. `.env.local` is gitignored.
**Never commit real keys. Never put the service-role key in client code.**

```bash
cp .env.example .env.local
# then set SUPABASE_URL and SUPABASE_ANON_KEY
```

Get keys from: Supabase Dashboard → Project Settings → API.

## Schema

Migrations are in `supabase/migrations/`, applied in filename order:

1. `*_core_identity.sql` — trigger fn, `profiles`, `people`
2. `*_astrology.sql` — birth data, charts, transits, celestial events
3. `*_tarot_journal_sync.sql` — tarot, journal/memory, vault sync tables
4. `*_rls_policies.sql` — RLS + policies on all 14 tables
5. `*_harden_function.sql` — pin `search_path` on the trigger fn

Apply them with the Supabase CLI once linked:

```bash
supabase link --project-ref mtdrazdastcgiweauwoj
supabase db push
```

(These were already applied to the live project on 2026-07-11 via the Supabase
MCP tools — see the vault note **System/Migrations/supabase-initial-setup**.)

## Security model

- RLS is enabled on every table.
- User data is scoped to `auth.uid()` via `owner_id` (child tables via the
  parent's `owner_id`).
- `tarot_cards` and `celestial_events` are public read-only reference data.
- Verified: anon can read public reference data, cannot read other users' rows
  (returns empty), and cannot write (401 RLS violation).

## Seeding reference data

`tarot_cards` and `celestial_events` have no write policy, so seeding requires
the **service role** (backend only). Do it from a trusted server or the SQL
editor — never from the client.
