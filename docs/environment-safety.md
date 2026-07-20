# Environment safety and database targets

Orbit talks to a database. This guide explains how it decides **which** database,
and how it stops you reaching the wrong one by accident.

## Why this exists

Update 4.0.1 found that `.env.local` points at the **hosted production**
Supabase project. That meant an ordinary `npm start` — or a test run, a
migration, or a script that creates test users — could connect a development
session straight to real user data. Nothing bad happened, but safety depended
entirely on a developer remembering to override environment variables in every
terminal. Update 4.0.2 replaces that with guards the computer enforces.

## Why local and production databases must be separated

The production database holds real people's accounts, birth charts, and Ask
Orbit conversations. A local database is disposable: you can wipe it, fill it
with nonsense, and start again. Keeping them apart means an experiment, a broken
test, or a bad migration can never damage something you cannot get back.

## What an environment variable is

A named value handed to a program when it starts, kept outside the code so the
same code can run in different places. `SUPABASE_URL` is an environment
variable: it tells Orbit which database to use. Change it and Orbit talks to a
different database — which is exactly why it needs guarding.

Orbit reads them from your shell first, then fills gaps from `.env.local`.
**Values already set in your shell win**, which is how `npm run dev:local`
pins the local database regardless of what `.env.local` says.

## What the service-role key can do, and why it stays server-only

`SUPABASE_ANON_KEY` is safe for browsers. It is public by design; row-level
security is what actually protects the data, restricting every row to its owner.

`SUPABASE_SERVICE_ROLE_KEY` **bypasses row-level security entirely**. Anyone
holding it can read and modify every user's data. It must never be sent to a
browser, committed, or pasted into a client-side file. Ordinary local
development does not need it — `npm run dev:local` deliberately unsets it.

## The four environments

Set with `ORBIT_ENVIRONMENT`. Under `node --test`, test mode is detected
automatically.

| Environment | Database it must use | Disposable users | Local migrations | Notes |
| --- | --- | --- | --- | --- |
| `local` | a database on this machine | yes | yes | the default when nothing is set |
| `test` | a database on this machine | yes | yes | auto-detected during `node --test` |
| `preview` | an **explicitly approved** hosted project | no | no | never an arbitrary hosted project |
| `production` | the hosted project (never localhost) | no | no | development helpers are off |

`NODE_ENV` alone is deliberately not trusted: it says nothing about which
database is configured, which is the actual risk.

## How a database target is classified

`lib/env/known-targets.js` is the single place that names known targets, and
`classifyDatabaseTarget()` turns a URL into one of:

| Target | Meaning |
| --- | --- |
| `local` | `127.0.0.1`, `localhost`, or `::1` |
| `production` | the known hosted production project reference |
| `preview` | a hosted project explicitly approved as disposable |
| `unknown` | any other hosted project — **never assumed safe** |
| `missing` / `invalid` | no URL, or one that cannot be parsed |

Only public identifiers are ever used or logged: hostname, project reference,
environment name. Never a key, token, or credential-bearing URL. A look-alike
host such as `<ref>.supabase.co.example.com` is not read as a Supabase project.

## How to tell which database Orbit is using

Two ways. The startup banner:

```text
Orbit Axis development server
Environment: local
Database: local Supabase (127.0.0.1)
Ask history: persistent
Ollama: available (qwen3:14b)
```

Or ask directly, without starting anything:

```bash
npm run env:check
```

If a session is ever connected to production, the banner says so in words —
never colour alone.

## The commands

```bash
# Start the local database (Docker). Orbit uses the 553xx port range because
# another project occupies the standard 543xx range.
npm run supabase:start:orbit      # or: supabase start
npm run supabase:status:orbit

# See which environment and database Orbit would use. Changes nothing.
npm run env:check
npm run env:check:production      # check a production configuration

# Run Orbit locally, pinned to the local database.
npm run dev:local

# Run the tests against the local database.
npm run test:local

# Apply pending migrations to the LOCAL database only.
npm run supabase:migrate:local

# Stop the local database when you are done.
npm run supabase:stop:orbit       # or: supabase stop
```

`npm start` and `npm test` still exist and are unchanged, but they now refuse to
run if the configuration points at production, and tell you what to run instead.

## What to do when the safety guard blocks startup

You will see something like:

```text
Orbit stopped before startup because local development is configured to use the
hosted production database.

Nothing was read from or written to that database.
```

This is working correctly. It almost always means `.env.local` holds the hosted
project URL. Nothing was read or written. Do this:

```bash
supabase start
npm run env:check
npm run dev:local
```

`npm run dev:local` pins the local database for that run, so you do **not** need
to edit `.env.local` to develop safely.

## Guarded operations

These refuse to run against production, and say so without changing anything:

| Operation | Guard |
| --- | --- |
| Server startup | `assertStartupSafe()` — before the port is bound |
| Applying migrations | `assertLocalDatabaseTarget()` — local only |
| The test suite | `assertNonProductionTarget()` — runs as `pretest` |
| Database integration tests | loopback check + classifier, skips without a local stack |
| Creating disposable users | `assertDisposableUserOperationsAllowed()` — local only |
| Pushing vault notes (`orbit:vault:push`) | `assertNonProductionTarget()` |
| Service-role use | `assertServiceRoleAllowed()` |

Read-only inspection (`env:check`, `orbit:vault:status`) stays separate from
anything that writes.

## Safe migration workflow

```bash
supabase start
npm run env:check                 # confirm: Database: local Supabase
npm run supabase:migrate:local    # applies pending migrations locally
```

The command refuses any hosted target. Applying a migration to the hosted
project is **not** automated and remains an explicit owner decision — see
[`ask-orbit-local-setup.md`](ask-orbit-local-setup.md).

## Safe integration-test and disposable-user workflow

Database integration tests only run against a loopback host and skip cleanly
when no local stack is running. Disposable users use synthetic addresses on the
reserved `example.test` domain with generated passwords, and synthetic birth
data — never a real person's details.

```bash
supabase start
npm run supabase:migrate:local
npm run test:local
```

## Environment files

| File | Tracked | Purpose |
| --- | --- | --- |
| `.env.example` | yes | general template, placeholders only |
| `.env.local.example` | yes | local development template |
| `.env.production.example` | yes | production template, placeholders only |
| `.env.local` | **no** (gitignored) | your real local values |

You usually do not need `.env.local` at all for local work — `npm run dev:local`
supplies the local database itself, reading the port from the tracked
`supabase/config.toml`.

> **Owner action, not automated:** the existing `.env.local` still points at the
> hosted project and holds a service-role key. Update 4.0.2 deliberately did not
> move, edit, or delete it. If you want `npm start` to work without overrides,
> change its `SUPABASE_URL` to the local stack yourself and remove the
> service-role key. Until then the guard simply blocks unsafe startup.

## Actions that still require explicit owner permission

- Applying any migration to the hosted project.
- Pointing `preview` at a hosted project (add its ref to
  `ORBIT_PREVIEW_PROJECT_REFS` only after confirming it is disposable).
- Rotating any credential.
- Deploying, or changing hosted authentication settings.

## Troubleshooting

**"local development is configured to use the hosted production database"** —
working as intended. Use `npm run dev:local`.

**"is configured to use an unrecognised hosted database"** — a hosted project
Orbit does not know. It is not assumed safe. Use a local database, or approve
the project explicitly.

**`npm test` refuses to run** — your configuration points at production. Use
`npm run test:local`, which pins the local database.

**`supabase start` says a port is taken** — another project's stack is using it.
Orbit's ports live in `supabase/config.toml` (553xx range).

**Integration tests all skip** — the local stack isn't running, or migrations
aren't applied. Run `supabase start` then `npm run supabase:migrate:local`.
