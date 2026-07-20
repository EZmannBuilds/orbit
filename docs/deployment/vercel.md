# Deploying Orbit Axis to Vercel

Status as of Update 4.0.3: **the repository is technically ready to connect to
Vercel. It has never been deployed, and several owner-controlled blockers remain
open.** Run `npm run deploy:check` for the current, honest list.

This document describes the architecture, the exact dashboard settings, and how
to troubleshoot. It does not authorise a deploy.

---

## 1. Architecture

Orbit has no bundler and no frontend framework. It is a hand-written ES-module
frontend plus a zero-dependency Node backend. On Vercel that maps to the
simplest possible shape:

```
Browser
  │
  ├── /  and  /styles/*.css  and  /app.js      → Vercel CDN, straight from public/
  │                                              (never touches a function)
  │
  └── /api/*                                   → one Node Function (api/index.js)
                                                   │
                                                   ├── lib/server/create-app.js
                                                   │     the shared request handler
                                                   │
                                                   └── hosted Supabase (REST + Auth)
```

Three entry points, one implementation:

| File | Role |
|---|---|
| `lib/server/create-app.js` | Every route. Creates nothing, listens to nothing. |
| `server.js` | Local development. Wraps the handler in `http.createServer` and listens. |
| `api/index.js` | Vercel. Exports the handler as the function's default export. |

Local and deployed Orbit therefore run *the same code*, and cannot drift apart.

### Why the handler is separate from the listener

Importing `lib/server/create-app.js` must be free of side effects: no port
bound, no Supabase call, no Ollama call, no migration, no user created, no
timer started. That is enforced by `test/server-handler.test.js`, which imports
the module in a child process with `listen()`, `fetch()`, and `child_process`
replaced by traps.

The environment guard runs inside `createOrbitApp()` — not at module scope — so
the guarantee holds:

> Every entry point runs the environment guard before binding a port, building
> a service-role client, running a migration, seeding, creating a disposable
> user, or making any database request.

### Frontend routing

The frontend is **hash-routed** (`#home`, `#me`, `#ask`, `#learn`, …). `/` is
the only real document route. There are no server-side deep links, so:

- a missing static file returns a **real 404**, not the app shell
- an unknown `/api/*` path returns a **controlled JSON 404**
- no rewrite sends static assets through the function

Before 4.0.3 a missing asset was answered with `index.html` and status 200,
which hid broken script and stylesheet paths behind a page that looked fine.

---

## 2. Exact Vercel dashboard settings

Set these when creating the project. Every value is deliberate.

| Setting | Value | Why |
|---|---|---|
| **Framework Preset** | `Other` | Orbit is not a framework app. `vercel.json` sets `"framework": null` to match. |
| **Root Directory** | `./` | The app is at the repository root. |
| **Install Command** | `npm ci` | Uses the committed `package-lock.json` exactly. Reproducible. |
| **Build Command** | `npm run build` | Runs `scripts/build.js` — verification only, see below. |
| **Output Directory** | `public` | Static assets. Vercel serves these from the CDN. |
| **Node.js Version** | `22.x` | Matches local development (v22) and satisfies `engines.node >= 20.11`. |
| **Production Branch** | `main` | Do not change this until Preview is healthy and the work is merged. |

`vercel.json` already encodes framework, install, build, output, routing, and
headers, so the dashboard should agree with it rather than fight it.

### What the build does

`npm run build` **verifies**; it does not transform. There is nothing to
compile. It:

- checks that every backend and Vercel entry point exists
- resolves **every** `src`/`href` in `public/index.html` against `public/` and
  fails if one is missing
- checks `.vercelignore` still excludes the vault, local Supabase state, tests,
  and env files
- syntax-checks every shipped module (`node --check`)

It requires no Docker, no Supabase, no Ollama, and no network. It contacts no
database and runs no migration.

---

## 3. Preview workflow

1. Push the deployment branch to GitHub.
2. Vercel builds a Preview Deployment for every push to a non-production branch.
3. The Preview URL is private to the Vercel account unless shared.
4. `main` remains the Production branch and is **not** deployed by this work.

Preview requires an explicitly approved, disposable Supabase project. See
[preview-environment.md](preview-environment.md).

---

## 4. Environment variables

See [environment-variables.md](environment-variables.md) for the complete
inventory: exact names, which environment, public vs server-only, required vs
optional, and who supplies each one.

The short version for a deployment:

- **Required:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORBIT_ENVIRONMENT`
- **Preview also needs:** `ORBIT_PREVIEW_PROJECT_REFS`
- **Never set on a deployment:** `SUPABASE_SERVICE_ROLE_KEY`, and anything
  Ollama-related

---

## 5. Ollama on Vercel

Ollama runs on the owner's own computer at `127.0.0.1:11434`. A Vercel function
has no route to it, and exposing a personal machine to the public internet is
not an acceptable alternative.

Orbit handles this by construction, not by convention. `createLocalLLMProvider()`
is the only place a network-capable Ollama client is built, and it returns an
inert stub whenever the resolved environment forbids a local language provider —
which is every deployment. The stub performs **no network I/O of any kind**.

What that means in practice:

| | Local | Preview / Production |
|---|---|---|
| Ollama network request | yes, when installed | **never attempted** |
| Ask Orbit answers | deterministic engine, optionally reworded by `qwen3:14b` | deterministic engine only |
| Evidence shown | full | full, identical |
| User-visible result | fluent prose | complete, correct, slightly plainer prose |

The deterministic context engine and presenter produce a **complete** answer on
their own — the model is only ever an optional rewording pass over an answer
that already exists. Nothing is missing on a deployment; the wording is less
conversational. No localhost error is ever shown to a user.

Tested by `test/vercel-environment.test.js`, which replaces `globalThis.fetch`
with a trap and asserts that no call is attempted in simulated Preview and
Production.

---

## 6. Serverless constraints Orbit had to address

| Assumption | Status |
|---|---|
| In-memory Ask Orbit history | Supabase is the source of truth. On a deployment the in-memory store is refused outright rather than used as a fallback — see below. |
| Rate-limit / concurrency maps | Kept, and documented as per-instance bookkeeping, not storage. Worst case is a slightly more generous limit across instances. |
| Summary caches | Kept. Bounded, key-based, and fully reconstructable from Supabase + the ephemeris. |
| Startup migrations | None existed, and none were added. Migrations are applied by the owner with the Supabase CLI. |
| Background timers | The model warmup now lives only in `server.js`, so a function never spends invocation time on it. |
| Local filesystem writes | Only the vault and proposal paths, which are development routes and are disabled on a deployment. |
| Long-lived streams | The SSE chat route streams from a Node Function. On a deployment the deterministic path completes immediately, so no long stream is held. `maxDuration` is 30s. |

**Durable storage is mandatory on a deployment.** If Supabase is unusable,
`askStoreFor()` returns a store that refuses every write. The Ask service
already handles a write failure honestly: the answer is still generated and
returned, `persisted` is `false`, and the user is told *"This answer couldn't be
saved to your history."* A serverless instance can vanish between requests, so
writing to memory there would be data loss wearing the costume of success.

---

## 7. Troubleshooting

**The function returns 503 with "Orbit is not configured for this environment yet."**
The environment guard rejected the configuration. The specific reason is in the
Vercel function logs (it is deliberately not sent to the browser, because the
message names hostnames and project references). Common causes: `SUPABASE_URL`
missing, pointed at localhost, or pointed at a hosted project that has not been
approved for Preview.

**Every astrology feature returns 500.**
Almost certainly the Swiss Ephemeris binary. `lib/astro/bin/swetest` is a
compiled **macOS/arm64** executable; a Vercel function is **Linux x86-64** and
cannot run it. `ephemerisCapability()` names this specifically instead of
failing with an opaque `ENOEXEC`. See the blocker list in
[preview-environment.md](preview-environment.md).

**Ask Orbit answers appear but are not saved.**
The hosted Supabase project is missing the Ask Orbit migration. This is
expected until the owner applies it — see
[hosted-supabase-migration.md](hosted-supabase-migration.md). Orbit reports it
honestly rather than pretending to save.

**Sign-in works but the session is lost on the next request.**
Check that the session cookie carries `Secure`. On a deployment Orbit sets it
unconditionally; if it is missing, the request is not being classified as
deployed (check `VERCEL_ENV`).

**A stylesheet or module 404s.**
That is now the correct, visible behaviour for a missing file. Run
`npm run build` locally — it resolves every asset the document references and
fails if one is missing.

---

## 8. Rollback and recovery

Nothing in Update 4.0.3 changes hosted Supabase, so there is no database
rollback to perform.

| To undo | Do this |
|---|---|
| A bad Preview Deployment | Nothing. Preview deployments are per-commit and disposable. Push a fix. |
| A bad Production Deployment | Vercel dashboard → Deployments → pick the last good one → **Promote to Production**. Instant; no rebuild. |
| The Vercel connection entirely | Vercel dashboard → Project Settings → **Delete Project**. The repository is unaffected. |
| The code changes | The work is one commit on `feat/orbit-axis-vercel-deployment-readiness`. It has not been merged into `main`. |
| An applied hosted migration | The Ask Orbit migration ships with a manual rollback block at the bottom of the SQL file. Read it before applying, not after. |

Local development is unaffected by any of the above. `npm run dev:local`
continues to work exactly as it did in Update 4.0.2.
