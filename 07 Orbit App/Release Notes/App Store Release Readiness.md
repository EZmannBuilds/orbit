---
id: 009121bf-3c5f-4071-808a-4f44b47c4163
title: App Store Release Readiness
type: project
status: active
created_at: 2026-07-19T00:00:00-05:00
updated_at: 2026-07-19T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - app-store
  - release
  - audit
source: user
supabase_sync: true
supabase_id:
---

# App Store Release Readiness — Audit

**Audit date:** 2026-07-19 (Apple requirements change; re-verify anything older than ~3 months)
**Repository:** `/Users/mr.mann/Projects/orbit`
**Vault:** `/Users/mr.mann/Projects/Orbit vault`
**Branch:** `feat/orbit-axis-environment-safety`
**Commit at audit:** `3bfe4c2`
**Working tree:** clean · **17 commits ahead of `origin/main`, 0 behind**

## Verdict

> **Not ready for native iOS work.**

Orbit Axis is a **server-rendered web application with no mobile packaging of any
kind**. There is no Xcode project, no Capacitor, no React Native, no Expo, no
Podfile, no `Package.swift` — and no PWA manifest or service worker either. It
is not "an iOS app that needs polish"; there is currently nothing to submit.

Two findings sit *upstream* of all packaging work and must be resolved before
any iOS effort is worth starting:

1. **The astrology engine cannot run on iOS as built.** Every chart is computed
   by shelling out to a bundled `swetest` **macOS arm64 Mach-O executable**.
   iOS apps may not spawn shipped executables. Orbit must either keep
   calculation server-side or replace the engine.
2. **The ephemeris has no licence.** Swiss Ephemeris is dual-licensed AGPL or a
   paid Professional licence. Neither is satisfied today, and AGPL is broadly
   incompatible with App Store distribution.

## What Orbit Axis is today (evidence)

| Question | Finding | Evidence |
| --- | --- | --- |
| Mobile architecture | **Web only** | no `ios/`, `android/`, `capacitor.config.*`, `app.json`, `metro.config.js`, `Podfile`, `Package.swift`, `.xcodeproj`, `.xcworkspace` |
| PWA? | **No** | no manifest, no service worker, no `apple-touch-icon`, no `apple-mobile-web-app-*` meta |
| Backend | Zero-dependency Node HTTP server | `server.js`; deps are only `luxon`, `tz-lookup` |
| Frontend | Vanilla JS + CSS from `public/` | `public/app.js`, `public/index.html` |
| Ephemeris | **macOS arm64 binary via subprocess** | `lib/astro/ephemeris.js` → `execFileSync(SWETEST)`; `file` → `Mach-O 64-bit executable arm64` |
| Auth | Supabase email/password only | routes: `signup`, `signin`, `signout`, `session` |
| Sign in with Apple | **Absent** | no provider code |
| Sign in with Google | **Absent** | no provider code |
| Payments | **None** | no StoreKit, Stripe, RevenueCat |
| Analytics / crash reporting | **None** | no SDKs found |
| Push notifications | **None** | no APNs code |
| External services | Supabase, Geoapify, local Ollama | only outbound hosts: `api.geoapify.com`, `127.0.0.1`, `localhost` |
| Account deletion | **Disabled placeholder** | `public/index.html:572` — `<button … disabled>Delete account request</button>` |
| Privacy policy | **Does not exist** | no policy page, no link |
| Terms of Use | **Does not exist** | zero matches in `public/` |

See [[Architecture Notes — iOS Constraints]] for the technical consequences.

## Apple requirements consulted (2026-07-19)

Verified against official Apple sources on the audit date:

| Requirement | Source | Bearing on Orbit |
| --- | --- | --- |
| **Xcode 26 / iOS 26 SDK minimum**, in force since **2026-04-28** | Apple *Upcoming Requirements* | Any build must use Xcode 26+; deadline already passed |
| **5.1.1(v)** account deletion in-app; deactivation insufficient | Review Guidelines | Orbit has a disabled placeholder → **P0** |
| **5.1.1(i)** privacy policy in app *and* App Store Connect | Review Guidelines | None exists → **P0** |
| **4.8** third-party login needs an equivalent privacy-preserving option | Review Guidelines | **Not triggered today** (no social login). Triggers the moment Google is added |
| **4.3(b)** *fortune telling* named explicitly; new submissions accepted only if "meaningfully different or improved" | Review Guidelines | Direct category risk → see rejection risks |
| **2.1(a)** placeholder content must be scrubbed before submission | Review Guidelines | Disabled buttons, "Coming soon" shells → **P1** |
| **3.1.1** unlocking digital features requires in-app purchase | Review Guidelines | Only if paid tiers ship |
| **4.2 / 4.2.2** must exceed a repackaged website | Review Guidelines | A thin WebView wrapper is a real risk |
| Privacy manifest / required-reason APIs | Apple docs | Required if app or any SDK uses required-reason APIs |
| Sign in with Apple token revocation on deletion | Apple account-deletion support doc | Only if SIWA is adopted |

## Scorecard (0–5, evidence-based)

| Category | Score | Basis |
| --- | --- | --- |
| Architecture (as a web app) | 4 | clean, tested, zero-dependency, guarded environments |
| Functional completeness | 2 | core flows strong; Tarot/Learn/News are deliberate shells |
| Native iOS build | **0** | does not exist |
| Authentication | 2 | email/password works; no SIWA/Google; no reset flow verified |
| Account deletion | **0** | disabled placeholder button |
| Privacy | **0** | no policy, no manifest, no disclosures |
| Legal | **0** | no Terms of Use, no disclaimers, **no ephemeris licence** |
| Permissions | 3 | requests nothing today (good) — unaudited in a native shell |
| Offline behavior | 1 | no offline design; no cache strategy |
| StoreKit | **0** | none (acceptable if v1 ships free) |
| Accessibility | 3 | focus traps, reduced motion, semantic buttons verified in browser; no VoiceOver testing |
| Security | 4 | RLS verified, env guards, no secrets in tree, 0 npm vulnerabilities |
| App Store metadata | **0** | nothing prepared |
| Testing | 3 | 305 automated tests; no device/native testing |
| Review access | **0** | reviewer could not run this app |
| Release operations | **0** | no Apple account, certs, or hosting verified |

## Critical blockers

Full table in [[Known Issues — App Store Blockers]]. The P0 set:

1. **No native app exists** — nothing to submit.
2. **Ephemeris cannot run on iOS** — subprocess execution of a macOS binary.
3. **Swiss Ephemeris licence unresolved** — AGPL vs paid Professional; no licence file in the repo.
4. **No account deletion** — Guideline 5.1.1(v).
5. **No privacy policy** — Guideline 5.1.1(i).
6. **Ask Orbit depends on `localhost` Ollama** — unreachable for any real user.
7. **No hosted backend** — the app only runs on a developer machine; `origin/main` is 17 commits behind and predates Ask Orbit entirely.
8. **No Apple Developer Program membership verified.**

## Rejection risks even after packaging

- **4.3(b) fortune telling** — the single largest category risk. Orbit must
  demonstrate meaningful differentiation. Its genuine differentiator is the
  deterministic, evidence-backed engine ("Why Orbit Said This"), which should be
  foregrounded in metadata and review notes.
- **4.2 minimum functionality** — a WebView wrapper around the current site
  would likely be rejected.
- **2.1(a) placeholders** — Tarot/Learn/News shells and disabled buttons.
- **Absolute language** — audit for "prediction", "guaranteed", "will happen".
  Orbit's existing product line ("symbolic reflection, never prediction") is the
  right framing; ensure the shipped copy matches it.
- **Health/finance adjacency** — Ask Orbit must not appear to give medical,
  mental-health, legal, or financial guidance.

## Recommended path

The smallest credible first release is **not** the current feature set. Ship a
focused, genuinely native-feeling v1:

1. Resolve the ephemeris licence and calculation strategy (blocks everything).
2. Stand up a hosted backend; get `origin/main` current.
3. Build the account-deletion flow end to end.
4. Publish privacy policy + Terms of Use.
5. Choose a packaging strategy and build it.
6. Remove or clearly gate unfinished shells.
7. TestFlight, then submit.

Detailed phasing: [[App Store Checklist]]. Data map: [[Privacy and Data Inventory]].
Decisions: [[Decision Log]].

## Commands run during this audit

`git status/branch/log/rev-list` · `npm ci --dry-run` (OK) · `npm run lint` (OK) ·
`npm run typecheck` (OK) · `npm run build` (OK) · `npm run test:local`
(**305 passed, 0 failed**) · `npm audit --omit=dev` (**0 vulnerabilities**) ·
`file lib/astro/bin/swetest` (Mach-O arm64) · architecture/route greps.

**No iOS build, simulator, device, TestFlight, StoreKit, VoiceOver, or App Store
Connect verification was performed — none of that exists yet.**

## Unverified

Everything native. Explicitly **not** claimed: physical-device behavior, Sign in
with Apple, Google sign-in, StoreKit, offline mode, VoiceOver, App Review
outcome. See [[Testing Plan — iOS Release]].

## Update 5.1 assessment — 2026-07-21

| Area | Status |
| --- | --- |
| Authentication | Complete |
| Password reset | Blocked by external service configuration — Supabase redirect allow-list |
| Account deletion | Complete |
| Privacy Policy | Ready for owner review |
| Terms of Use | Ready for owner review — **attorney review required** |
| Support page | Ready for owner review — needs a real support address |
| Source disclosure | Complete; repository URLs pending publication |
| Astrology disclaimer | Complete |
| AI disclaimer | Complete |
| Version-one scope | Complete |
| Offline behaviour | Future update |
| Native iOS packaging | Blocked by native iOS work — not started |
| Accessibility | Ready for owner review — keyboard, focus, headings, and contrast checked in a browser; **no VoiceOver or physical device testing has been performed** |
| App Store metadata | Blocked by owner action |
| Apple Developer enrolment | Blocked by owner action |
| TestFlight | Blocked by native iOS work |
| StoreKit | Future update — version one is free |
| Repository publication | Ready for owner review — both repositories scanned clean |
| Production deployment | Blocked by owner action |

### The honest headline

**Orbit Axis is not App Store ready, because there is no iOS application.** The
web application is close to publicly testable; the native shell has not been
started. Everything above that says "blocked by native iOS work" is blocked on
the same missing thing.

### What actually stands between here and a public web release

1. Four owner decisions — see [[Support and Contact Requirements]]
2. Attorney review of the Terms of Use
3. One Supabase dashboard setting for password reset
4. A production deployment, which has not been attempted

None of those is engineering work.
