---
id: 4f7a1b83-9c25-4e08-b6d1-2a93e5c70f48
title: Architecture Notes — Open Source Licensing
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - licensing
  - agpl
  - open-source
source: user
supabase_sync: true
---

# Architecture Notes — Open Source Licensing

Both repositories are `AGPL-3.0-or-later`. Prepared for publication in Update
5.1; neither has been published.

Related: [[Orbit Axis Engine Architecture]], [[Legal Pages and Disclaimers]],
[[Open Source Release Plan]], [[Swiss Ephemeris Integration]]

## The licence is inherited, not chosen

Orbit Axis calculates with **Swiss Ephemeris** (Astrodienst AG), which is
dual-licensed: AGPL, or a paid professional licence.

Orbit uses the AGPL option. The AGPL is viral, so the whole application carries
it. This was not a preference about openness — it is the consequence of not
buying the commercial licence, and it is worth stating that way because it
explains why the obligation cannot simply be dropped later.

Buying the Astrodienst professional licence would be the alternative path, and
would require a separate agreement.

## Why the AGPL rather than the GPL matters here

Orbit is used over a network, not installed. Under the plain GPL, a hosted
service distributes nothing and so triggers no source obligation. **AGPL section
13 closes that gap:** anyone interacting with Orbit remotely is entitled to its
complete corresponding source.

That is a real obligation on a deployed instance, which is why the application
satisfies it in two ways:

```text
GET /api/v1/source     machine-readable licence, versions, repository status
/source                the same, as a page a person can read
```

Both read live from the running deployment, so they describe the code actually
serving the request rather than a number written into a document.

## Corresponding source

For a deployed instance this is the commit it was built from, plus:

- the vendored engine at `vendor/orbit-axis-engine`
- the Swiss Ephemeris binary and `.se1` data it executes
- `vercel.json`, which determines how the function is packaged

Configuration values — database URLs, API keys — are **not** corresponding
source and are never published.

## Files in each repository

`LICENSE` (verbatim AGPL, byte-identical across both), `NOTICE`,
`THIRD_PARTY_NOTICES.md`, `SOURCE.md`, `SECURITY.md`, `CONTRIBUTING.md`,
`CODE_OF_CONDUCT.md`, `README.md`.

The application repository had **none** of these before Update 5.1 while the
engine had a complete set — a gap that would have been discovered at publication
rather than before it.

`package.json` now declares the licence and sets `private: true`, so an
accidental `npm publish` fails rather than pushing the application to a registry.

## Pre-publication scan results

Full history, both repositories, with every pattern validated against a known
positive first — an unexplained zero result is not evidence.

**Engine repository: completely clean.** No secrets, no absolute paths, no
project references, no `.env` ever committed, across all 3 commits and 54 blobs.

**Application repository: clean.** Across 47 commits and 774 blobs, the only
matches are two copies of Supabase's *published local-demo JWT* (issuer
`supabase-demo`), which is documentation, not a credential. No `.env` file has
ever been committed.

## Remaining before publication

- Four owner decisions — see [[Support and Contact Requirements]]
- Attorney review of the Terms of Use
- Four owner-facing local guides under `docs/` still contain the owner's home
  directory path. They are machine-specific instructions where the path *is*
  the instruction, so they are correct as local examples — but worth a look
  before the repository is public, since they disclose a username.
