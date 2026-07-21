---
id: 6d3f9a21-47b8-4c05-9e6a-1f82b5d7c093
title: Architecture Notes — Authentication
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - authentication
  - security
  - supabase
source: user
supabase_sync: true
---

# Architecture Notes — Authentication

Email and password only, for version one. No Google, no Sign in with Apple, no
magic links. Completed in Update 5.0, Session 4.

Related: [[Supabase Auth and Session Architecture]],
[[Architecture Notes — Supabase Data Ownership]],
[[Architecture Notes — API Security]], [[Chart Data and RLS]]

## The lifecycle

Sign-up, sign-in, session persistence, token refresh, sign-out, and — added this
session — the full password reset path. Reset was **entirely absent** before:
no endpoint, no page, and no affordance in the interface. An account nobody can
recover is an account that is lost the first time someone forgets a password.

Reset is three steps: request a link, verify the recovery token, set a new
password. Both link shapes Supabase produces are handled — `token_hash` in the
query string and `access_token` in the fragment — because which one arrives
depends on project settings, and a reset that works only on one of them fails
silently for real people.

## Nothing reveals who has an account

Sign-in returns the same message for a wrong password and for an email with no
account: **"Email or password did not match."** Password reset returns the same
message whether or not the address is registered, and upstream failures are
logged server-side rather than surfaced.

This matters more for Orbit than for most products. An account here means
someone has an astrology profile — that is personal in a way a newsletter
signup is not, and an endpoint that confirms "yes, this person has an Orbit
account" is disclosing something real about them.

## Sessions

An `HttpOnly`, `SameSite=Lax`, `Path=/` cookie. `Secure` is added when the
request is genuinely https, and `x-forwarded-proto` is believed **only** in a
verified deployment context — anyone can send that header to a local server.

Near expiry the session is refreshed and the cookie re-issued with the same
attributes, so a refresh never silently downgrades a `Secure` cookie. A refresh
failure clears the cookie and reports expiry rather than leaving a dead session
in place.

No session is issued after a password reset. The person goes back through
sign-in, so a leaked reset link cannot also hand over a logged-in session.

## What is never stored

The recovery token is read from the URL once, held in memory, and stripped from
the address bar with `replaceState`. It is never written to `localStorage` or
`sessionStorage`. A recovery token left in browser history is a live credential
for as long as it stays valid, and browser history outlives the tab.

Passwords appear in exactly one place: the request that sets them. Never in a
log, a URL, storage, a test fixture, or this vault.

## Interface details that are not cosmetic

The submit button disables while a request is in flight. Without it, a double
click fires two sign-ups, and the loser reports that the account the winner just
created already exists — which reads as a bug in the product rather than in the
click. The reset page guards the same way.

The reset page says plainly when it was opened without a link, instead of
showing a form that cannot work.

## Still requires a dashboard setting

Supabase only redirects to allow-listed URLs. Until
`http://localhost:3001/reset-password.html` (and the deployed equivalent) is
added under **Authentication → URL Configuration → Redirect URLs**, the emailed
link will not open the reset page. The code path is complete and tested; this is
the one piece that lives outside the repository.

## Status

Implemented and verified in a browser against the real project: sign-in,
refresh-without-losing-session, sign-out, sign-back-in, and non-enumeration all
confirmed. Password reset is verified up to the dashboard setting above.
