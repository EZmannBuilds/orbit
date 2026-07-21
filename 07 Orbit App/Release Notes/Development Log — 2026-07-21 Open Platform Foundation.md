---
id: 65d7c88a-c6ae-4985-b81a-ae83e501f015
title: Development Log — 2026-07-21 Open Platform Foundation
type: project
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - development-log
  - update-5-0
  - open-source
source: user
supabase_sync: true
---

# Development Log — 2026-07-21 Open Platform Foundation

Update 5.0 is being delivered in sequenced sessions rather than one pass. It is
roughly ten times the size of previous updates, and the previous updates
succeeded by verifying each step rather than attempting everything at once.

## Session 1 — engine extraction

**Delivered:** the engine repository, extracted, parity-proven, licensed,
documented. Built locally; **not published**.

Repository: `/Users/mr.mann/Projects/orbit-axis-engine`, commit `feb0ecf`,
28 files, no remote.

### Decisions taken

| Question | Decision | Why |
| --- | --- | --- |
| Engine language | Plain JS + JSDoc | Orbit is zero-dependency with no build step, which is what makes the verified Linux runtime work. TypeScript would have added a compile pipeline to re-verify from scratch. |
| Publication timing | Build locally, review, then publish | Publishing is permanent and immediately forkable. |
| Account deletion | Implement + test locally only | Real verification means deleting a real user. |
| Pacing | Sequenced sessions | Depth over breadth. |

### Secret scan — the gate for open-sourcing

Exhaustive: all 383 blobs across every ref in the application's history.

- **Zero** high-signal secrets (service-role keys, private keys, `sk-`, `ghp_`,
  AWS keys)
- **Exactly one** JWT-shaped string in the entire history. Decoded, its payload
  is `{"iss":"supabase-demo","role":"anon"}` — the Supabase local-development
  demo key published in Supabase's own docs, valid only against a local stack.
  Not a secret.
- `.env` files: never committed. Vault, proposals, personal data: never
  committed.

**Conclusion: the history is safe to publish.** No rewrite, no credential
rotation.

*Methodology note worth keeping:* the first two scan attempts silently produced
wrong results — a clobbered PATH, then git consuming stdin inside a read loop —
and reported "0 JWTs" when one was known to exist. Caught by validating the
regex against a known positive before trusting a negative. A clean scan result
means nothing unless the scanner is proven to detect.

### Licensing, verified

Fetched the actual `LICENSE` from `aloistr/swisseph` at tag `v2.10.03`. AGPL is
explicitly named as the free option, and choosing it obliges placing the whole
project under AGPL or a compatible licence, with source disclosure for network
use. Both repositories are therefore AGPL-3.0-or-later. See
[[Swiss Ephemeris Integration]].

## Session 2 — engine integration

**Delivered:** the application now consumes the engine as a package. Commits
`ed5d415` (engine) and `7b614ba` (application).

- Vendored at `vendor/orbit-axis-engine`, depended on via relative
  `file:vendor/orbit-axis-engine` — reproducible, no absolute path, and it
  physically ships the ephemeris artefacts that import tracing cannot see.
- `lib/astro/*` became thin re-exports; duplicated binaries and `.se1` data
  **deleted** from the application.
- Drift detection (`npm run engine:check`) plus a test, because vendoring's one
  real cost is two copies silently disagreeing.
- Deployment tooling, `vercel.json`, and `.vercelignore` all repointed.

### The defect that justified the whole approach

The scoped package name `@ezmannbuilds/orbit-axis-engine` put an `@` into the
resolved ephemeris path. The argument allow-list rejected it, so **every
calculation failed** once the engine was a package — while every unit test still
passed, because tests run from a checkout with no `@` in the path.

It surfaced only by executing the built Vercel artefact on Linux. Fixed, and
covered by a regression test that validates the *actual resolved* path.

Full detail: [[Orbit Axis Engine Architecture]].

## Verification

| Check | Result |
| --- | --- |
| Application: lint, typecheck, build | pass |
| Application: `test:local` | **487 pass, 0 fail** |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Engine: lint, runtime check, tests | **21 pass**, macOS **and** linux/amd64 |
| `npx vercel build` | succeeded against `orbit-axis` |
| Built artefact executed on Linux x64 | real calculation, Sun 118.60° Cancer |
| Zero localhost Ollama / Supabase calls under simulated Preview | verified with socket traps |
| Engine drift check | in sync, 24 files |

## Not done yet

Session 2 did **not** deliver the versioned `/api/v1/*` API. Engine integration
consumed the session, and the packaging defect above took real diagnosis. The
API is the natural head of Session 3.

Also outstanding across Update 5.0: account deletion, version-one feature flags,
legal and source pages, release channels, and publication of both repositories.

## Why publication is still pending

By choice. Both repositories are built and clean, and the history scan passed —
but publishing is permanent and immediately forkable, and AGPL means the entire
application source becomes public, including Ask Orbit's prompt engineering and
interpretation logic. That is the necessary consequence of the free Swiss
Ephemeris path, and it is worth being certain about before it cannot be undone.

## Session 3 — the versioned API

Delivered: `/api/v1` with seven routes — health, version, source, natal,
transits, synastry, and reading evidence. See
[[Architecture Notes — Versioned API]] and
[[Architecture Notes — API Security]].

Synastry was new capability rather than an extraction: the interface had a
placeholder with no calculation behind it. It deliberately returns no
compatibility score — the engine reports which aspects exist and how tight they
are, and whether each is traditionally read as easy or challenging. Whether two
people suit each other is interpretation, and no ephemeris can know it.

The API is additive. Nothing was renamed or removed, the web app still calls the
routes it always called, and a test asserts by function identity that both
layers compute through the same engine rather than two implementations.

### Two bugs worth recording

**The rate limiters were module-scope and un-injectable.** This surfaced as
twelve failing tests that passed individually — the suite was exhausting a
shared 30/minute budget. The tempting fix was raising the limit. The right fix
was making the limiters injectable, which also made them swappable for a
distributed implementation later. A test that is order-dependent is usually
telling you something true about the design.

**The stable-shape question.** One test failed because the engine returns
`angles: { ascendant: null, midheaven: null }` rather than `angles: null` when
the birth time is unknown. The test was wrong, not the engine: a client should
never have to null-check a container before reading a field.

### Verified against the real artifact, again

All seven routes executed from the built Vercel artifact in a `linux/amd64`
container — natal returning 10 planets and 12 houses, synastry 29 aspects,
evidence deterministic with `aiAssisted: false`, and zero connections attempted
to localhost Ollama or Supabase.

This is now the third time executing the real artifact has been the step that
mattered. A model of the deployment is not the deployment.

### Not done in Session 3

Account deletion, version-one feature flags, and the legal and source pages were
listed as candidates and were not taken up; the API was scoped as the whole
session. The browser pass reached the authentication gate and stopped there —
this worktree has no database configured, so the signed-in surfaces could not be
exercised locally.

Tests: 534 pass, 0 fail. Nothing deployed, published, merged, or pushed.

## Session 4 — authentication and database

The app is connected to the original Orbit Axis Supabase project. No new project
was created. See [[Architecture Notes — Authentication]] and
[[Architecture Notes — Supabase Data Ownership]].

Starting commit 29c5429, ending commit 80d4f2b.

### The blocker under the blocker

Session 3 could not test a single signed-in screen because the worktree had no
Supabase settings. Supplying them exposed the next layer: Update 4.0.2's guard
refuses to run local development against the production database — correctly,
since Orbit runs on one project and local writes are real writes.

The guard was kept, not removed. It now accepts an acknowledgement that names
the project (`ORBIT_ACKNOWLEDGE_PRODUCTION_DB=<ref>`), warns at every startup,
and still has no escape hatch for tests.

### Migration reconciliation

Two migrations were genuinely missing and were applied: `active_chart_history`
and `ask_orbit_conversations`. Additive only. RLS tables 19 → 21, policies
63 → 71, matching a rehearsal run twice against a scratch database built to the
hosted schema. User data counted before and after: unchanged.

Two things the reconciliation corrected:

- **`saved_charts` was never missing.** No such table exists in any migration;
  charts live in `birth_profiles`. My first read of a 404 as a gap was wrong,
  and checking it before reporting it is the only reason it did not become a
  false finding in this log.
- **The ledger is not the truth.** Eight migrations were applied from the
  dashboard with no local file, so `supabase migration list` reported grants as
  pending that were actually present. The schema was queried directly instead.

**Bug fixed before it could bite:** the Ask Orbit migration was not retry-safe.
Its trigger and eight policies were unguarded, so a partial failure could not be
retried — the worst possible property for a migration touching production.

### Authentication completed

Password reset did not exist in any form. Now: request, token verification (both
link shapes), update, a reset page, and the affordance that makes it reachable.
Neither sign-in nor reset can be used to discover who has an account — both
return identical responses for registered and unregistered addresses.

Also fixed: the sign-in submit button did not disable during a request, so a
double click could fire two sign-ups and have the loser report that the account
the winner had just created already existed.

### Row Level Security, proven

18/18 checks passed against the real project with two live users. No cross-user
read, update, delete, activation, or conversation access; ownership cannot be
forged on insert; anonymous callers get nothing. Disposable users deleted and
the cleanup verified.

Worth recording: the cross-user read test asserts an **empty result**, not a
403. RLS makes another user's row invisible rather than forbidden. A test
asserting 403 would fail against a perfectly secure database.

### Verified in a browser

Signed in, created a chart through the real form with live geocoding, watched it
compute (Sun Gemini, Moon Pisces, Rising Libra), refreshed without losing the
session, read history, signed out, signed back in, found everything intact.
375/768/1280, no horizontal overflow, no console errors.

### Known limitation

Password reset needs one Supabase dashboard setting — the redirect URL
allow-list — which this session was scoped not to change. Recorded under owner
actions.

Tests: 550 pass (534 before), 0 fail. Nothing deployed, published, merged, or
pushed.

## Session 5 — account deletion and version-one scope

Starting commit ea36c64, ending commit c9e295b. See
[[Architecture Notes — Account Deletion]] and [[Version-One Scope]].

### Deletion turned out to be small, for a good reason

The schema was queried rather than guessed, and every user-owned table already
cascades from `auth.users`. Deleting the identity removes everything in one
database transaction. A query confirmed no table has a user column without that
cascade, and that the project has no storage buckets at all.

So there is no hand-written list of deletes. Such a list is wrong the first time
a table is added and nobody updates it — and wrong there means abandoned
personal data nobody knows about.

It still verifies afterwards, across sixteen tables, and refuses to report
success if anything survived. A table that cannot be queried counts as a
survivor rather than as clean.

### Decisions worth keeping

- **Revoke sessions before deleting the identity.** Afterwards there is nobody
  left to revoke them for.
- **A 404 on delete is success.** A previous attempt got there; the caller asked
  for the account not to exist, and it does not.
- **A failed revocation does not abort.** Deleting the identity invalidates
  tokens anyway, and aborting would strand someone already told their account is
  going away.
- **`oa_birth` is cleared from localStorage.** Birth date, time, and coordinates
  live there, and no server-side deletion can reach them. Sign-out deliberately
  does not clear it — the person is coming back.

### The bug in the feature gate

`resolveEnvironment` takes an options object, not a bare environment. Passing
the environment directly silently fell back to `process.env` and answered
"local" for everything — a production gate that was quietly open. A failing test
caught it. The gate now defers to the application's own resolver instead of
re-deriving the answer.

### Version-one navigation

Now Home · Me · Ask Orbit · More. Tarot, Learn, and News are gated off, with
their implementations preserved. Gating the rail alone would have left them
reachable by hash, palette, and number-key shortcut, so all four use the same
filtered list, and disabled panels are removed from the document rather than
hidden.

**Known limitation:** the panel markup still ships inside `index.html` and is
removed at runtime — unreachable by navigation, but visible in page source.
Build-time stripping would need a bundler Orbit deliberately does not have.

### Verified against the real project

A disposable account with a chart, a reading, and preferences was deleted
through the actual interface. Identity, profile, birth profile, and fortunes all
gone; re-login fails; refresh stays signed out; local birth data cleared. Both
real accounts and all their data counted before and after: unchanged.

Cancel, Escape, focus return to the opener, reopen-clears-state, and every wrong
confirmation were each checked in the browser. 375/768/1280, no overflow, no
console errors.

Tests: 594 pass (550 before), 0 fail. Nothing deployed, published, merged, or
pushed.

## Recommended Session 6 — Legal Pages and Open-Source Release Readiness

1. Privacy Policy
2. Terms of Use
3. Support page
4. Source page
5. Account-deletion information page
6. Astrology and AI disclaimers
7. Public repository links
8. Final secret and privacy scan
9. Version-one release checklist
10. The open-source publication decision
11. App Store readiness update

## Superseded — the Session 5 plan as written

### Original recommendations

1. Permanent account deletion
2. Tarot, Learn, and News production feature flags
3. Privacy Policy, Terms of Use, Support, Source, account-deletion pages
4. Production navigation cleanup
5. Final pre-publication secret scan
6. The open-source publication decision

## Superseded — the Session 4 plan as written

### Original recommendations

1. Account deletion, implemented and tested against local Supabase only
2. Version-one feature flags (Tarot, Learn, News hidden in production)
3. Privacy, Terms, Support, Source, and account-deletion pages
4. A decision on publication

## Superseded — the Session 3 plan as written

### Original recommendations

1. Versioned `/api/v1/*` API — health, version, source, and calculation routes
   with a stable envelope, validation, and request IDs
2. Account deletion, implemented and tested against local Supabase only
3. Version-one feature flags (Tarot, Learn, News hidden in production)
4. Privacy, Terms, Support, Source, and account-deletion pages

## Related

- [[Orbit Axis Engine Architecture]]
- [[Swiss Ephemeris Integration]]
- [[Deployment Status and Blockers]]
- [[Orbit Axis Roadmap]]

## Update 5.1 — Release compliance and open-source readiness

Starting commit 8ed8378, ending commit cf3dec3. See
[[Legal Pages and Disclaimers]], [[Support and Contact Requirements]], and
[[Architecture Notes — Open Source Licensing]].

### Five public pages

/privacy, /terms, /support, /source, /account-deletion. Reachable without an
account, linked from More → Account and from the sign-in card.

The governing rule: **nothing is invented**. Publisher, support address,
jurisdiction, and minimum age are owner decisions, so each is validated
configuration and anything unset renders as a visible "not yet published" box.
No mailto link is rendered until a real address exists.

A plausible-looking support address is worse than a visible gap — a gap gets
fixed, a convincing placeholder silently swallows the messages people send it.

### The markup that was still shipping

Session 5 removed Tarot, Learn, and News from navigation and routing, but the
panel markup still shipped inside index.html and was deleted after the page had
already been served. Everything under public/ is copied verbatim into the static
output, so markup living there ships whether or not the app renders it.

The fragments moved to features/panels/, **outside public/**, and are fetched at
runtime only when a flag enables them. Production cannot contain them because
they are not in the directory production is built from — absent by construction
rather than removed after the fact. Verified against the real artifact.

### Bugs found

- **`parseInt("16.5")` yields 16.** A decimal minimum age would have been
  silently truncated and published as a policy nobody wrote. Digits only now.
- **The build's asset check did not know about clean URLs**, so it rejected
  `/privacy` as a missing file. Fixed, then verified it still catches a
  genuinely broken reference — a check that stops catching things is worse than
  no check.
- **Two owner-specific absolute paths would have shipped publicly**: a hardcoded
  vault-path default in deploy-check.js and the same in .env.example. Both
  already supported an override; the fallback was one contributor's directory
  layout baked into a public repository.

### Open-source readiness

The application repository had **no licence files at all** while the engine had a
complete set — a gap that would have surfaced at publication rather than before
it. Added all seven, declared the licence in package.json, and set
`private: true` so an accidental `npm publish` fails.

Full history scanned in both repositories with every pattern validated against a
known positive first. The engine repository is completely clean. The application
repository's only matches are two copies of Supabase's published local-demo JWT,
which is documentation rather than a credential. No `.env` has ever been
committed to either.

### Password reset

Verified as far as it can be from here: non-enumerating, invalid and expired
tokens fail safely, validation works, the page says so plainly when opened
without a link. The Supabase redirect allow-list **cannot be read by the
application**, so whether the callback URL is registered is unresolved and
remains an owner action. `mailer_autoconfirm` is false, so email confirmation is
required on sign-up.

### Verified

628 tests pass (594 before), 0 fail, 0 vulnerabilities. Real Vercel artifact
inspected: no unfinished markup, no service-role key, no private paths, every
public page present. Browser pass at 375/768/1280 — no overflow, clean heading
hierarchy, tables scrolling inside their own containers, no console errors.

Nothing deployed, published, merged, or pushed.

## Recommended Update 5.2 — Public Repository Release and Deployment Preparation

1. Owner review of the legal pages, and the four decisions
2. Attorney review of the Terms of Use
3. Publish Orbit Axis Engine
4. Publish Orbit Axis
5. Replace vendoring with a pinned public engine release
6. Push the branch; establish develop, release/*, and protected main
7. Configure Vercel preview and production controls
8. Production deployment checklist
9. Confirm readiness before native iOS packaging begins

