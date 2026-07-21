---
id: 2c84f7d1-6b93-4a25-9e07-5f31a8b0c6e4
title: Mobile Preview Auth Repair
type: app_update
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - vercel
  - preview
  - authentication
  - bug
source: user
supabase_sync: true
---

# Mobile Preview Auth Repair

Update 5.1.1. Sign-in was broken on the deployed Preview. Root cause found,
reproduced, and fixed.

Related: [[Private Mobile Preview]], [[Architecture Notes — Authentication]],
[[Deployment Status and Blockers]]

## The reported errors, exactly

```text
Unexpected token 'T', "The page c"... is not valid JSON
The string did not match the expected pattern.
```

**Both are the same defect**, in two engines' wording. V8 and WebKit describing
`JSON.parse` being handed a sentence rather than JSON.

The sentence was `The page could not be found` — Vercel's own 404 page.

## Root cause

`vercel.json` rewrites `/api/(.*)` to `/api/index`. Update 5.1 added
`cleanUrls: true` so the legal pages could be reached at `/privacy` instead of
`/privacy.html`.

`cleanUrls` generates a 308 redirect matching **any path ending in `index`** —
including the rewrite's own destination:

```text
/api/auth/signin  ->  /api/index  ->  308  ->  /api  ->  no handler  ->  404 page
```

Every API request in the deployed Preview was redirected away before reaching
Orbit's function. Sign-in never ran.

### How it was confirmed, not guessed

- Applied the generated route table to `/api/index` and watched the first rule
  match and rewrite it to `/api`
- Reproduced the message in a browser: `JSON.parse("The page could not be
  found")` returns character-for-character the reported error

### Why nothing caught it

Three independent gaps, all pointing the same way:

- The local dev server does not use `vercel.json` routing at all
- The Update 5.0 artifact verification invoked the built function **directly**,
  bypassing Vercel's router
- The Preview had never been exercised while signed in

Every previous verification tested the function. None tested the **router in
front of it**.

## The second error

Safari was not available here, so rather than assume, the alternatives were
ruled out: there is no `new URL()`, no `atob()`, and no dynamic selector built
from untrusted input anywhere in shipped frontend code. JSON parsing is the only
remaining source of a SyntaxError on that path, and WebKit words it that way.

## Fixes

**Routing.** `cleanUrls` removed. Explicit rewrites for the five public pages,
declared after the `/api` rule so ordering is visible rather than emergent.
Clean URLs still work; the API rewrite survives.

**Parsing.** Independently wrong, and worth fixing regardless. `readApiResponse`
checks content-type first, reads and **discards** non-JSON bodies, and
classifies the failure: `missing-route`, `redirected`, `empty`, `not-json`,
`malformed-json`. Callers get a sentence — "Orbit could not reach the sign-in
service. Please refresh and try again." — never HTML, hosting internals, or a
stack trace.

All four unguarded `.json()` calls now use it, plus the deletion dialog and the
reset page. A test asserts none remain.

## The tests fail on the bug

Verified by restoring `cleanUrls` and re-running: **2 failures**. With the fix:
**0**. A regression test that does not fail on the defect it names is
decoration.

17 new tests: route interception, every non-JSON response shape, the exact
reported failure, same-origin credentials, and auth-route registration.

## What is verified, and what is not

**Verified:** the generated route table has no redirect touching any `/api`
path; the local server answers every auth route with `application/json`,
including its 404; 670 tests pass; the Linux build deployed cleanly.

**NOT verified:** sign-in on the deployed Preview while signed in. The Preview
is protected by Vercel Authentication, and getting past it needs the owner's
Vercel session. Creating an automation bypass token would work but mints a
durable credential making the private Preview reachable by anyone holding it —
not a trade to make without asking.

**This update is not complete until the owner confirms sign-in works on the
phone.**

## Rollback

1. Redeploy the previous Preview
2. `cleanUrls` can be restored only if the `/api` rewrite destination is renamed
   to something not ending in `index`
3. No database change was made; nothing to reverse there
