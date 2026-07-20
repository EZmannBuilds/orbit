# Deployment Status and Blockers

Single source of truth for "can Orbit be deployed yet?". Run
`npm run deploy:check` in the repository for the live version.

**Last updated: 2026-07-20, after Update 4.0.4.**

## Status

```text
Update 4.0.3 — Vercel Deployment Foundation
  Implementation complete locally.
  Preview BLOCKED pending portability and owner configuration.

Update 4.0.4 — Orbit Core Portability
  Code-level portability blocker RESOLVED and verified on Linux x64.
  Preview still blocked pending owner-only configuration.
```

| Question | Answer |
| --- | --- |
| Ephemeris portability blocker resolved? | **Yes.** Statically linked `linux-x64` Swiss Ephemeris 2.10.03 ships and is checksum-verified. |
| Linux execution verified? | **Yes.** Runtime check, full calculation chain, whole test suite, and the real Vercel function handler all ran in a `linux/amd64` container. |
| Vercel build verified? | **No.** `npx vercel build` needs a project link — an owner action. It has never run. |
| Private Preview healthy? | **No.** No Preview Deployment has ever been created. Must not be called healthy until one is tested. |
| Anything deployed or migrated? | **No.** Nothing pushed, merged, deployed, or migrated remotely. Hosted Supabase never contacted. |
| Repository public? | **No.** It remains private. No public engine repository was created. |

## Code-level blockers

**None remain.**

## Owner-only blockers

Each needs the owner's accounts or approval. None can be resolved from the
repository.

1. **Branch not pushed.** Vercel can only build a commit that exists on GitHub.
   Updates 4.0 → 4.0.4 are local-only.
2. **Vercel project not linked.** The CLI is authenticated, but no link exists.
   Creating one changes account state, so `npx vercel build` has never run and
   the Vercel build is **unverified**. `npm run build` is a local verification
   step, not a substitute.
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
| 449 tests, 0 failures | macOS, local Supabase |
| 449 tests, 437 passed / 12 skipped, 0 failures | Linux x64 container, no Supabase |
| Runtime check, core calculation smoke | macOS **and** Linux x64 container |
| Mac ↔ Linux parity, 440 values, max longitude drift 0.0° | both |
| Real Vercel function handler serving live requests | Linux x64 container |
| Zero localhost Ollama / Supabase connections under simulated Preview | Linux x64 container |
| Browser at 375 / 768 / 1280, zero console errors | macOS, local Supabase |
| Vercel CLI build | **never ran — unverified** |
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
