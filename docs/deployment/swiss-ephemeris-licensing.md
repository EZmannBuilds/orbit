# Swiss Ephemeris licensing — UNRESOLVED

**Status: unresolved. No licence has been selected, purchased, or documented.**

This note records what is known and what is not. It is **not** legal advice and
reaches **no** legal conclusion. It exists so the question cannot be quietly
forgotten, and so nobody mistakes an engineering fact for a licensing answer.

---

## What Orbit uses

- Swiss Ephemeris **2.10.03** by Astrodienst AG
- The `swetest` command-line executable, built from official source at
  `https://github.com/aloistr/swisseph`, tag `v2.10.03`
- The bundled `.se1` ephemeris data files
- Two compiled executables committed to this repository:
  `lib/astro/bin/darwin-arm64/swetest` and `lib/astro/bin/linux-x64/swetest`

Every astrology feature depends on it: natal charts, Current Sky, daily
fortunes, and the evidence behind every Ask Orbit answer.

---

## The licensing position, as published by Astrodienst

Swiss Ephemeris is **dual-licensed**. A user chooses one:

1. **AGPL-3.0** — a strong copyleft licence. Its distinguishing feature is the
   network clause: making the software available to users over a network can
   trigger an obligation to offer corresponding source to those users.
2. **A paid Astrodienst Professional Licence** — a commercial licence intended
   for applications whose authors do not wish to publish their source.

Which obligations actually apply to Orbit depends on facts and legal
interpretation that this repository cannot settle.

---

## What is NOT resolved

- No licence has been chosen.
- No Professional Licence has been purchased.
- No AGPL compliance plan exists (no source-offer mechanism, no licence notices
  shipped to users, no written analysis).
- No legal review has been carried out.
- No lawyer has been consulted.

## What must NOT be inferred

> **Keeping the GitHub repository private does not, by itself, establish that a
> publicly reachable hosted Orbit service complies with either licence.**

The AGPL's network clause is concerned with providing software to users *over a
network*, which is exactly what a deployed Orbit Preview or Production would
do. Repository visibility is a different question from network distribution.
Private-repository status is therefore evidence of nothing in particular here,
and must not be presented as a resolution.

Similarly:

- Update 4.0.4 building a Linux executable resolved a **technical portability**
  blocker. It resolved nothing about licensing.
- Recording provenance and checksums in `lib/astro/runtime/manifest.json` is
  supply-chain hygiene, not a licence.
- Passing `npm run deploy:check` never clears this item. It is reported as a
  standing WARNING and is deliberately not clearable by code.

---

## Where this blocks

| Activity | Blocked by licensing? |
|---|---|
| Local development on the owner's machine | No |
| Automated tests, containers, CI | No |
| A **private** Vercel Preview, access-restricted to the owner | Lower risk, but unreviewed — this note does not clear it |
| A **publicly reachable** Preview or Production deployment | **Yes — resolve first** |
| Any paid or commercial offering | **Yes — resolve first** |

---

## What resolving it would look like

Owner decision. Roughly, one of:

**Option A — Professional Licence.** Contact Astrodienst, purchase the licence
appropriate to the intended use, store the record outside the repository, and
replace this note with the licence reference and its scope.

**Option B — AGPL compliance.** Accept the copyleft terms, ship the required
notices, and provide a corresponding-source offer to users of the network
service. Note this has implications for the rest of the Orbit codebase that
should be understood before choosing it.

**Option C — Replace the dependency.** Use a differently licensed ephemeris.
This would change calculation results and require re-verifying the parity
fixture, so it is a product decision as much as a legal one.

Whichever is chosen: record the decision, its date, and its evidence here, and
update the `source.licenceStatus` field in
`lib/astro/runtime/manifest.json`.

Until then, this file should keep saying UNRESOLVED.
