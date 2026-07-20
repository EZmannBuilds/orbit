# Orbit Axis Roadmap

Current implemented foundation:

- deterministic daily fortune
- current sky and Moon phase display
- My Chart preview calculations
- Simple / Advanced presentation modes (Balanced removed in Update Two)
- Fortune History route under More
- Local Intelligence chat and diagnostics
- streamed Ask Orbit Axis with stop/retry, compact active-chart context, and a deterministic fast path + offline fallback
- returning-user chart restoration (no repeat onboarding) with saved-chart management from Home
- primary six-section app shell with central Ask action

## Completed

- **Update 3.3 — Me chart management.** Saved-chart management on the Me page:
  add, edit, activate, delete-with-confirmation, and the shared accessible chart
  modal. See [[Me Page and Chart Management]].
- **Update 3.3.1 — Me Planet Grid Redesign.** "The Keys to Your Chart"
  (Rising/Sun/Moon) plus a Mercury–Pluto planet grid; all planets visible in
  Simple mode; detail modals; responsive at ~375/768/1280px. See
  [[Me Planet Grid Redesign]].
- **Update 3.3.2 — Orbit Branch Reconciliation.** Reconciled the returning-user
  and Me-planet-grid feature lines onto one clean base and cut the
  `feat/orbit-axis-ask-orbit-foundation` integration branch. The history was
  already linear (018efe1 contained e753165), so no merge conflicts occurred.
  See [[Orbit Branch Reconciliation]].
- **Update 4.0 — Ask Orbit Foundation.** A dedicated Ask Orbit experience: a
  guided astrology consultation where a user asks personal questions and gets an
  answer grounded in their active natal chart, birth-time reliability, current
  sky, relevant placements, houses (when reliable), natal aspects, and current
  transits — with a "Why Orbit Said This" evidence panel, Simple/Advanced
  wording, and an initial conversation history. See [[Ask Orbit Foundation]].
- **Update 4.0.1 — Ask Orbit Live Integration Hardening.** Closed the gaps the
  4.0 report left open: the conversation migration was applied to a local
  database, the whole signed-in flow was verified against a real session and real
  Postgres (including a server restart), RLS cross-user isolation was proven, and
  the Ollama adapter ran live against `qwen3:14b`. Two real defects surfaced and
  were fixed — the provider was being asked for JSON so Ask Orbit never received
  prose, and model output containing markup was sanitized instead of rejected.
  Storage state is now reported honestly instead of implying permanence. See
  [[Ask Orbit Live Integration Hardening]].
- **Update 4.0.2 — Environment Safety and Database Target Guard.** One resolver
  now decides the environment (`local` / `test` / `preview` / `production`) and
  classifies the configured database, and every dangerous path asserts against it
  before acting: server startup, migrations, seeds, disposable users, the test
  suite, and vault pushes. Plain-language errors name the safe command and never
  print a key. New `dev:local`, `env:check`, `test:local`, and
  `supabase:migrate:local` commands make the safe path the easy one. See
  [[Environment Safety and Database Target Guard]].

### Why 4.0.2 was inserted between 4.0.1 and 4.1

Real integration testing in Update 4.0.1 revealed that an ordinary `npm start`
could target the hosted production database, because `.env.local` points there
and the app loads it automatically. Safety depended on a developer remembering
per-process overrides.

That is worth pausing feature work for:

- Future automated agent work must be structurally unable to write to production
  by accident, not merely unlikely to.
- Database safety is a prerequisite for moving *faster* on features — it makes
  experiments cheap and reversible.
- Guards remove reliance on anyone remembering a manual override.

The completed Ask Orbit updates keep their numbering; this is an inserted safety
update, not a renumbering.

- **Update 4.0.3 — Vercel Deployment Readiness.** Separated the request handler
  (`lib/server/create-app.js`) from the local listener (`server.js`) and added a
  Vercel function entry point (`api/index.js`), so local and deployed Orbit run
  the same code. The 4.0.2 resolver was extended — not replaced — to recognise
  Vercel, with a derived `isDeployed` flag that disables every development
  affordance regardless of environment name. Ollama is unreachable from a
  deployment by construction (the provider factory returns an inert, no-network
  stub), and the in-memory Ask store is refused where durable storage is
  required, so a failed save is reported honestly instead of silently lost.
  Session cookies are `Secure` behind Vercel's proxy. New read-only
  `npm run deploy:check` grades blockers. **Nothing was deployed, pushed, or
  migrated remotely.** See [[Vercel Deployment Readiness]].

### Deployment readiness is not deployment approval

Update 4.0.3 makes the repository technically ready to connect to Vercel. It
does **not** mean production deployment is approved, hosted migrations are
applied, a Preview Supabase project exists, Swiss Ephemeris licensing is
resolved, legal review is complete, monetization or analytics are active, a
custom domain is configured, or Orbit Intelligence hosting has been chosen.

Open blockers, reported honestly by `npm run deploy:check`:

- the deployment branch is not pushed to GitHub
- no approved Preview Supabase project exists
- the hosted Ask Orbit migration is unapplied, so Ask answers generate but do
  not save
- the bundled Swiss Ephemeris binary is macOS/arm64 and cannot run on Vercel's
  Linux x86-64 functions, which blocks *every* astrology feature
- Swiss Ephemeris licensing remains unresolved and undocumented

The deployment work also creates the production foundation that
[[Orbit Axis Intelligence Current Plan]] will need, while implementing none of
Orbit Researcher, Orbit Knowledge ingestion, Orbit Studio, or Orbit Sky.

## Next

- **Update 4.1 — Orbit Core Interface and Transit Synthesis Foundation.** Turn
  individual transits into coherent, timed themes behind a documented,
  versioned calculation interface. Do not begin until the private Vercel
  Preview is healthy. Smallest valuable scope:
  - a documented, versioned Orbit Core calculation interface
  - structured natal-chart and transit output
  - applying, exact, and separating transit states
  - transit-strength scoring
  - grouping multiple transits by natal target
  - combined transit themes
  - Supabase-compatible calculation records
  - Orbit Chat access to verified active-chart data
  - tests preventing invented dates, degrees, timing, placements, or aspects

  Explicitly out of scope for 4.1: Orbit Researcher, Orbit Studio, autonomous
  knowledge growth, social posting, and Orbit Sky.

## Planned

- **Update 4.2 — Reading Memory and Feedback.** Continuity across readings,
  per-answer relevance/usefulness feedback, and optional private life-event
  notes that improve relevance without fabricating astrological evidence.
- **Update 4.3 — Orbit Knowledge Foundation.** The structured knowledge base
  Orbit reasons over, with provenance for every claim. (Astrology–tarot
  synthesis folds in here once tarot reference data and the daily-card system
  exist.)
- **Update 4.4 — Local Researcher Prototype.** A local-only research loop over
  Orbit Knowledge. No autonomous publishing.
- **Update 4.5 — Orbit Skills and Evaluation Framework.** Named, versioned
  skills with measurable evaluations, so capability changes are provable rather
  than asserted.
- **Update 4.6 — Orbit Studio Content Pipeline.** Reviewed content production.
  Human approval remains required.
- **Update 5.0 — Launch Measurement Foundation.** Product analytics and privacy
  consent only. No billing.
- **Update 5.1 — Orbit Plus and Stripe Test Billing.** Test-mode billing and
  entitlements, kept separate from production billing readiness.
- **Update 5.2 — Controlled Beta Readiness.** Beta operations, feedback intake,
  and security review.

## Future

Directional, not scheduled. Nothing here is committed work.

- expanded mythology and religious knowledge
- hosted production inference
- advanced research automation
- automated low-risk publishing
- interactive 3D Orbit Sky
- AR sky overlays
- immersive or VR Orbit Sky

### Why measurement and monetization were split

An earlier combined "Launch Measurement and Monetization" proposal bundled
analytics, privacy consent, billing, entitlements, experiments, licensing,
feedback, security auditing, and beta operations into one update. Those are
separate systems with different testing and legal requirements, so they are now
phased:

- Orbit's core personalized experience should be persistent and verified before
  billing is introduced — which is what Update 4.0.1 established.
- Measurement must exist before monetization experiments, otherwise pricing and
  packaging decisions have no evidence behind them.
- Stripe **test** billing (5.1) is deliberately separate from production billing
  readiness; passing test mode is not launch approval.
- Swiss Ephemeris licensing remains an open launch gate. It must not be
  described as resolved without written proof of the applicable licence.

No standalone monetization planning document exists in this repository or the
Obsidian vault, so there was nothing to mark as superseded; this section is the
record. If such a document surfaces later, mark it superseded by the phased
5.0 → 5.1 → 5.2 sequence rather than deleting it.

## Business research and strategy

Startup-potential and market research belongs here, as background that informs
prioritisation — it does not replace the product-development update sequence
above. No prior Orbit Axis startup-potential research document was found in this
repository or the vault at the time of Update 4.0.1; this section is the place
for it when it is written.

## Architectural direction (Update 4.0 onward)

Ask Orbit separates *what is true* (calculated by the deterministic astrology
engine) from *how it is worded* (an optional language-generation provider):

```text
User question
    ↓
Question classification
    ↓
Relevant chart and transit retrieval
    ↓
Astrology rules and interpretation evidence
    ↓
Structured answer plan
    ↓
Language-generation provider
    ↓
Answer plus "Why Orbit Said This"
```

Clarifications that constrain this direction:

- The astrology engine determines the evidence and the interpretation basis.
- The language model only explains the structured result in natural language.
- The model must not independently invent chart facts (placements, aspects,
  retrogrades, houses, transits, or timing).
- A neural network is **not** required for Update 4.0 — a deterministic
  formatter produces a complete answer, and the local Ollama adapter is an
  optional presentation layer.
- Ask Orbit begins as a focused astrology advisor, not an unrestricted general
  chatbot.
- Medical, legal, financial, and guaranteed-event predictions are out of scope;
  Orbit presents symbolic reflection, never guaranteed fate.

Remaining product work:

- saved-chart manager UI
- stable daily tarot card system
- one-card, three-card, and custom tarot readings
- structured Learn courses, chapters, lessons, and progress
- verified News ingestion and source validation
- synastry and compatibility for saved charts
- richer chat grounding against active chart, current sky, selected comparisons, tarot symbolism, and verified article text
- settings for timezone, zodiac system, house system, privacy, account, data export, and sign out

Responsive expectations:

- 375px: persistent bottom navigation, raised Ask button, single-column content, safe-area padding
- 768px: bottom navigation remains clear, cards widen without crowding
- 1280px: left rail with visible labels and readable content width

Reduced motion should remove looping orbit and glow animations while preserving functionality.
