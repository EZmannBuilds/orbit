# Vercel Deployment Foundation (Update 4.0.3)

Branch: `feat/orbit-axis-vercel-deployment-readiness`
Commit: `9b76428`
Date: 2026-07-20

> **Status correction.** This update was originally reported as making the
> repository "deployment ready". That overstated it: real blockers remained, one
> of them fatal. The accurate status is **implementation complete locally,
> Preview blocked**. The fatal blocker — a macOS-only ephemeris binary — was
> resolved afterwards by [[Orbit Core Portability]] (Update 4.0.4). Current
> state: [[Deployment Status and Blockers]].

Nothing was deployed, pushed, merged, or migrated remotely.

## What it built

**Handler separated from listener.** `lib/server/create-app.js` holds every
route and binds nothing. `server.js` is a thin local listener; `api/index.js`
exports the same handler as a Vercel Node Function. Local and deployed Orbit run
the same code and cannot drift apart.

Importing the handler is side-effect free — no port, no Supabase, no Ollama, no
migration, no timer — enforced by a test that imports it in a child process with
`listen()`, `fetch()`, and `child_process` trapped. The environment guard runs
inside `createOrbitApp()`, preserving the Update 4.0.2 rule that every entry
point is guarded before anything dangerous happens.

**Vercel environment classification.** The 4.0.2 resolver was extended, not
replaced, to recognise `VERCEL`, `VERCEL_ENV`, and `VERCEL_URL`. A derived
`isDeployed` flag disables disposable users, seeds, migrations, dev routes, and
the local language provider regardless of environment name — so a mis-set
`ORBIT_ENVIRONMENT` cannot re-enable them on a real deployment. `VERCEL_URL`
alone does not mean deployed; `vercel dev` maps to local.

**Ollama unreachable by construction.** `createLocalLLMProvider()` returns an
inert, no-network stub on any deployment. Ask Orbit answers stay complete
through the deterministic engine — the model was only ever an optional rewording
pass.

**Memory is not storage.** Where durable storage is required and Supabase is
unusable, the Ask store refuses writes. The answer still generates, `persisted`
is false, and the user is told it was not saved — instead of losing it silently
when a serverless instance disappears.

**Secure cookies behind a proxy.** `x-forwarded-proto` is trusted only in a
verified Vercel context; `Secure` is set unconditionally on a deployment so a
stripped header cannot downgrade it.

**Static 404s.** The frontend is hash-routed, so `/` is the only document route.
A missing asset now returns a real 404 instead of the app shell with status 200,
which had been hiding broken asset paths.

**`npm run deploy:check`** — read-only, grades BLOCKER / WARNING /
INFORMATIONAL, exits non-zero on real blockers.

## What it got wrong, corrected later

- Reported as deployment-ready while blockers remained
- Shipped a Vercel config that would not have included the astronomy engine in
  the function bundle
- Left an unexplained `env:check` discrepancy between checkouts
- Updated only the repository documentation mirror, not the canonical vault

All four were repaired in [[Orbit Core Portability]].

## Related

- [[Orbit Core Portability]]
- [[Deployment Status and Blockers]]
- [[Orbit Axis Roadmap]]
