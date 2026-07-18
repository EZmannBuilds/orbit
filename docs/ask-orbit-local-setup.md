# Ask Orbit — local setup, storage, and troubleshooting

A beginner-friendly walkthrough for running Ask Orbit locally with **persistent**
conversation history and (optionally) a local language model.

Nothing here needs real credentials, and none of it touches the hosted project.

## Why a database migration is required

Ask Orbit stores each answer's **evidence**, question type, birth-time
reliability, engine version, and the chart it used. That is what makes
"Why Orbit Said This" reproducible later, and what lets you reopen a
conversation after restarting the app. Those rows live in two tables —
`ask_conversations` and `ask_messages` — created by
`supabase/migrations/20260717120000_ask_orbit_conversations.sql`.

Until that migration is applied, Ask Orbit still works, but history falls back to
memory and disappears when the server stops. The app tells you when that is the
case; it never pretends the history is permanent.

## Run it locally, in order

```bash
cd /Users/mr.mann/Projects/orbit

# 1. Prerequisites (Docker must be running for the local database).
docker info                 # should print a server version
supabase --version          # Supabase CLI
ollama list                 # optional — only needed for nicer wording

# 2. Start the LOCAL database stack. This never touches a hosted project.
supabase start

# 3. Apply any pending migrations to the LOCAL database (non-destructive).
supabase migration up --local
supabase migration list --local   # every row should show as applied

# 4. Point the app at the LOCAL stack for this shell only, then run it.
#    `supabase start` prints these values; they are standard local dev keys.
export SUPABASE_URL="http://127.0.0.1:55321"
export SUPABASE_ANON_KEY="<ANON_KEY printed by supabase start>"
npm start
```

Open <http://localhost:3001> (or whatever `PORT` you set), create an account, add
a chart, then open **Ask Orbit**.

> **Important:** `.env.local` points at the hosted project. The `export` lines
> above override it for the current shell only. If you skip them, the app talks
> to the hosted database. Do not edit `.env.local` to "fix" this unless you
> intend to change the default for everyone.

### Ports

This project's local stack is configured for **553xx** (API `55321`, database
`55322`, Studio `55323`) instead of the Supabase default `543xx`, so it can run
alongside another project's local stack without a port clash.

## How to safely create a disposable test account

Use an obviously fake address on a reserved test domain and a generated
password. Never use a real personal password.

```bash
# Against your LOCAL server only.
curl -s -X POST http://localhost:3001/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"test-'"$RANDOM"'@example.test",
       "password":"Synthetic-Passw0rd-'"$RANDOM"'",
       "confirm_password":"Synthetic-Passw0rd-'"$RANDOM"'"}'
```

Use synthetic birth data for test charts (for example `1990-06-15`, `14:30`,
lat `40.7128`, lon `-74.006`). Never paste someone's real birth details into a
test account.

## How to confirm you are using persistent storage

Signed in, call the Ask Orbit status endpoint:

```bash
curl -s http://localhost:3001/api/ask/suggestions -b cookies.txt | \
  python3 -m json.tool | grep -A4 '"storage"'
```

- `"mode": "persistent"` → conversations are in the database and survive a
  restart.
- `"mode": "session"` → in-memory only; history clears when the server stops, and
  Ask Orbit shows a plain-language notice saying so.

The honest check is to restart the server, sign back in, and reopen the
conversation from **History**. If it is still there, storage is persistent.

## What happens when the database is unavailable

- You can still ask questions and get complete answers.
- An answer that could not be saved says so directly: *"This answer couldn't be
  saved to your history."* It is never silently dropped or falsely reported as
  saved.
- A failed answer stays visible and marked as failed, so your question is never
  lost. Retrying reuses the same conversation instead of duplicating it.

## What Ollama changes (and what works without it)

Ollama is **optional** and only affects wording.

```bash
ollama list                       # is a model installed?
export ORBIT_LOCAL_MODEL=qwen3:14b
export ORBIT_ASK_USE_MODEL=true   # set to "false" to force the built-in formatter
```

| | With Ollama | Without Ollama |
| --- | --- | --- |
| Answer produced | yes | yes |
| Evidence shown | identical | identical |
| Astrology calculated by | Orbit's engine | Orbit's engine |
| Wording | model prose | Orbit's built-in formatter |

The model receives only the structured answer plan and the already-selected
evidence — never a raw chart dump, an auth token, or Supabase configuration. Its
output is validated before display: markup, code fences, JSON, and empty or
runaway responses are rejected and the built-in wording is used instead. The
model can never add, remove, or alter a piece of evidence.

## How ownership protection works

Every Ask Orbit row carries an `owner_id`, and row-level security restricts every
read and write to `owner_id = auth.uid()`. The server resolves your active chart
from your own session — a chart id supplied by a client is never trusted. In
practice this means another signed-in user cannot read, edit, or delete your
conversations even if they know the conversation id, and cannot create rows that
claim to be yours.

## Running the tests

```bash
npm run lint
npm run typecheck
npm test            # unit tests; database + live-model tests self-skip
npm run build
```

The suite is layered, and each layer skips cleanly when its dependency is absent:

| Layer | File | Needs |
| --- | --- | --- |
| Unit | `test/ask-orbit.test.js`, `test/ask-storage-fallback.test.js` | nothing |
| Provider boundary | `test/ask-provider.test.js` | nothing (live case skips without Ollama) |
| Migration/RLS static | `test/ask-migration.test.js` | nothing |
| Real database + RLS | `test/ask-supabase-integration.test.js` | local Supabase |

To run the database integration tests, start the stack first (steps 2–3 above).
They refuse to run against anything that is not a loopback host, so they cannot
touch a hosted project.

## Troubleshooting

**`supabase start` says "already running" but nothing works.**
Stale containers. `supabase stop` then `supabase start`. This is project-scoped
and will not disturb another project's stack.

**Port already allocated.**
Another local Supabase stack owns those ports. This project uses 553xx; if that
still clashes, change the ports in `supabase/config.toml`.

**Ask Orbit says "Sign in to ask Orbit" even though I signed in.**
Fixed in Update 4.0.1 — gate states re-resolve on every visit. If you see it on
an older build, reload the page.

**Answers appear but History is empty after a restart.**
You are in `session` mode. Check `storage.mode` (above); usually the migration
hasn't been applied, or the app is not pointed at the local stack.

**Answers work but always sound the same / plainer than expected.**
The built-in formatter is being used. Check `ollama list`, that
`ORBIT_LOCAL_MODEL` matches an installed model, and that `ORBIT_ASK_USE_MODEL`
is not `false`. This is a wording difference only — the astrology is identical.

**A model is installed but Ask Orbit still uses the built-in wording.**
The model's output was rejected by validation (markup, JSON, code fence, or an
empty/oversized reply). That is intentional: Orbit prefers its own correct
wording to unpredictable model output.

## Related

- [`ask-orbit.md`](ask-orbit.md) — architecture, data flow, and evidence model
- [`local-llm.md`](local-llm.md) — the Ollama provider in general
- [`supabase-setup.md`](supabase-setup.md) — database configuration
- [`data-boundaries.md`](data-boundaries.md) — what is stored where
