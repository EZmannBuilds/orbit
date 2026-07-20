# Vercel Deployment Readiness (Update 4.0.3)

> **Status correction (Update 4.0.4).** This was originally reported as making
> the repository "deployment ready". That overstated it — real blockers
> remained, one of them fatal: the Swiss Ephemeris binary was macOS-only and
> could not run on Vercel. Accurate status: **implementation complete locally,
> Preview blocked.** The fatal blocker was resolved by Update 4.0.4
> (`07 Orbit App/Updates/Orbit Core Portability.md`). Live status lives in
> `07 Orbit App/Release Notes/Deployment Status and Blockers.md`.

Branch: `feat/orbit-axis-vercel-deployment-readiness`
Base: `3bfe4c2` (Update 4.0.2)
Date: 2026-07-20

Update 4.0.2 made it structurally impossible to reach the production database by
accident from a developer's machine. This update asks the next question: what
would it take to run Orbit somewhere that is *not* a developer's machine, and
what is honestly still in the way?

**Nothing was deployed.** Nothing was pushed, merged, or migrated remotely. The
hosted Supabase project was never contacted. This branch is *ready to connect*
to Vercel; it has not been connected.

## The shape of the adaptation

Orbit has no bundler and no frontend framework, and it stays that way. Migrating
to Next.js purely to deploy would have been a rewrite disguised as a
configuration change. The smallest correct shape was to separate *handling a
request* from *listening on a port*:

```text
lib/server/create-app.js   every route; binds nothing, calls nothing
server.js                  local: wraps the handler, listens on a port
api/index.js               Vercel: exports the same handler as a Node Function
```

Local and deployed Orbit now run the same code and cannot drift apart.

Static delivery goes straight from Vercel's CDN out of `public/`; only `/api/*`
reaches the function. The frontend is hash-routed (`#home`, `#ask`, …), so `/`
is the only document route and no rewrite is needed for deep links.

### Import safety is a tested contract

Importing the handler must not bind a port, contact Supabase or Ollama, run a
migration, create a user, seed data, or start a timer. That is checked in a
child process with `listen()`, `fetch()`, and `child_process` replaced by traps —
not asserted in prose. The environment guard therefore runs inside
`createOrbitApp()` rather than at module scope, which preserves the 4.0.2 rule:
every entry point runs the guard before anything dangerous happens.

One consequence worth noting: `lib/llm.js` exported `OLLAMA_MODEL` as a
module-level constant, which read `.env.local` from disk the moment anything
imported it. It is now a function.

## Environment resolution learned about Vercel

The 4.0.2 resolver was extended rather than replaced — a competing resolver was
explicitly avoided. It now recognises `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, and
the Git metadata, with this precedence:

`ORBIT_ENVIRONMENT` → test detection → `VERCEL_ENV` → local

Test detection sits *above* `VERCEL_ENV` so stray Vercel variables in a shell can
never reclassify a test run as a deployment. `VERCEL_URL` alone does not mean
"deployed" — it can be echoed into any terminal; `VERCEL=1` is required.
`vercel dev` reports `development` and runs on the owner's own machine, so it
maps to `local` and keeps Ollama.

A new derived flag, `isDeployed`, is true only for a real Vercel
preview/production function. **Every development affordance is denied when it is
set**, independently of the environment name. So a mis-set
`ORBIT_ENVIRONMENT=local` on a real Preview deployment cannot re-enable
disposable users, seeds, migrations, dev routes, or the local model. A test
covers exactly that case.

New refusals: a deployment pointed at localhost, a deployment with no database,
a deployment missing the anon key, and a Vercel process with no usable
`VERCEL_ENV` (which fails rather than guessing).

## Ollama is unreachable by construction

Vercel cannot reach `127.0.0.1:11434` on the owner's Mac, and exposing a personal
computer to the internet is not an acceptable alternative.

`createLocalLLMProvider()` is the only place a network-capable Ollama client is
built, so it is the only place that needed to change. When the environment
forbids a local language provider it returns an inert stub that performs no
network I/O at all. A test replaces `globalThis.fetch` with a trap and asserts
that health, models, generate, warmup, and streamChat all complete in simulated
Preview and Production **without a single attempted call**.

What a user notices: nothing is missing. The deterministic context engine and
presenter already produce a complete, evidence-backed answer — the model was
only ever an optional rewording pass. Deployed answers are slightly plainer
prose with identical evidence. No localhost error ever reaches a user.

## Memory is not storage on a serverless platform

The in-memory Ask store was a reasonable local fallback. On Vercel it is data
loss wearing the costume of success, because an instance can vanish between two
requests.

When the environment requires durable storage and Supabase is not usable,
`askStoreFor()` now returns a store that refuses every write. The Ask service
already handled a write failure honestly, so the visible result is the correct
one: the answer still generates, `persisted` is `false`, and the user is told
*"This answer couldn't be saved to your history."* Reads return empty, because
there genuinely is no history.

The rate-limit and concurrency maps were kept and documented as per-instance
bookkeeping rather than storage — the worst case is a slightly more generous
limit across instances. The model warmup moved into `server.js` only, so a
function never spends invocation time on it.

## A missing asset is now a 404

`serveStatic` previously answered *any* unresolvable path with `index.html` and
status 200. Since Orbit is hash-routed there was never a deep link that needed
it, and the behaviour actively hid broken script and stylesheet paths behind a
page that looked fine. Missing files now return a real 404, and `npm run build`
resolves every `src`/`href` in `index.html` against `public/` so a broken
reference fails the build instead of the browser.

## Cookies behind a proxy

The session cookie carries a Supabase access token but had no `Secure` flag.
Vercel terminates TLS at the edge, so `req.socket.encrypted` is false inside the
function and would never have set it.

`x-forwarded-proto` is now trusted **only** when the resolved environment says
this really is a Vercel deployment — anyone can send that header to a local
server. On a deployment `Secure` is set unconditionally, so a stripped header
cannot downgrade the cookie. Refresh and expiry re-issue with the same
attributes. Local HTTP deliberately stays non-Secure, because a Secure cookie
over `http://localhost` breaks local sign-in.

## The finding that matters most

**The Swiss Ephemeris binary cannot run on Vercel.**

`lib/astro/bin/swetest` is a compiled **Mach-O 64-bit arm64** executable — built
for Apple Silicon macOS, and committed to the repository. Vercel Functions run
**Linux x86-64**. Every astrology feature shells out to it: natal charts,
current sky, daily fortunes, and the evidence behind every Ask Orbit answer.

Before this update that would have surfaced as an opaque `ENOEXEC` and a 500 on
every astrology request. `ephemerisCapability()` now names it specifically, and
`npm run deploy:check` reports it *before* a deploy rather than after.

It was not fixed here. Each option — ship a linux-x64 binary, move to a
JavaScript/WASM ephemeris, or call a separate service — is a real product
decision with accuracy and licensing consequences, and it is the owner's to
make.

Related and still open: **Swiss Ephemeris licensing is unresolved and
undocumented.** It is dual-licensed (AGPL or a paid commercial licence) and both
paths carry obligations for a publicly reachable deployment. It is recorded as
unresolved because it is; it must not be called settled without documentation.

## `npm run deploy:check`

A read-only command that contacts nothing, prints no secret, and exits non-zero
on a real blocker. It grades findings `BLOCKER` / `WARNING` / `INFORMATIONAL`
and covers environment and Vercel classification, database target, required
variable *names*, durable-storage rules, handler importability, Vercel wiring,
the ephemeris platform check, Swiss Ephemeris licensing, hosted migration
status, and git push state.

It simulates Preview and Production resolution to prove the safety properties
hold, without needing a deployment to exist.

Current output: **4 blockers, 4 warnings** — branch not pushed, no approved
Preview Supabase project, hosted Ask Orbit migration unapplied, ephemeris
architecture mismatch.

## Verification

- **358 automated tests pass** via `npm run test:local` (305 before this update;
  53 new). Zero failures, zero skipped.
- `npm run lint`, `npm run typecheck`, `npm run build`, and
  `npm run orbit:vault:validate` all pass. `git diff --check` is clean.
- Browser verification at 375 / 768 / 1280 against **local** Supabase with live
  `qwen3:14b`: sign-up, chart creation via birthplace search, Home with Current
  Sky and fortune, an Ask Orbit answer with expandable evidence, history
  surviving a full page reload, history drawer focus trap with Escape restoring
  focus, and sign-out clearing the session. Zero console errors, zero
  cross-origin requests, send target 44px, no horizontal overflow at any width.
- Secret scan across all tracked files: four hits, all benign — the published
  Supabase local-demo anon key (documented as not secret), a comment containing
  the word `service_role`, and a test asserting tokens are *not* leaked.

### What was NOT verified

- **`npx vercel build` did not run.** It requires linking the repository to a
  Vercel project and authenticating, which would touch account state and pull
  environment values. That is an owner action. All safe local equivalents were
  run instead. The Vercel build is unverified — it must not be described as
  passing.
- No Preview or Production deployment exists, so all deployed behaviour is
  **simulated**: proven by resolver and guard tests, not by a live deployment.
- Hosted Supabase was never contacted. Its schema, RLS, indexes, and grants are
  unverified by design.
- The ephemeris failure on Linux is reasoned from the binary's architecture, not
  observed on Vercel.

## Documentation

`docs/deployment/` — `vercel.md` (architecture, exact dashboard settings,
troubleshooting, rollback), `environment-variables.md` (every variable, derived
from the source), `preview-environment.md` (blockers, security checklist,
Preview setup), `hosted-supabase-migration.md` (the pending migration, with
verification and rollback), `auth-redirects.md`.

New tracked template: `.env.preview.example`, placeholders only. `.env.local`
was not modified, moved, or rotated.

## Relationship to Orbit Intelligence

This update creates the production *foundation* that [[Orbit Axis Intelligence
Current Plan]] will eventually need — a deployable surface, environment
separation, and durable-storage discipline. It implements **none** of Orbit
Researcher, Orbit Knowledge ingestion, Orbit Studio, or Orbit Sky, and it does
not select a hosted inference provider.

## Known limitations

- Preview mode is still exercised only with a mocked project reference. There is
  no approved Preview Supabase project, so real preview behaviour is unproven.
- Production behaviour is verified by refusal paths only, by design.
- Streaming chat (`/api/axis/chat/stream`) is untested on Vercel. On a
  deployment the deterministic path returns immediately, so no long stream is
  held, but that reasoning is unverified against a real function.
- The canonical Obsidian vault at `/Users/mr.mann/Projects/Orbit vault` was not
  written to — it is outside the permitted working directory for this update.
  This note lives in the repository's tracked `07 Orbit App/` mirror and should
  be synced into the vault by the owner.
