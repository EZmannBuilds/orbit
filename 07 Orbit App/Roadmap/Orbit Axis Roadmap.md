---
id: d653851d-f78a-4780-87ab-22ff9148a481
title: Orbit Axis Roadmap
type: project
status: active
created_at: 2026-07-11T16:04:24-05:00
updated_at: 2026-07-20T00:00:00-05:00
tags:
  - orbit
  - roadmap
source: user
supabase_sync: true
supabase_id:
---

# Orbit Axis — Roadmap

A Now / Next / Later view. This is a living document; edit freely.

## Now

- [x] Consolidate the duplicate Orbit folder; establish canonical app + vault.
      See [[orbit-folder-consolidation]].
- [x] Stand up the Supabase schema with Row Level Security.
      See [[supabase-initial-setup]].
- [x] Wire Orbit Axis accounts and saved chart persistence to Supabase Auth.
      See [[Accounts and Saved Charts Update]].
- [ ] Populate the Tarot reference data (`tarot_cards`) — public read-only.

## Now

- [x] **Deterministic chart engine** — Swiss Ephemeris 2.10.03 folded into the
      canonical app (`lib/astro`). Tested. See [[Chart Calculation Engine]].
- [x] **Saved charts** — auto "My Chart", active-chart switching, safe delete,
      unknown-time handling, full management UI, Supabase Auth, RLS. Tested.
      See [[Saved Charts]].
- [x] **My Chart panel** — Big Three, element/modality, Tonight's Moon. Verified
      in-browser. See [[My Chart Tab]].
      See [[Personal Astrology Experience Update]].

## Now (Orbit Axis daily experience — shipped this update)

- [x] **Rename to Orbit Axis** (user-facing; internals stay `orbit`). Tested.
      See [[Orbit Axis Naming]].
- [x] **Today workspace** + beginner-first UI. Verified in-browser.
      See [[Orbit Axis Interface Direction]].
- [x] **Deterministic Daily Fortune** (seeded, grounded, Ollama-optional).
      Tested. See [[Daily Fortune]] · [[Fortune Seed Architecture]].
- [x] **Astrology Detail Levels** (Simple default). Tested.
      See [[Astrology Detail Levels]].
- [x] **Fortune History** (latest 30, filters, soft empty state). Tested.
      See [[Fortune History]].
- [x] **Soft space theme + motion** with reduced-motion support.
      See [[Orbit Axis Daily Experience]].

## Now (Navigation redesign)

- [x] **Permanent primary navigation** — Home, Me, Tarot, Ask Orbit Axis, Learn,
      News, More. See [[Primary Navigation]].
- [x] **Central Ask Orbit Axis workspace** — raised mobile action, active chart
      label, suggested prompts, and chat controls. See [[Central Chatbot Experience]].
- [x] **History relocation** — Fortune History moved under More instead of
      primary navigation. See [[Navigation Redesign]].
- [x] **Learn/News separation** — Learn is evergreen education; News is verified
      current reporting only. See [[News and Learn Separation]].
- [x] **Honest shells** — Tarot, Learn, and News avoid fabricated content until
      the backing systems exist.

## Next

- [~] Synastry / Compare: **deterministic facts shipped** (Update 5.0,
      Session 3) as `computeSynastryAspects` in the engine and
      `POST /api/v1/charts/synastry`. Deliberately returns no compatibility
      score. The Qwen `qwen3:14b` reading layer on top is still to do.
- [x] **Versioned `/api/v1` API** — health, version, source, natal, transits,
      synastry, reading evidence. Stable envelope, machine-readable error
      codes, request ids, allow-list CORS. Verified from the real built
      Vercel artifact on linux-x64. See [[Architecture Notes — Versioned API]]
      and [[Architecture Notes — API Security]].
- [ ] Orbit Chat expansion (chart-grounded astrology/metaphysics).
- [x] Live Supabase migration/advisor verification for accounts + saved charts.
      See [[Accounts and Saved Charts Update]].
- [ ] Fortune notifications (Full/New Moon, retrograde) — prepared, not enabled.
- [ ] Tarot daily card and reading engine with stable same-day card behavior.
- [ ] Learn course content, chapters, lessons, and progress tracking.
- [ ] Verified News ingestion with publisher, URL, date, retrieval timestamp, and
      verification status.

## Later

- [ ] Transit engine writing `transit_events` on a schedule.
- [ ] Pattern insights over journal + transits (`pattern_insights`).
- [ ] Optional two-way sync once one-way push is proven safe.

## Related

- [[Orbit Axis Product Definition]]
- [[Supabase Architecture]]

## Now (Birthplace search and profile names)

- [x] **Birthplace search** — server-side Geoapify autocomplete, signed selected
      places, and hidden technical fields. See [[Birthplace Search]].
- [x] **Timezone and historical offsets** — local tz-lookup and Luxon
      resolution before Swiss Ephemeris chart calculation. See
      [[Geocoding and Timezone Architecture]].
- [x] **Profile names** — first/last names for the primary profile and saved
      charts while preserving nicknames as display labels. See [[Saved Charts]].
- [ ] **Pre-launch key rotation** — rotate Geoapify and Supabase secrets before
      a larger public launch. See [[Geoapify Key and Location Privacy]].

## Now (Home and Current Sky redesign)

- [x] **Global search bar removed** from the top nav; command palette and
      rail "Command" launcher kept. See [[Home Page Experience]].
- [x] **Home saved-chart selector** — "Viewing" dropdown wired to the
      existing activate endpoint. See [[Saved Charts]].
- [x] **Today's Fortune card carousel** — six topics, arrows/keyboard/swipe,
      wrap navigation, reduced-motion aware. Tested. See
      [[Fortune Card Carousel]].
- [x] **Current Sky replaces Tonight's Moon** — unified panel, procedural SVG
      Moon driven by real phase data, personal transit summary. Tested. See
      [[Current Sky]] · [[Moon Phase Renderer]].
- [x] **Current timezone, separate from birth timezone** — device detection,
      optional geolocation, drives the daily-fortune local date. Tested. See
      [[Current Timezone Context]] · [[Current Location Privacy]].

See [[Home and Current Sky Update]] for the full report.

## Now (Faster chat and simplified detail modes — Update Two)

- [x] **Balanced detail mode removed** — only Simple (default) and Advanced
      remain; existing Balanced values migrate to Simple. See
      [[Astrology Detail Levels]].
- [x] **Streamed Ask Orbit Axis** — Server-Sent Events, immediate feedback,
      Stop, and Retry. See [[Ask Orbit Axis]] · [[Streaming Responses]] ·
      [[Ollama Streaming]].
- [x] **Compact, active-chart-scoped context** with a documented budget and
      in-memory caches. See [[Chat Context Builder]] · [[Chat Context Cache]] ·
      [[Chat Context Privacy]].
- [x] **Calculation reuse** — no natal recompute on ordinary follow-ups.
- [x] **Warmup + keep-alive** and a **deterministic fallback** when Ollama is
      offline. See [[Ollama Warmup and Keep Alive]].

See [[Faster Chat and Detail Modes Update]] for the full report.

## Now (Returning user chart flow — Update Three)

- [x] **Returning users are never re-onboarded** — a signed-in user with a saved
      chart is never asked to set it up again on login, refresh, or return to
      Home. See [[Chart Onboarding Rules]].
- [x] **Startup gate** — auth and saved charts resolve before anything is
      decided, so the setup form never flashes. See
      [[Returning User Startup Flow]].
- [x] **Active-chart restoration and healing** — one activation system; a
      missing or stale active chart auto-selects and persists a sensible one. See
      [[Active Chart Restoration]].
- [x] **Recoverable errors** — a failed chart request offers a retry instead of
      claiming the user has no chart.
- [x] **Saved-chart management** — Home "+" action, shared accessible chart
      modal, rename/edit, and a confirmed delete. See [[Saved Chart Management]].

See [[Returning User Chart Flow]] for the full report.

## Next (Orbit Prediction Engine — folded into Orbit Axis Intelligence)

> **Superseded as a standalone track (2026-07-20).** This work is not
> abandoned — it is re-homed inside the modular
> [[Orbit Axis Intelligence Current Plan]]: calculation depth → Orbit Core,
> structured reference data → Orbit Knowledge, versioned rules → Orbit Skills.
> The items below remain valid inputs to those systems.

Evolve the deterministic Daily Fortune into a native, personalized astrology
inference system. **Nothing in this section is implemented.** The decision and
architecture live in [[Orbit Prediction Engine]]; the full ordering and the
60/25/15 effort split live in [[Prediction Engine Priorities]].

- [ ] Audit and normalize existing astrology and tarot data.
- [ ] Add source, tradition, versioning, and reliability metadata.
      See [[Astrology Data Model]] · [[Tarot Data Model]].
- [ ] Advanced timing and aspect-strength calculations.
- [ ] Interpretation priority and synthesis rules.
      See [[Astrology Synthesis Rules]].
- [ ] Complete reading evidence and engine versions.
      See [[Reading Evidence and Reproducibility]].
- [ ] Feedback and optional life-event journaling.
      See [[Personalization and Feedback]].
- [ ] Astrology-and-tarot synthesis.
- [ ] Ollama as the natural-language presentation layer — last, and optional.
      See [[Prediction Engine Pipeline]].

Storage ownership: [[Prediction Engine Data Ownership]]. Conceptual entities
(no migrations): [[Prediction Engine Data Concepts]]. Constraints:
[[Prediction Engine Safety and Privacy]].

## Later (gated)

- [ ] Personalization models — **gated** on enough consented feedback existing.
- [ ] Additional divination systems — **gated** on the core engine being
      reliable. Numerology, I Ching, and Human Design are explicitly *not*
      prioritized during the prediction-engine phase.
- [ ] Optional semantic index over a curated astrology research library — not
      required for the first engine version, and never a replacement for
      structured calculation. See [[Prediction Engine Data Ownership]].

## Deployment track (updated 2026-07-20, Update 4.0.4)

Authoritative live status: [[Deployment Status and Blockers]]. This section only
sequences the work; do not duplicate the blocker list here.

- [x] **Update 4.0.3 — Vercel Deployment Foundation.** Reusable request handler,
      local and Vercel entry points, Vercel environment classification, Ollama
      disabled on deployments, durable-storage rules, `deploy:check`.
      Implementation complete locally; Preview blocked.
      See [[Vercel Deployment Foundation]].
- [x] **Update 4.0.4 — Orbit Core Portability.** One runtime interface behind
      which the Swiss Ephemeris executable is resolved per platform; a static
      `linux-x64` build added and verified in a Linux container; calculation
      parity with macOS exact (max longitude drift 0.0° across 440 values);
      Vercel packaging fixed so the engine actually ships; `deploy:check` and
      `env:check` repaired. See [[Orbit Core Portability]] and
      [[Orbit Core Runtime Portability]].
- [x] **Update 4.0.4.1 — Vercel Project Link Repair.** Removed an accidental
      link to the unrelated `the-lorehouse` Vercel project, cleaned its
      downloaded Preview environment out of the Orbit tree, removed a
      Vercel-injected OIDC token from `.env.local`, pinned Node to `22.x`, and
      added link/checkout guards so `deploy:check` blocks a repeat. Branch
      pushed; repository still private. See [[Vercel Project Link Repair]].
- [x] **Update 4.0.4.2 — Vercel Build Verification.** Linked to `orbit-axis`;
      first real `npx vercel build` succeeded with output directory `public` and
      runtime `nodejs22.x`. Fixed three defects the real build exposed, including
      a macOS executable being packaged into the Linux function. Built artifact
      run on Linux x64 with a real calculation. See [[Vercel Build Verification]].
- [ ] **Owner-only Preview enablement.** Branch push is done. Remaining:
      the `orbit-axis` project now exists and is linked. Remaining: create a
      disposable Preview Supabase project, set Preview variables, apply the
      hosted Ask Orbit migration, verify Preview RLS, configure auth redirects.
      None of these can be done from the repository.
- [ ] **Swiss Ephemeris licensing decision.** Unresolved, and a hard gate for
      any publicly reachable deployment. Repository privacy does not resolve it.
      See [[Swiss Ephemeris Integration]].
- [ ] **First private Preview Deployment**, then verify before calling it
      healthy.

## Open platform track (Update 5.0, in progress)

Live detail: [[Development Log — 2026-07-21 Open Platform Foundation]].

- [x] **Session 1 — engine extraction.** Deterministic calculations moved to a
      separate AGPL-3.0 repository with parity proven on macOS and Linux.
      See [[Orbit Axis Engine Architecture]].
- [x] **Session 2 — engine integration.** The application consumes the engine as
      a package; duplicated calculation code deleted; Vercel build re-verified
      end-to-end on Linux.
- [ ] **Session 3 — versioned API**, account deletion, version-one feature
      flags, and legal/source pages.
- [ ] **Publication.** Both repositories are built and clean; publishing is
      deliberately pending owner review because it is permanent and AGPL makes
      the whole application source public.

## Orbit Axis Intelligence track (added 2026-07-20)

The modular AI platform plan. Authoritative detail, system responsibilities,
and confirmed/open decisions live in [[Orbit Axis Intelligence Current Plan]] —
this section only sequences the work. Planned, not started.

### Required first

- [ ] Orbit Core calculation interface (wrap the existing
      [[Chart Calculation Engine]] behind a replaceable interface) —
      **recommended next technical task (Update 4.1).** Update 4.0.4 already
      established the *runtime* half of this boundary
      ([[Orbit Core Runtime Portability]]); 4.1 adds the versioned calculation
      interface and transit synthesis on top. Start only once Preview is
      healthy.
- [ ] Immediate chart generation (chart shown before any AI interpretation)
- [ ] Supabase chart storage (calculation versions + saved results)
- [ ] Orbit Chat access to active chart data (permission-aware, no re-telling)
- [ ] Initial approved astrology knowledge base
- [ ] Knowledge citations and source tracking
- [ ] Local Researcher database (SQLite prototype)
- [ ] Research review queue
- [ ] Database routing rules (local vs Supabase, deterministic)
- [ ] Knowledge Merge workflow (reviewed, reversible, audited)
- [ ] Skill definitions and evaluations
- [ ] Security boundaries (Chat permissions, untrusted web input, RLS)
- [ ] Calculation verification
- [ ] Logging and error handling

### Useful soon

- [ ] Scheduled trend research (controlled jobs, approved sources)
- [ ] Local PostgreSQL + pgvector
- [ ] Mythology knowledge expansion
- [ ] Religious and cultural knowledge structure
- [ ] Orbit Studio's six initial content formats (draft + review only)
- [ ] Website publishing workflow
- [ ] Instagram draft workflow
- [ ] Learn lessons
- [ ] Personalized push notifications
- [ ] Chat suggestions
- [ ] Paid feature entitlements
- [ ] Hosted model strategy

### Future expansion

- [ ] Advanced astrological techniques
- [ ] Large-scale mythology and religious knowledge graph
- [ ] Automated low-risk content scheduling
- [ ] Social analytics
- [ ] Multiple research workers
- [ ] Model routing and fine-tuning
- [ ] Public Orbit Axis social persona
- [ ] Interactive 3D sky mapping (Orbit Sky)
- [ ] AR sky overlays (Orbit Sky)
- [ ] VR or immersive Orbit Sky experiences

### Not necessary for the first version

Training a foundation model from scratch · unrestricted autonomous agents ·
automatic production knowledge replacement · fully automated social posting ·
automatic replies to sensitive public conversations · AR or VR development ·
complex multi-database synchronization without explicit rules · a separate
graph database unless usage proves it necessary.

## App Store release track (added 2026-07-19)

A separate track from the feature roadmap above. Audited in
[[App Store Release Readiness]]; blockers in [[Known Issues — App Store Blockers]].

**Current verdict: not ready for native iOS work.** Orbit Axis is a web app with
no mobile packaging of any kind. These phases have hard dependencies — each
depends on the one before it.

### Phase R0 — Decisions (owner; blocks everything)
- [ ] Swiss Ephemeris licence: buy Professional (~CHF 750) or replace the engine
- [ ] Where charts are calculated (server-side recommended)
- [ ] Packaging strategy (Capacitor recommended)
- [ ] Free v1 (no StoreKit) · no Google sign-in in v1
- [ ] Apple Developer Program enrolment
      See [[Decision Log]].

### Phase R1 — Reachable backend
- [ ] Deploy the Node server (HTTPS, domain); push the 17 local commits
- [ ] Apply the Ask Orbit migration to the hosted database (owner-approved)
- [ ] Ask Orbit uses the deterministic presenter; never calls localhost
      See [[Architecture Notes — iOS Constraints]].

### Phase R2 — Legal and account obligations
- [ ] Privacy policy + Terms of Use published and linked
- [ ] Account deletion, end to end, verified in the database
- [ ] Disclaimers; sweep absolute/prediction language
      See [[Privacy and Data Inventory]].

### Phase R3 — Native shell
- [ ] Xcode 26 / iOS 26 SDK (already mandatory since 2026-04-28)
- [ ] Bundle ID, icon, launch screen, safe areas, dark mode
- [ ] Privacy manifest; remove dev routes from production builds

### Phase R4 — Offline, accessibility, TestFlight
- [ ] Honest offline set with timestamps and retry
- [ ] VoiceOver + Dynamic Type passes
- [ ] Simulator → device → TestFlight
      See [[Testing Plan — iOS Release]].

### Phase R5 — Submission
- [ ] App Store Connect metadata, screenshots of the real product
- [ ] Reviewer demo account + notes (no Ollama, no local server)
- [ ] Differentiation story for Guideline 4.3(b) fortune telling

**Recommended v1 scope:** Home, Me, Ask Orbit, History, Settings.
Cut Tarot, Learn, and News — they are shells today and read as placeholder
content under Guideline 2.1(a).

Release readiness is separate from: public production approval, hosted
migrations, Swiss Ephemeris licensing, custom domains, monetisation, analytics,
and legal review.
