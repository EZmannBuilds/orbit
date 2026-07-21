---
id: c17d4a90-2b6e-4f35-8a71-6d09e3b5f4c2
title: Open Source Release Plan
type: product_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - open-source
  - agpl
  - release
source: user
supabase_sync: true
---

# Open Source Release Plan

How and when both repositories become public. Neither has been published, and
this update did not publish them.

Related: [[Architecture Notes — Open Source Licensing]],
[[Support and Contact Requirements]], [[Legal Pages and Disclaimers]],
[[Orbit Axis Engine Architecture]]

## The decision that is already made

Publication is not optional in the long run. Orbit Axis calculates with Swiss
Ephemeris under its AGPL option, and AGPL section 13 entitles anyone using a
network service to its source. Running Orbit publicly without offering the
source would not comply.

What is still open is **when**, and in what order.

## What publication actually costs

Worth being clear-eyed rather than enthusiastic:

- **The entire application becomes public**, including Ask Orbit's prompt
  construction and the interpretation logic that gives Orbit its voice
- Anyone may run their own instance, including a competing one
- It is **permanent and immediately forkable** — an unpublish does not undo it
- Every future commit is public by default from that day

None of that is a reason not to publish. It is a reason to be sure first, which
is why it has been deferred through several updates rather than done in passing.

## Readiness

**Both repositories pass their pre-publication scans.** Full history, every
pattern validated against a known positive before any negative was trusted.

- **Engine:** completely clean — no secrets, no absolute paths, no project
  references, no `.env` ever committed
- **Application:** clean — the only matches are two copies of Supabase's
  published local-demo JWT, which is documentation rather than a credential

Both carry `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `SOURCE.md`,
`SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and a `README.md`.

## Suggested order

**1. Publish the engine first.**

It is the smaller, cleaner, more self-contained artifact, its history is three
commits, and it has no application secrets by construction. It is also the piece
most useful to anyone else — a deterministic Swiss Ephemeris wrapper with proven
parity is worth more to a stranger than a specific astrology app.

Publishing it first is a rehearsal with a much smaller blast radius.

**2. Replace vendoring with a pinned public release.**

Once the engine is public, `vendor/orbit-axis-engine` can become a pinned
dependency on a published version. Vendoring exists so builds are reproducible
without a registry; a pinned public release achieves the same thing more
honestly.

**3. Publish the application.**

After the legal pages are reviewed and the four owner decisions are made — a
public repository whose Terms of Use is unreviewed invites the wrong kind of
attention.

**4. Set the source URLs.**

`ORBIT_SOURCE_APP_URL` and `ORBIT_SOURCE_ENGINE_URL`. The `/source` page and
`/api/v1/source` switch from "publication pending" to real links with no code
change. Both are validated: https only, on a known code host.

## Before the application is published

- [ ] Four owner decisions — see [[Support and Contact Requirements]]
- [ ] Attorney review of the Terms of Use
- [ ] Decide whether the repository history stays as-is (it is clean, so there
      is no forced rewrite)
- [ ] Review the files that contain the owner's home directory path — four
      `docs/` guides and two notes in the repository's vault mirror. They are
      correct as local examples, and in a private vault they are entirely
      appropriate, but the mirror is published with the repository and they
      disclose a username and directory layout
- [ ] Decide whether the `07 Orbit App/` vault mirror should be published at
      all. It is project documentation rather than code, and publishing it
      exposes planning notes that were written for an audience of one
- [ ] Decide on a contribution posture: open to pull requests, or source-available
      and closed to contributions

## What must never be published

Configuration, not code: database URLs, anon and service-role keys, the Geoapify
key, `.env.local`. None has ever been committed, and `.gitignore` plus the
pre-publication scan are what keep it that way.

The Supabase project reference is **not** a secret — it appears in the public
project URL — and is fine to leave in documentation.
