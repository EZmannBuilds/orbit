---
id: 2f6c4a19-8b3d-4e57-9c02-7ad1e5f8b634
title: Architecture Notes — Versioned API
type: technical_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - api
  - architecture
  - ios
source: user
supabase_sync: true
---

# Architecture Notes — Versioned API

Introduced by Update 5.0, Session 3. Orbit Axis now exposes `/api/v1`, the
contract the web app and a future iOS client both build on.

Related: [[Orbit Axis Engine Architecture]], [[Architecture Notes — API Security]],
[[Architecture Notes — iOS Constraints]], [[Reading Evidence and Reproducibility]]

## Why a version in the path

An iOS build already in the App Store cannot be updated in step with a server
deploy. Someone runs the version they installed until they choose to update, and
some never do. Without a version boundary, any server change that removes a
field breaks an app Orbit cannot reach.

The path carries the version so a breaking change gets a new path rather than
breaking a shipped client. Within v1, Orbit may add fields and add endpoints. It
will not remove a field, change a field's type, change what an error code means,
or make an optional request field required.

## The endpoints

| Method | Path |
| --- | --- |
| GET | `/api/v1/health` |
| GET | `/api/v1/version` |
| GET | `/api/v1/source` |
| POST | `/api/v1/charts/natal` |
| POST | `/api/v1/charts/transits` |
| POST | `/api/v1/charts/synastry` |
| POST | `/api/v1/readings/evidence` |

Synastry is new capability, not a move. The interface had a placeholder with no
calculation behind it, so the engine gained `computeSynastryAspects` this
session. It deliberately returns **no compatibility score**: it reports which
aspects exist and how tight they are, and whether each is traditionally read as
easy or challenging. Whether two people suit each other is interpretation, and
it is not something an ephemeris can know.

## Stateless on purpose

Every v1 endpoint is a pure function of its request — no database read, no
session, no user identity. Orbit has always let someone explore a chart before
creating an account, and a calculation endpoint requiring a login would end
that. It also lets a local-first iOS client compute a chart without asking Orbit
to remember anything about the person.

Saving, history, and account operations are **not** in v1. They arrive later,
behind a verified Supabase token.

## One envelope, always

```json
{ "data": { }, "meta": { "requestId": "…", "contractVersion": "v1" }, "error": null }
```

Exactly one of `data` and `error` is non-null. `meta.requestId` is present on
both — an error a user cannot quote an identifier for is not supportable.

Clients branch on `error.code`, never on `error.message`. Codes are contract;
messages are prose and may be reworded or translated at any time.

## Nothing is silently repaired

`2005-02-30` is rejected, not nudged to the 28th. A latitude of 200 is rejected,
not clamped. A chart computed from repaired input is wrong in a way nobody can
see, which is worse than an error message.

A time zone **name** is required rather than a UTC offset, because historical
daylight-saving rules differ by place and year — `-05:00` is a guess about a
date, not a fact about it.

`birthTimeKnown: false` is a first-class case. Houses and angles are withheld
rather than guessed, and the response carries a `BIRTH_TIME_UNKNOWN` limitation
a client is expected to show. The shape stays stable regardless: `angles` is
still an object with null members, so a client never null-checks the container
before reading a field.

## Relationship to the existing routes

v1 is **additive**. Nothing was renamed, moved, or removed, and the v1 router
declines any path outside `/api/v1`. The two layers are not duplicates: the
existing routes are authenticated and stateful (saved charts, sessions,
settings), v1 is public and stateless, so redirecting one to the other would be
wrong.

Both compute through the same engine — `lib/astro/*` are re-export shims over
the engine package, not a second implementation. A test asserts this by function
identity, so the two layers cannot drift into returning different charts for the
same birth data.

## Verified against the real artifact

All seven routes were executed from the **built Vercel artifact** in a
`linux/amd64` container, not from a local model of it. Natal returned 10 planets
and 12 houses, synastry 29 aspects, evidence deterministic with
`aiAssisted: false`, and zero connections to localhost Ollama or Supabase were
attempted.

This distinction has now caught two defects that local testing could not — most
recently a path-validation rule that rejected the `@` in a scoped package name,
which passed every unit test and failed every calculation in the built bundle.
A model of the deployment is not the deployment.

## Status

Implemented and tested locally. **Not deployed, not published, not merged.**
Tests: 534 pass, 0 fail.
