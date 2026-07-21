---
id: 3c8e5f47-9b12-4a63-8d05-6e71f2ba9c48
title: Architecture Notes — Account Deletion
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - privacy
  - security
  - supabase
  - account-deletion
source: user
supabase_sync: true
---

# Architecture Notes — Account Deletion

Permanent, in-app, irreversible. Built in Update 5.0, Session 5.

Related: [[Architecture Notes — Authentication]],
[[Architecture Notes — Supabase Data Ownership]], [[Chart Data and RLS]],
[[Privacy and Data Inventory]], [[Architecture Notes — Versioned API]]

## The deletion inventory

Built from the real schema, not from a guess. Every public table was checked for
a user-linked column and for what happens to its rows when the auth identity is
removed.

**Sixteen tables cascade directly from `auth.users`:** profiles, people,
birth_profiles, daily_fortunes, ask_conversations, ask_messages,
journal_entries, llm_runs, pattern_insights, sync_events, tarot_readings,
transit_events, business_metrics, vault_notes, vault_note_versions,
vault_edit_proposals.

**Four more cascade through a parent:** chart_calculations, chart_settings, and
transit_events via birth_profiles; journal_links via journal_entries;
ask_messages via ask_conversations.

**Not user-owned:** celestial_events and tarot_cards are public reference data.

**No storage:** the project has no storage buckets and no storage objects, so
there is nothing to clean up there.

A query confirmed that **no** public table has an `owner_id`, `user_id`, or
`created_by` column without a cascading foreign key to `auth.users`. That is
what makes the implementation short.

## Deleting the identity IS the deletion

Because the cascade is complete, deletion is one operation: remove the Supabase
Auth identity, and Postgres removes everything else in a single transaction.

This is deliberately not a hand-written list of `delete from …` statements. Such
a list is wrong the first time a table is added and nobody remembers to update
it, and being wrong there means abandoned personal data nobody knows about. The
database already knows the shape of its own data; the application should not
keep a second, worse copy of that knowledge.

## It verifies rather than trusting

"The schema says it cascades" is a claim, and this project has been burned more
than once by claims that were true in a model and false in reality.

After the delete, Orbit counts what remains across all sixteen tables. If
anything survives, the person is told the deletion was **incomplete** rather
than shown a success message. A table that cannot be queried counts as a
survivor, not as clean — treating "I could not check" as "verified empty" would
make the whole step decoration.

The count uses HEAD requests with an exact count, so no row contents are ever
fetched. This runs with the service-role key, and pulling rows back would mean
handling the very data the operation exists to destroy.

## Ordering, and why it matters

1. Validate the typed confirmation — before anything is contacted at all
2. Verify the token and derive the user id from it
3. Revoke every session globally
4. Delete the auth identity (the cascade fires here)
5. Verify no rows survived
6. Clear cookies and local caches

Revocation comes **before** the delete because afterwards there is no identity
left to revoke sessions for, and an already-issued access token would stay valid
until it expired on its own.

A failed revocation does **not** abort the deletion. Deleting the identity
invalidates tokens anyway, and aborting would strand someone who has already been
told their account is going away.

## Partial failure

Supabase Auth deletion and the database cascade are one transaction, but the
surrounding steps are not, so partial failure is designed for rather than hoped
against.

| Stage | Behaviour |
| --- | --- |
| Network failure before delete | "Nothing was removed." Retry is safe |
| Identity delete returns 5xx | Reported as retryable; nothing claimed |
| Identity delete returns 404 | **Success** — a previous attempt got there |
| Verification finds survivors | Reported as incomplete, with a reference |
| Session revocation fails | Deletion continues; reported honestly |

**A 404 is success, not an error.** The caller asked for the account not to
exist, and it does not. Showing an error to someone who has already deleted
their account would be both wrong and alarming.

Every path is idempotent: a retry continues safely rather than duplicating or
corrupting work.

## Identity cannot be forged

The user id comes from the verified token. A `userId` in the request body is not
rejected with a special message — it is **never read at all**, and a test
asserts that by reading the handler source. Deleting someone else's account is
the single worst bug this endpoint could have, so the code never has the id to
misuse.

Both a session cookie and an `Authorization: Bearer` header are accepted, so a
future iOS client needs no contract change.

## Confirmation

The literal string `DELETE`, checked server-side. The interface disables its
button until the typed value matches exactly, but the server does not trust
that — "delete", "Delete", and a missing value are all refused.

Rate limited at 5 requests per minute, against calculation's 30. A legitimate
person deletes their account once.

## Local data

Server-side deletion cannot reach the browser. `oa_birth` in localStorage holds
birth date, time, and coordinates — the most personal thing Orbit stores
anywhere. Deletion clears it, along with `oa_detail`, every `orbit.*` preference,
sessionStorage, and the in-memory reading caches.

Sign-out deliberately does **not** clear it. The person is coming back, and
wiping their cached chart on every sign-out would be hostile.

After deletion the app replaces the history entry so the browser Back button
cannot return to a private view rendered before the account was removed.

## Verified end to end

A disposable account with a chart, a daily reading, and preferences was deleted
through the real interface against the real project. The identity, profile,
birth profile, and fortunes are all gone; re-login fails; refresh stays signed
out; local birth data is cleared. Both real accounts and all their data were
counted before and after and are unchanged.

## Not included

No soft delete, no grace period, no export-before-delete. Version one says
permanent and means it. An export feature is planned separately, and a grace
period would mean retaining the data it claims to have deleted — which the
interface would then be lying about.
