# Orbit Core Portability (Update 4.0.4)

Branch: `feat/orbit-axis-core-portability`
Base: `9b76428` (Update 4.0.3)
Date: 2026-07-20

Update 4.0.3 prepared Orbit for Vercel and then found the thing that would have
made the whole exercise pointless: the Swiss Ephemeris executable was compiled
for Apple Silicon macOS, and Vercel functions run Linux x86-64. Every astrology
feature shells out to that binary, so a Preview deployment would have served
the frontend, signed users in, and then failed on every chart, sky, fortune,
and Ask Orbit answer.

This update fixes that, and proves it rather than asserting it.

**Nothing was deployed, pushed, merged, or migrated remotely. The repository
remains private. No public engine repository was created.**

## The portability boundary

Before, `lib/astro/ephemeris.js` hardcoded one path and called `execFileSync`
itself. Now nothing above `lib/astro/` knows an executable exists at all:

```text
Orbit application
      ↓
lib/astro/ephemeris.js        shapes and parses only
      ↓
lib/astro/runtime/resolve.js  platform → executable + data paths
      ↓
lib/astro/runtime/exec.js     validation · spawn · timeout · classification
      ↓
lib/astro/bin/<platform>/swetest
```

Chart, transit, Current Sky, fortune, and Ask Orbit evidence all reach the
ephemeris through one seam, so they cannot drift apart or resolve different
binaries. Calculation formulas were not rewritten — the parity fixture proves
the numbers are unchanged.

## Supported platforms

| Runtime | Linkage | Purpose |
| --- | --- | --- |
| `darwin-arm64` | dynamic | Local development on the owner's Mac |
| `linux-x64` | **static** | Vercel functions, containers, CI |

`darwin-x64` and `linux-arm64` were assessed and deliberately **not** shipped:
no Intel Mac was available to verify the first, and nothing needs the second
while Vercel is x64. They are recorded as unsupported rather than faked.

An unsupported platform fails with a named error. Orbit never falls back to a
binary built for another operating system.

### Where the Linux executable came from

Built from official Astrodienst source — `github.com/aloistr/swisseph`, tag
`v2.10.03`, commit `175e1fc` — inside a throwaway `debian:bookworm-slim`
`linux/amd64` container using the upstream Makefile's static target. No binary
was downloaded from any mirror. No source archive or build debris was committed.

Static linkage matters: a dynamically linked build would depend on the build
host's glibc version and could fail on Vercel's. The static build was verified
running on **busybox**, which ships no glibc at all.

## Calculation parity: exact

Same inputs, same `.se1` data, both platforms. Across 440 compared values:

| Quantity | Difference |
| --- | --- |
| Planetary longitude | **0.0°** — bit-identical |
| Speed | 1e-7 °/day (last printed digit only) |
| Sign, degree, minute, retrograde | identical |
| House cusps, Ascendant, Midheaven | **0.0°** |
| Lunar phase, illumination, sky snapshot hash | identical |
| Transit orb and applying/separating state | identical |

Test tolerances are set orders of magnitude looser than the observed
difference, purely to absorb last-digit formatting, and are documented as not
to be widened to make a failing test pass.

An early smoke run *did* show ~1e-6° drift. The cause was the build container's
own bundled ephemeris data, not the compiler — with Orbit's `.se1` files the
results are identical. Worth recording, because it is exactly the kind of
difference a loose tolerance would have hidden.

## Verified on Linux, not assumed

Every one of these ran inside a `linux/amd64` container. No existing Orbit or
Lorehouse Supabase container was touched.

- `orbit:runtime:check` — resolver selects `linux-x64`, checksum verified, smoke
  calculation matches the reference exactly
- `orbit:core:smoke` — natal chart, Current Sky, transits, Ask Orbit evidence,
  and fortune all compute; output byte-identical to macOS
- Full test suite — 449 tests, 437 passed, **0 failed**, 12 skipped (the
  Supabase integration tests, which correctly skip with no local stack)
- The **real Vercel function entry point** answered live HTTP requests and
  performed a genuine calculation (Sun 118.14° Cancer), while every outbound
  socket was trapped: **zero** connection attempts to localhost Ollama or
  Supabase, even with Ollama deliberately enabled and pointed at 127.0.0.1

## Other defects repaired

- **Working-directory assumptions.** All paths now resolve from module
  location; `cwd` is pinned for the child process. A test changes directory and
  asserts the answer is unchanged.
- **Unstructured native failures.** Thirteen distinct error codes replace raw
  `ENOEXEC`/`EACCES` text. Customer messages contain no path, no native string,
  and no birth data — asserted by test.
- **Malformed output accepted as a chart.** An incomplete planet set or missing
  houses is now rejected. Previously a truncated run could have surfaced as a
  structurally valid but empty chart.
- **Command injection surface.** Arguments were already arrays, but are now
  also allow-listed, and dates, coordinates, and house systems are range-checked
  before a process starts.
- **Build packaging.** The executable and `.se1` files are opened by path, so
  Vercel's import tracing would never have included them. `vercel.json` now
  force-includes `lib/astro/**`, and `.vercelignore` excludes the macOS binary.
  A packaging test asserts both directions.
- **Inconsistent `env:check` between checkouts.** Update 4.0.3 reported this and
  could not explain it. It was not a path bug: a worktree has no untracked
  `.env.local`, so it had *no* configuration — and the check still printed
  "safe to start". "Safe" and "configured" are now separate states, with a
  `--strict` flag for CI.
- **Overstated deployment status.** 4.0.3 was described as deployment-ready
  while blockers remained. Documentation now states implementation-complete,
  Preview-blocked.
- **Canonical vault never updated.** 4.0.3 updated only the repository mirror.
  `deploy:check` now reports the drift, and this note is in the canonical vault.

## Blockers

**Code-level: none remain.** The portability blocker is resolved and verified.

**Owner-only, all requiring accounts or approval:**

1. Branch not pushed — Vercel can only build a commit on GitHub
2. Repository not linked to a Vercel project, so `npx vercel build` has never
   run and the Vercel build remains **unverified**
3. No approved Preview Supabase project
4. Preview environment variables not set
5. Hosted Ask Orbit migration not applied — answers generate but do not save

**Legal:** Swiss Ephemeris licensing is **unresolved**. It is dual-licensed
(AGPL or a paid Astrodienst licence) and both carry obligations for a publicly
reachable service. Building a Linux executable resolved a *technical* blocker
and resolved nothing here. **Keeping the Git repository private does not by
itself establish that a public hosted service complies with either licence.**
No licence was purchased and no legal conclusion was reached. See
[[Swiss Ephemeris Integration]].

## Known limitations

- The Vercel CLI build is unverified and must not be described as passing.
- Preview and Production behaviour remains **simulated**. No deployment exists,
  so private Preview must not be called healthy.
- Hosted Supabase was never contacted; its schema, RLS, indexes, and grants stay
  unverified by design.
- `linux-arm64` and `darwin-x64` are untested and unshipped.

## Related

- [[Orbit Core Runtime Portability]] — architecture, provenance, tolerances
- [[Swiss Ephemeris Integration]] — dependency and licensing status
- [[Vercel Deployment Foundation]] — Update 4.0.3
- [[Orbit Axis Roadmap]]
