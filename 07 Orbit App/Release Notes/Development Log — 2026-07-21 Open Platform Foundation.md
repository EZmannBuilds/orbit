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

## Recommended Session 3

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
