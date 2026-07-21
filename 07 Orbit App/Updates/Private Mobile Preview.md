---
id: 7d2b81f4-5e63-49a0-b8c7-1f30a9e254db
title: Private Mobile Preview
type: app_update
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - vercel
  - preview
  - deployment
  - supabase
source: user
supabase_sync: true
---

# Private Mobile Preview

Update 4.0.5. The first Orbit Axis deployment the owner can open from a phone.

Related: [[Architecture Notes — Supabase Data Ownership]],
[[Vercel Deployment Foundation]], [[Deployment Status and Blockers]],
[[Version-One Scope]]

## What was deployed

- Branch `feat/orbit-axis-private-mobile-preview`, commit `3c3f5c8`
- Vercel project `lorehouse-team/orbit-axis`, target **preview**
- Protected by Vercel Authentication — anonymous visitors are redirected to
  Vercel login on every path, including API routes
- **Production was not deployed.** The Production deployment is unchanged.

The branch was based on the current tip rather than the Update 4.0.4.2 commit
the brief named. That commit predates Updates 5.0 and 5.1, so branching there
would have shipped a phone preview without account deletion, password reset,
the versioned API, the legal pages, or the shared-database guard. Confirmed with
the owner before proceeding.

## The shared-database decision

Preview and Production use **one** Supabase project, because a second one is not
currently available. The owner approved this for private Preview testing only.

Shared: auth users, profiles, birth profiles and saved charts, active-chart
history, daily fortunes and reading history, Ask Orbit conversations and
messages, schema and RLS policies.

**Anything done in Preview is real production data.** Destructive testing is
forbidden there, and a dedicated staging database is required before any outside
tester is invited.

### The guard that makes it deliberate

Four values must agree, or the connection is refused:

```text
ORBIT_ENVIRONMENT=preview
ORBIT_PREVIEW_DATABASE_MODE=shared-orbit
ORBIT_PREVIEW_PROJECT_REFS=<the Orbit reference>
SUPABASE_URL whose reference matches that value
```

The mode is matched exactly — a misspelling fails closed. The allow-list must
name the project independently of the URL, so two separately-written values have
to agree rather than the check reading its own answer out of the URL.

Production is refused even with an otherwise perfect configuration, and
`ORBIT_ENVIRONMENT=preview` cannot override what Vercel reports. Local and test
still refuse the shared target outright. A service-role key, or any destructive
helper flag, disqualifies the Preview entirely.

The reclassification changes exactly one answer — whether a Preview may reach
the Orbit database. Disposable users, seeds, local migrations, dev routes, and
the local language provider all stay off.

## The bug the real deployment found

The first Preview build **failed**, and for a reason no local build could show.

`scripts/build.js` required every declared Swiss Ephemeris runtime to be
present. Locally both are. On Vercel's Linux builders the macOS binary is
deliberately excluded by `.vercelignore` — which is correct, and is what keeps a
3.6MB darwin executable out of a Linux function — so the build demanded a file
whose absence was the entire point.

**A correct exclusion looked like a broken build.**

Now exactly two runtimes are required: the one that ships (linux-x64) and the
build machine's own. The second matters: without it a missing local binary would
pass silently while astrology was broken on the developer's machine.

Proven in both directions by running the real build script with `process.platform`
stubbed to linux. The Vercel build log then showed the intended behaviour:

```text
ok  darwin-arm64 Swiss Ephemeris executable is not present on this build machine
    — expected when building for another platform.
ok  Force-included by vercel.json includeFiles: 14 file(s), including the
    linux-x64 executable and the .se1 data.
Build OK
```

This is the third time in this project that executing the real artifact found a
defect a model of it could not.

## deploy:check now reflects reality

It reported the Ask Orbit migration as unapplied unconditionally — it never
contacts hosted, so it could not know, and it was wrong: the migration went in
during Update 5.0. It now reads `docs/deployment/hosted-verification.json`, a
dated record of verification actually performed, and says plainly that this is a
recorded claim rather than a live check.

The shared-Preview approval is emitted as warnings, never as a quiet "ok".

## What was NOT verified

**The deployed Preview has not been exercised while signed in.** It is protected
by Vercel Authentication, and getting past that requires the owner's Vercel
session, which cannot be borrowed. Creating an automation bypass token would
have worked, but it mints a durable credential that makes the Preview reachable
by anyone holding it — trading away the privacy that is the point of a private
Preview. That was left to the owner rather than decided unilaterally.

Verified instead: the build log on the real Linux builder, the packaging of the
linux-x64 runtime and ephemeris data, deployment target `preview`, and that
protection covers every path including API routes.

## Rollback

1. Delete the Preview deployment in Vercel
2. Remove the six branch-scoped Preview variables
3. Remove the Supabase redirect entry once added
4. Stop using the branch

**Do not drop the Ask Orbit tables.** They are additive, in use, and unrelated
to whether a Preview exists.

## Still open

- Supabase redirect allow-list needs the Preview URL — owner action
- Swiss Ephemeris licensing remains unresolved for public launch
- A dedicated staging database before any outside tester
- Production deployment not attempted
