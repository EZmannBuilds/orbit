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

## Current

- **Update 4.0 — Ask Orbit Foundation.** A dedicated Ask Orbit experience: a
  guided astrology consultation where a user asks personal questions and gets an
  answer grounded in their active natal chart, birth-time reliability, current
  sky, relevant placements, houses (when reliable), natal aspects, and current
  transits — with a "Why Orbit Said This" evidence panel, Simple/Advanced
  wording, and an initial conversation history. See [[Ask Orbit Foundation]].

## Planned

- **Update 4.1 — Transit Synthesis Engine.** Rank and combine transits and
  timing factors into dominant themes (applying/exact/separating, strength
  scoring, start/peak/end dating) so answers describe developmental periods, not
  isolated aspects.
- **Update 4.2 — Reading Memory and Feedback.** Continuity across readings,
  per-answer relevance/usefulness feedback, and optional private life-event
  notes that improve relevance without fabricating astrological evidence.
- **Update 4.3 — Astrology and Tarot Synthesis.** Connect the astrology evidence
  model to tarot symbolism once the tarot reference data and daily-card system
  exist.

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
