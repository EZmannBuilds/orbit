# Environment Safety and Database Target Guard (Update 4.0.2)

Branch: `feat/orbit-axis-environment-safety`
Date: 2026-07-18

Update 4.0.1 verified Ask Orbit against a local database, but its report ended
with an uncomfortable finding: `.env.local` points at the **hosted production**
project, and the only thing keeping development away from it was a developer
remembering to override environment variables in every terminal. This update
replaces that habit with guards the computer enforces.

## The unsafe configuration

`.env.local` sets `SUPABASE_URL` to the hosted production project and also holds
a service-role key, which bypasses row-level security entirely. Because Orbit
loads `.env.local` automatically, a plain `npm start` — or a test run, a
migration, or a script that creates disposable users — would have connected to
real user data. Nothing was ever written to production, but the protection was
a person's memory, not the code.

## What now prevents it

One module resolves the environment and classifies the database target; every
dangerous path asserts against it before doing anything.

- `lib/env/known-targets.js` — the only place that names known targets (the
  production project reference, local hosts, approved preview refs). A
  look-alike host such as `<ref>.supabase.co.example.com` is never read as a
  Supabase project.
- `lib/env/environment.js` — resolves `local` / `test` / `preview` /
  `production` from an explicit `ORBIT_ENVIRONMENT` (test mode is detected
  automatically under `node --test`), classifies the target as
  `local` / `production` / `preview` / `unknown` / `missing` / `invalid`, and
  derives which development operations are permitted.
- `lib/env/guard.js` — `assertStartupSafe()` plus targeted assertions for
  migrations, seeds, disposable users, and service-role use.

An unrecognised hosted project is never assumed safe just because it is not
production.

### Guards in practice

| Situation | Result |
| --- | --- |
| `npm start` with the current `.env.local` | **stops before binding the port** |
| local mode + local database | starts, prints a status banner |
| test mode + production database | test run refuses to start |
| production mode + localhost | refuses; production must use the hosted project |
| preview mode + unapproved project | refuses until the ref is explicitly approved |
| `supabase:migrate:local` + hosted target | refuses; nothing changed |
| `orbit:vault:push` + production | refuses; nothing changed |

Error messages say what is wrong, confirm that nothing was read or written, and
name the command to run instead. No message contains a key, token, or
credential-bearing URL — a test asserts this.

## Safe commands

```bash
supabase start                    # or: npm run supabase:start:orbit
npm run env:check                 # which environment + database, changes nothing
npm run dev:local                 # Orbit pinned to the local database
npm run test:local                # tests pinned to the local database
npm run supabase:migrate:local    # local migrations only
npm run supabase:stop:orbit
```

`dev:local` reads the local port from the tracked `supabase/config.toml`, so
nobody copies port numbers between terminals, and it unsets the service-role key
because ordinary local development never needs it.

## Status output

Development startup now states the target plainly, in words rather than colour:

```text
Orbit Axis development server
Environment: local
Database: local Supabase (127.0.0.1)
Ask history: persistent
Ollama: available (qwen3:14b)
```

A session connected to production says so explicitly. Production itself logs no
infrastructure detail.

## `.env.local` was not modified

Deliberately. It still contains the owner's real configuration, it remains
gitignored, and no credential was moved, rewritten, or rotated. Unsafe *use* of
it now fails clearly instead. Making `npm start` work without overrides is an
owner decision documented in [[environment-safety]] — it means editing that file
by hand.

## No development UI indicator

Phase Nine's development-only environment indicator was considered and skipped.
Surfacing the environment in the interface would need a new endpoint exposing
infrastructure state, and the guidance was explicit that backend safety matters
more than visual decoration. The startup banner and `npm run env:check` already
answer "which database am I on?" without adding that surface. The existing Ask
Orbit storage notice (Update 4.0.1) still tells users when history is not
persistent.

## Verification

- 305 automated tests pass via `npm run test:local` (274 before this update;
  29 new environment/guard tests plus earlier additions).
- Real processes, not mocks: `npm start` and `npm run env:check` both blocked
  against the production URL; the migration command and vault push both refused
  a hosted target; production mode refused localhost. Port `3021` was never
  bound during the blocked-startup check.
- Ask Orbit regression under `dev:local`: 29/29 end-to-end checks, live
  `qwen3:14b` answer, persistence across a server restart, and browser checks at
  375/768/1280 with zero console errors.

Production was never contacted, no production data was modified, no remote
migration ran, and no credential was rotated.

## Known limitations

- Preview mode has no approved project reference yet, so it is exercised only
  with a mocked reference in tests. That is a mocked check, not a real preview
  deployment.
- Production-mode behavior is verified by refusal paths only. No real production
  connection was made, by design.
- The guard protects paths that go through Orbit's own configuration. A
  developer running `psql` or the Supabase dashboard directly is outside its
  reach.
