# Ask Orbit Foundation (Update 4.0)

Branch: `feat/orbit-axis-ask-orbit-foundation`
Date: 2026-07-17

Update 4.0 turns the free-form "Ask Orbit Axis" chat into **Ask Orbit** — a
guided astrology consultation where every answer is grounded in the user's
active chart and the current sky, and shows the evidence behind it. It builds on
the reconciled base from [[Orbit Branch Reconciliation]].

## What users can now do

- Open **Ask Orbit** from the primary navigation and see a calm empty state: the
  active chart being used, a short explanation, and context-adaptive suggested
  questions.
- Ask a personal question in plain language (multiline input; Enter sends,
  Shift+Enter adds a line; a Stop control cancels an in-flight answer).
- Read a structured answer: a **direct answer**, a short **interpretation**, a
  **reflection**, and a collapsible **"Why Orbit Said This"** panel listing the
  natal placements, houses (when reliable), aspects, current transits, season,
  retrogrades, and any birth-time limitation the answer used.
- Start a new conversation and reopen recent ones from an owner-scoped history
  drawer. A failed answer keeps the question and is clearly marked as failed.

## How evidence is selected

A deterministic **astrology context engine** (`lib/ask-orbit/context-engine.js`)
does the work before any wording:

1. **Classifies** the question into one or more topics (general daily,
   natal-placement, relationships, career/purpose, emotional patterns, current
   transit, timing, house topic, aspect pattern, clarification).
2. **Selects** only relevant evidence from the already-computed natal chart,
   the natal aspects, and the current sky (reusing `personalTransits()` from the
   fortune engine — no second calculation, no second active-chart system).
3. **Ranks** evidence by relevance: exact aspects above wide ones, major points
   (Sun, Moon, Rising, chart ruler, personal planets) above outer planets,
   tighter transit orbs above looser ones, plus a bonus when a factor matches
   the question's topic or a body it names.
4. **Produces a typed structured result** — `questionType`, `activeChartId`,
   `detailMode`, `birthTimeReliability`, ranked `evidence`, `limitations`, and an
   `answerPlan` (direct answer, themes, reflection prompts).

## How Ollama or the fallback provider is used

The engine is the source of astrological truth; the language layer only rewords.

- The **deterministic presenter** (`presenter.js`) always produces a complete
  answer and the evidence labels. Ask Orbit is fully functional with no model.
- If a local **Ollama** model is available, `ask-provider.js` sends it the
  structured plan + evidence and asks only for fluent prose. The reply is
  validated (non-empty, length-capped, no HTML/markup/JSON) before rendering;
  any timeout, error, or suspicious output falls back to the deterministic
  answer. The evidence list always comes from the engine, never the model.
- A neural network is **not** required for Update 4.0. No paid/remote API, no
  hardcoded secrets, and no external network call unless a local Ollama endpoint
  is configured and reachable.

## What is stored

Owner-scoped, RLS-enforced (`ask_conversations`, `ask_messages`). Each message
records its question, answer, **evidence**, question type, birth-time
reliability, detail mode, active chart id, engine version, and status — enough to
reproduce *why* an answer was generated and to keep old answers understandable
after later engine updates. Ollama receives only the compact plan + evidence
(no journal, last name, coordinates, or tokens) and is never treated as memory.
Logging stays metadata-only.

A reversible migration was created but **not applied to production**; until it is
applied, local history uses an in-memory store fallback (documented trade-off).

## How birth-time reliability changes answers

- **exact / reported** — houses, angles, and Rising used normally.
- **approximate** — still used, but with a caution and reduced confidence.
- **unknown** — Rising, houses, and angle-based conclusions are removed; the
  answer uses planetary signs and aspects and explains the limitation when it
  matters. Unknown time never fabricates a Rising sign or house.

## What Simple and Advanced modes change

Simple gives plain evidence labels and no degree-level detail. Advanced adds
signs, houses, degrees, orbs, and applying/separating state — but only when those
values actually exist. Legacy `Balanced` continues to normalize to `Simple`.

## Known limitations

- The optional Ollama reword path was exercised through unit tests and the
  isolated adapter, not against a live local model in this environment.
- The full signed-in browser round-trip (real suggestions/ask/history) was
  verified at the API and service layers via automated tests; end-to-end
  browser sign-in requires real Supabase credentials that were intentionally not
  used.
- History is a compact first version: list + reopen + new. No rename, search,
  delete, or pagination yet.
- Interpretation vocabulary is intentionally general and symbolic; it is not yet
  a full transit-synthesis or theme-merging engine (that is Update 4.1).

## Recommended next update

**Update 4.1: Transit Synthesis Engine** — rank and combine transits and timing
factors into dominant life themes (applying / exact / separating, strength
scores, start/peak/end dating), so answers describe developmental periods rather
than isolated aspects. Smallest valuable scope: add applying/exact/separating
state and a strength score to each transit in the context engine, then merge
transits that hit the same natal point into one themed evidence group — reusing
the existing `personalTransits()` output and the current evidence/ranking shape.
