---
id: 7d3b8c26-1f45-4e90-a2b7-5c81e4f0d739
title: Stable Production Domain
type: app_update
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - vercel
  - production
  - supabase
  - deployment
source: user
supabase_sync: true
---

# Stable Production Domain

Update 5.1.2. Orbit Axis is live at a stable URL and signs in against the hosted
Supabase project.

```text
https://orbit-axis-omega.vercel.app
```

Related: [[Mobile Preview Auth Repair]], [[Private Mobile Preview]],
[[Architecture Notes — Supabase Data Ownership]], [[Deployment Status and Blockers]]

## What was wrong

Omega returned:

```json
{"ok": false, "error": "Orbit is not configured for this environment yet."}
```

That message was Orbit's own JSON, which already proved the domain reached the
function and the Update 5.1.1 routing repair held. Two separate causes sat
behind it:

**1. Production shared-database approval did not exist.** The guard supported an
explicitly approved shared Orbit database in Preview and refused it everywhere
else. Correct when written; a gap once the owner wanted the stable domain live.

**2. The Vercel variables were empty — and I put them there.** Every Preview
variable added in Updates 4.0.5 and 5.1.1 had a stored value of length **zero**.
`vercel env add` reading from piped stdin returned exit status 0 and stored
nothing, and "added ✓" was reported on the strength of that exit code without
checking the effect.

Worse: when first suspected, the "control" used to test it added a probe **the
same broken way**, so both came back empty and the conclusion was that the
tooling hid values rather than that the write had failed. That retraction was
wrong. The Vercel API settled it — CLI-written variables read back as length 0,
API-written ones as encrypted ciphertext.

**The lesson: an exit code is not an outcome.** Variables are now written
through the API, whose effect can be read back and compared.

## Production approval

Production has its **own** variables, deliberately not shared with Preview:

```text
ORBIT_ENVIRONMENT=production
ORBIT_PRODUCTION_DATABASE_MODE=shared-orbit
ORBIT_PRODUCTION_PROJECT_REFS=<the Orbit project reference>
SUPABASE_URL
SUPABASE_ANON_KEY
```

Reusing `ORBIT_PREVIEW_PROJECT_REFS` would mean approving a Preview silently
approved Production. A Preview is seen by the owner; Production is seen by
everyone. The two decisions deserve to be made twice.

Fifteen conditions must hold. Vercel's own report of the environment wins over
`ORBIT_ENVIRONMENT` in **both** directions, so a variable cannot lie about where
it is running. Local and test still refuse the shared target outright. A
service-role key or database password disqualifies the deployment entirely.

## Verified on the live domain

- `/api/v1/health` → `status: ok`, database **configured and reachable**,
  authentication **configured and reachable**, engine `linux-x64`
- A real natal chart computed through the deployed Swiss Ephemeris
  (Sun 84.428°, 12 houses, Rising present)
- Sign-in with a disposable account: session cookie **HttpOnly and Secure**,
  session survives a fresh request, sign-out clears it and `/api/charts`
  returns 401 afterwards
- Wrong credentials → readable JSON error, no parser exception
- Saved charts, settings, current sky, and daily fortune all 200 with a chart
- `/api/does-not-exist` → JSON 404, never an HTML page
- Renders correctly at 375px with legal links and the reset affordance

`/api/fortune/today` returns a JSON 404 with code `no_active_chart` for an
account with no chart. That is a designed state, not a defect — confirmed by
creating a chart and watching it return 200.

## Shared database — the standing risk

Local, Preview, and Production all use ONE Supabase project. Anything created,
edited, or deleted on the stable domain is real production data.

- **Account deletion must not be tested casually.** It is permanent.
- A dedicated staging database is required before any outside tester is invited.
  One project for every environment is acceptable while the owner is the only
  user, and stops being acceptable the moment somebody else has an account.

## Still outstanding

**Supabase Site URL is still `http://localhost:3000`.** It could not be changed
here — no management token is available locally, and the setting is not exposed
to the application. Password sign-in already works without it; the Site URL
governs **email links** (confirmation and password reset), which will point at
localhost until changed.

Swiss Ephemeris licensing remains unresolved for a public launch.

## Rollback

1. Reassign Omega to the previous deployment (`vercel alias`), which is retained
2. Remove only the Production variables; Preview configuration stays valid
3. No database change was made — nothing to reverse there
