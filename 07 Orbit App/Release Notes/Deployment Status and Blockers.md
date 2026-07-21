---
id: 5eb45291-3e2e-41f2-b87f-657fe4138911
title: Deployment Status and Blockers
type: release_note
status: active
created_at: 2026-07-20T00:00:00-05:00
updated_at: 2026-07-20T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - deployment
  - vercel
  - blockers
  - status
source: user
supabase_sync: true
---

# Deployment Status and Blockers

Single source of truth for "can Orbit be deployed yet?". Run
`npm run deploy:check` in the repository for the live version.

**Last updated: 2026-07-21, during Update 5.0 (Session 2).**

## Status

```text
Update 4.0.3 — Vercel Deployment Foundation
  Implementation complete locally.
  Preview BLOCKED pending portability and owner configuration.

Update 4.0.4 — Orbit Core Portability
  Code-level portability blocker RESOLVED and verified on Linux x64.
  Preview still blocked pending owner-only configuration.

Update 4.0.4.1 — Vercel Project Link Repair
  Accidental link to the-lorehouse removed; guards added. Branch pushed.

Update 4.0.4.2 — Vercel Build Verification
  Linked to orbit-axis. First real `vercel build` SUCCEEDED and was verified.

Update 5.0 — Open Platform Foundation (IN PROGRESS)
  S1: calculation engine extracted to its own AGPL repo, parity proven.
  S2: application now consumes the engine as a package; Vercel build re-verified.
  Neither repository published. Versioned API still to come.
```

| Question | Answer |
| --- | --- |
| Wrong-project link repaired? | **Yes.** Removed, and `deploy:check` now blocks a repeat. Lorehouse was not modified. |
| Ephemeris portability blocker resolved? | **Yes.** Statically linked `linux-x64` Swiss Ephemeris 2.10.03 ships and is checksum-verified. |
| Linux execution verified? | **Yes.** Runtime check, full calculation chain, whole test suite, and the real Vercel function handler all ran in a `linux/amd64` container. |
| Vercel build verified? | **Yes.** `npx vercel build` succeeded against `orbit-axis`, output directory `public`, runtime `nodejs22.x`. The built function was run on Linux x64 and performed a real calculation. |
| Private Preview healthy? | **No.** No Preview Deployment has ever been created. Must not be called healthy until one is tested. |
| Anything deployed or migrated? | **No.** Nothing pushed, merged, deployed, or migrated remotely. Hosted Supabase never contacted. |
| Repository public? | **No.** Both repositories remain private/unpublished by choice. |
| Calculations extracted to a public-ready engine? | **Yes.** See [[Orbit Axis Engine Architecture]]. Parity proven on both platforms. |

## Code-level blockers

**None remain.**

## Owner-only blockers

Each needs the owner's accounts or approval. None can be resolved from the
repository.

1. ~~**Branch not pushed.**~~ **RESOLVED 2026-07-20.**
   `feat/orbit-axis-core-portability` is on GitHub and tracks its remote. The
   repository remains private.
2. ~~**No `orbit-axis` Vercel project exists.**~~ **RESOLVED 2026-07-20.**
   Linked to `lorehouse-team/orbit-axis`, and the first real `vercel build`
   succeeded. See [[Vercel Build Verification]]. One dashboard follow-up
   remains: the project's Node setting is `24.x` while Orbit pins `22.x`. The
   pin wins, but the two should be aligned.
3. **No approved Preview Supabase project.** Orbit refuses preview mode until a
   disposable project reference is explicitly approved. This is the guard
   working, not a bug.
4. **Preview environment variables not set** — `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `ORBIT_ENVIRONMENT`, `ORBIT_PREVIEW_PROJECT_REFS`.
5. **Supabase authentication configuration** — Site URL and redirect URLs for
   the Preview project, if email confirmation is enabled.
6. **Hosted Ask Orbit migration not applied.** Answers will generate but not
   save. Orbit says so honestly rather than faking a save.

## Legal blocker

**Swiss Ephemeris licensing is unresolved.** Dual-licensed (AGPL or a paid
Astrodienst licence); both carry obligations for a publicly reachable service.
No licence chosen, none purchased, no legal review, no conclusion reached.

**Keeping the Git repository private does not by itself establish that a public
hosted service complies with either licence.** Update 4.0.4 resolved a
*technical* portability blocker and resolved nothing here. See
[[Swiss Ephemeris Integration]].

## What is verified, and how

| Evidence | Where it ran |
| --- | --- |
| 487 tests, 0 failures (engine-backed) | macOS, local Supabase |
| Engine: 21 tests, 0 failures | macOS **and** linux/amd64 |
| 449 tests, 437 passed / 12 skipped, 0 failures | Linux x64 container, no Supabase |
| Runtime check, core calculation smoke | macOS **and** Linux x64 container |
| Mac ↔ Linux parity, 440 values, max longitude drift 0.0° | both |
| Real Vercel function handler serving live requests | Linux x64 container |
| Zero localhost Ollama / Supabase connections under simulated Preview | Linux x64 container |
| Browser at 375 / 768 / 1280, zero console errors | macOS, local Supabase |
| Vercel CLI build | **ran and succeeded** against `orbit-axis` |
| Built function executed on Linux x64, real calculation | **verified** — materialised bundle in a `linux/amd64` container |
| Secret scan of `.vercel/output` | **clean** — 2 benign hits (published local demo key, a redaction regex) |
| Hosted Supabase schema, RLS, indexes, grants | **never contacted — unverified** |
| Preview / Production deployment behaviour | **simulated only** |

## Rollback and recovery

Nothing hosted was changed, so there is no database or deployment rollback to
perform.

| To undo | Action |
| --- | --- |
| The 4.0.4 code | One commit on `feat/orbit-axis-core-portability`, not merged into `main` |
| A bad Preview Deployment | Nothing — Preview deployments are per-commit and disposable |
| A bad Production Deployment | Vercel dashboard → Deployments → last good → Promote |
| The Vercel connection | Delete the project in the dashboard; the repository is unaffected |
| An applied hosted migration | The Ask Orbit migration ships a manual rollback block; read it before applying |

Local development is unaffected by any of the above.

## Related

- [[Orbit Core Portability]]
- [[Vercel Deployment Foundation]]
- [[Swiss Ephemeris Integration]]
- [[Orbit Axis Roadmap]]

## Update 5.0 Session 4 — 2026-07-21

**Resolved.** The hosted Ask Orbit migration blocker is cleared. `ask_conversations`
and `ask_messages` exist with RLS enabled, and `active_chart_history` (the
`activate_birth_profile` RPC and `last_active_at`) is applied. Ask Orbit now
saves conversation history instead of generating answers that vanish.

**Still open for Production:**

- Swiss Ephemeris licensing remains unresolved and undocumented. Keeping the
  repository private does not by itself make a publicly reachable service
  compliant with either licence option.
- Vercel Preview and Production must each define `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `ORBIT_ENVIRONMENT` in the dashboard.
- No separate Preview database exists, by choice. Preview and Production share
  one project, so preview traffic reaches real data. See
  [[Architecture Notes — Supabase Data Ownership]].
- One Supabase dashboard setting is required before password reset works
  end-to-end: the reset redirect URL must be allow-listed.

**Not a blocker:** the branch is ahead of origin. Nothing has been pushed by
design.
