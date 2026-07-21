---
id: b4e17c85-3a29-4d61-8f70-2c95e0da6431
title: Architecture Notes — Supabase Data Ownership
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - supabase
  - security
  - rls
  - privacy
source: user
supabase_sync: true
---

# Architecture Notes — Supabase Data Ownership

How Orbit keeps one person's birth data away from another person's browser.
Verified against the real project in Update 5.0, Session 4.

Related: [[Architecture Notes — Authentication]], [[Chart Data and RLS]],
[[Privacy and Data Inventory]], [[Saved Chart Persistence]]

## One project, on purpose

Local development, preview, and production all use the same Supabase project.
That is the owner's deliberate cost decision, not an oversight, and it has a
consequence that must never be softened: **local development writes to real
production data.**

Update 4.0.2 added a guard that refuses to start local development against the
production database. It was kept. What changed in Session 4 is that it can now
be acknowledged rather than only obeyed:

```
ORBIT_ACKNOWLEDGE_PRODUCTION_DB=<project-ref>
```

It names the project rather than being a boolean. `=true` would survive being
copied into an unrelated checkout pointed at a different database; a project
reference would not match and would fail closed. Startup prints a warning every
single time, because someone returning to a terminal an hour later needs to see
which database they are about to change.

**The guard stopping tests from reaching production has no escape hatch at
all.** A test suite is precisely the thing that creates and deletes rows with
nobody watching.

## Ownership is enforced by the database, not the application

Every user-owned table has RLS enabled with owner-scoped policies. The
application never filters by user id and hopes; the database refuses.

This is the right split because a missed `where owner_id = …` in application
code is a silent, total data leak, whereas RLS fails closed by default.

## Proven, not assumed

`scripts/rls-check.js` signs in as two real users and attempts every crossing
that must fail. Against the hosted project, **18/18 passed**:

- A cannot read, update, delete, or activate B's chart
- B's chart is confirmed still present and unmodified afterwards
- A cannot create a chart owned by B — ownership cannot be forged on insert
- B cannot read A's Ask Orbit conversation
- Anonymous callers get no charts and no readings, and cannot write
- A tampered token is refused

Disposable users are deleted afterwards and the cleanup is **verified**, not
assumed.

### One detail worth remembering

The cross-user read test asserts an **empty result**, not a 403. RLS makes
another user's row invisible rather than forbidden — that is the whole design.
A test asserting 403 would fail against a perfectly secure database, and
"fixing" it would mean weakening the thing being tested.

## The service-role key

Server-only, always. It never reaches a browser bundle, HTML, an API response,
a log, or this vault. It is not prefixed as a public client variable. The RLS
script uses it only to create and delete its own disposable users.

## Migration state, and why the ledger is not the truth

The hosted project carries eight migrations applied from the dashboard with no
corresponding local file. That makes `supabase migration list` unreliable in
both directions: it reported `authenticated_table_grants` as pending when the
grants were in fact present.

**The schema is the source of truth; the ledger is a hint.** Session 4 confirmed
each object by querying for it rather than trusting the list — which also caught
a wrong assumption of my own, that a missing `saved_charts` table was a gap. No
such table exists in any migration; charts live in `birth_profiles`.

## Health reporting

`/api/v1/health` reports `configured` and `reachable` for database and
authentication, and nothing else. No project reference, no URL, no key, no row
counts. It is public, so it says whether things work, never which things.

A database outage does not mark the API "degraded" — calculation is stateless
and keeps working without any database at all.
