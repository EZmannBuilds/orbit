# Orbit Axis Engine Architecture

Introduced by Update 5.0. The deterministic astrology calculations now live in
their own AGPL-3.0 repository, consumed by the Orbit Axis application as a
package.

Repository: `/Users/mr.mann/Projects/orbit-axis-engine`
**Not yet published.** No remote is configured.

## The boundary

```text
Orbit Axis application          Orbit Axis Engine
  identity, storage, wording      the numbers
  ─────────────────────────       ────────────────
  Supabase auth + RLS             natal charts
  saved charts, history           houses, aspects
  UI composition                  retrogrades, lunar phase
  feature flags                   transits
  API routes                      Swiss Ephemeris adapter
  interpretation formatting       structured errors
```

The engine has no concept of a user. No Supabase, no persistence, no network,
no AI provider, no birth-data logging. It cannot leak what it never receives.

The application owns everything about *who* is asking and *how* the answer is
worded. The engine owns *what is true*. That is the whole point of the split:
there is exactly one place the numbers come from, and it can be inspected and
tested on its own.

## Why AGPL

Not a preference — an inheritance. Swiss Ephemeris is dual-licensed, and
Astrodienst's own licence text (verified at tag `v2.10.03`) states that
choosing the free option carries "the obligation to place his or her whole
software project under the AGPL or a compatible license".

So the engine is AGPL-3.0-or-later, and the application that depends on it must
be too. See [[Swiss Ephemeris Integration]].

## Consumption model

The application depends on the engine through a **relative** path:

```json
"@ezmannbuilds/orbit-axis-engine": "file:vendor/orbit-axis-engine"
```

The engine's publishable surface is vendored into `vendor/orbit-axis-engine`.
The alternatives were worse:

| Option | Why not |
| --- | --- |
| `file:` outside the repository | Bakes an absolute `/Users/...` path into the install. Cannot work on Vercel. |
| Git submodule | Not fetched by Vercel's build; adds a checkout step for every contributor. |
| npm registry | The package is not published yet. |

Vendoring is reproducible under `npm ci`, contains no absolute path, and —
decisively — physically ships the Swiss Ephemeris executable and `.se1` data.
Those are opened **by path**, so Vercel's import tracing cannot see them; they
must exist in the upload.

The cost of vendoring is drift. `npm run engine:check` compares the vendored
copy to the engine repository file-by-file and fails on any difference, and a
test runs the same check so drift cannot pass CI.

**Temporary.** Once the engine is published this becomes a pinned tag and
`vendor/` is deleted:

```json
"@ezmannbuilds/orbit-axis-engine": "github:EZmannBuilds/orbit-axis-engine#v0.1.0"
```

## Migration shape

`lib/astro/{ephemeris,natal,current-sky}.js` and `lib/astro/runtime/*` are now
thin re-exports of the engine's public entry point. That keeps ~25 call sites
working unchanged while the implementation lives in one place, and leaves an
obvious signpost in the old location for anyone looking for it.

The duplicated binaries, `.se1` data, and runtime manifest were **deleted** from
the application. They exist only in the engine now — no second copy to drift.

## Parity

Proven, not assumed. The fixture was generated from the application *before*
extraction, so the suite demonstrates the engine is a faithful replacement
rather than merely self-consistent.

21 tests pass on `darwin-arm64` **and** inside `linux/amd64`: longitudes, signs,
degrees, minutes, retrogrades, house cusps, angles, natal chart,
unknown-birth-time filtering, current sky, snapshot hash, and transit
applying/separating classification all identical.

## The defect real testing found

Publishing the engine as the scoped package `@ezmannbuilds/orbit-axis-engine`
put an `@` into the resolved ephemeris path. The engine's argument allow-list
did not permit `@`, so **every calculation was rejected as malformed** once the
engine was installed as a package.

No unit test could have caught it: tests run from a plain checkout where the
path contains no `@`. It surfaced only when the built Vercel artefact was
executed on Linux — the calculation endpoint returned 500 while the runtime
resolver reported itself perfectly healthy.

The allow-list now admits characters that occur in real installation paths
(`@ ~ %`, spaces) and still rejects `; | & $ backtick ( ) < >`, quotes,
newlines, and NUL — verified explicitly. Three regression tests cover it,
including one that validates the *actual resolved* ephemeris directory, so
wherever the engine is installed the path it produces must survive its own
validation.

The lesson worth keeping: a model of the deployment is not the deployment.
This is the second time in this project that executing the real artefact found
something no amount of local testing would have.

## Related

- [[Swiss Ephemeris Integration]]
- [[Orbit Core Runtime Portability]]
- [[Chart Calculation Engine]]
- [[Deployment Status and Blockers]]
