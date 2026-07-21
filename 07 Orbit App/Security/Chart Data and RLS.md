---
id: a9ca20a6-7c1b-442e-9319-87c5c3edd96e
title: Chart Data and RLS
type: technical_decision
status: active
created_at: 2026-07-13T00:00:00-05:00
updated_at: 2026-07-17T00:00:00-05:00
tags:
  - orbit
  - security
  - supabase
source: user
supabase_sync: true
supabase_id:
---

# Chart Data and RLS

Orbit Axis chart and fortune data is user-owned. Supabase Auth is the identity
source, and RLS is the database boundary.

## Rules

- Do not trust `owner_id` from the browser.
- Do not store chart/account/fortune data in the vault.
- Use authenticated Supabase sessions for persisted account data.
- Keep stateless previews separate from persisted chart and fortune routes.
- Use RLS policies that combine `TO authenticated` with owner predicates.
- Use `WITH CHECK` on update policies so rows cannot be reassigned to another
  user.

## Current hardening

The pending accounts/saved-charts migration adds a database trigger so
`profiles.active_birth_profile_id` must belong to `profiles.user_id`. It also
tightens `daily_fortunes` insert/update policies so the fortune owner and parent
birth profile owner must both match `auth.uid()`.

## Live validation

Validated on 2026-07-13:

- RLS is enabled on user-owned chart, profile, calculation, fortune, LLM, and
  vault-edit tables inspected during the pass.
- Anonymous chart reads returned no rows and anonymous writes were blocked.
- Cross-user chart read, update, delete, and active-chart activation attempts
  were rejected.
- Cross-user `chart_calculations` inserts were rejected.
- Cross-user `daily_fortunes` inserts were rejected.
- The active-chart ownership trigger blocked attempts to set an active chart
  owned by another account.
- Temporary development accounts and their test chart data were deleted after
  validation.
- Security advisor warning remaining: leaked-password protection is disabled in
  Supabase Auth. This is accepted as a current-plan limitation, not a
  release-blocking failure.

## Auth security posture

- Normal account creation and sign-in remain functional.
- Orbit's strong password requirements remain enabled.
- Email verification remains enabled.
- RLS and cross-user isolation passed live validation.
- Leaked-password screening should be reconsidered before a larger public
  launch or plan upgrade.

## Prediction Engine scope (planned)

The rules above extend unchanged to the planned [[Orbit Prediction Engine]].
Reading records, reading factors, preferences, feedback, and optional life-event
journaling are all signed-in user data and must be owner-scoped under this same
model from their first migration — not retrofitted. Local caches used for
responsiveness must not become an unprotected second source of truth. See
[[Prediction Engine Data Ownership]] · [[Prediction Engine Safety and Privacy]].

## Related

- [[Supabase Auth and Session Architecture]]
- [[Saved Chart Persistence]]
- [[Obsidian and Supabase Data Boundary]]
- [[Orbit Prediction Engine]]

## Verified against the hosted project — 2026-07-21 (Update 5.0, Session 4)

RLS had never been exercised against a real database before this. Unit tests run
against no database at all, so a policy could have been syntactically valid,
present in the schema, and still wrong.

`scripts/rls-check.js` now signs in as two real users and attempts every crossing
that must fail. **18/18 passed** against the hosted project:

- User A cannot read, update, delete, or activate user B's chart
- B's chart confirmed still present and unmodified afterwards
- A cannot create a chart owned by B — ownership cannot be forged on insert
- B cannot read A's Ask Orbit conversation
- Anonymous callers get no charts and no readings, and cannot write
- A tampered token is refused

Disposable users are deleted afterwards and the cleanup is verified, not assumed.
The script refuses to run until the caller names the project, because it writes
to the same database real accounts live in.

**A detail worth keeping:** the cross-user read test asserts an *empty result*,
not a 403. RLS makes another user's row invisible rather than forbidden — that
is the design. A test asserting 403 would fail against a perfectly secure
database, and "fixing" it would mean weakening what is being tested.

Newly covered this session: `ask_conversations` and `ask_messages`, whose RLS
policies were applied to the hosted project on the same day.

See [[Architecture Notes — Supabase Data Ownership]] and
[[Architecture Notes — Authentication]].
