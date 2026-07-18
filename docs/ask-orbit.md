# Ask Orbit (Update 4.0)

Ask Orbit is a guided astrology consultation. A signed-in user asks a personal
question in plain language and gets an answer grounded in their **active natal
chart** and the **current sky**, with the evidence behind it shown in a
collapsible **"Why Orbit Said This"** panel.

The load-bearing idea: **the astrology engine decides what is true; a language
provider only decides how to word it.** The engine calculates and selects real
factors before any wording happens, and the optional language model may never
invent a placement, aspect, house, retrograde, or transit.

## Data flow

```
User question
    ↓
Question classification            classifyQuestion() → ["relationships", …]
    ↓
Active-chart + current-sky lookup  chartSvc.getActive(owner), currentSky()
    ↓
Evidence selection + ranking       selectEvidence() (relevance-scored, filtered
    ↓                              by birth-time reliability)
Astrology rules + interpretation   buildAnswerPlan() → { directAnswer, themes,
    ↓                              reflectionPrompts }
Structured answer plan             buildAskContext() → typed context object
    ↓
Language-generation provider       presentAnswer() (deterministic) + optional
    ↓                              Ollama reword (generateAskAnswer)
Answer + "Why Orbit Said This"     evidence labels from the deterministic engine
```

Stages 1–5 are deterministic and testable. The language provider is the only
non-deterministic stage, which is why the structured context — not the generated
prose — is what gets stored.

## Modules (`lib/ask-orbit/`)

| File | Responsibility |
| --- | --- |
| `context-engine.js` | Classify the question, select + rank evidence, filter by birth-time reliability, build the typed answer plan. Reuses `personalTransits()` (fortune engine) and the natal/sky shapes — no second calculation, no second active-chart system. |
| `presenter.js` | Deterministic formatter: renders a complete answer (direct / interpretation / reflection) and the human-readable evidence labels. This is the default provider and the fallback. |
| `ask-provider.js` | The single language-generation seam. Reuses the existing `createLocalLLMProvider()`. Passes the structured plan + evidence to Ollama, validates the reply (non-empty, length-capped, no HTML/markup/JSON), and falls back to the deterministic answer on any timeout/error/rejection. |
| `suggestions.js` | Context-adaptive suggestion chips for the empty state. |
| `service.js` | Orchestrates one turn end-to-end; store-agnostic; persists evidence + engine version. |
| `store.js` | Owner-scoped Supabase REST store + an in-memory store (tests and local-dev fallback). |
| `api.js` | `handleAskRoute()` — `{ status, body }` dispatch, mirroring the charts/fortune modules. |

## Routes

All require a Supabase Auth session (`requireAuth`), owner derived server-side.

| Method | Route | Purpose |
| --- | --- | --- |
| GET  | `/api/ask/suggestions` | Empty-state active chart + adaptive suggestions |
| GET  | `/api/ask/conversations` | List conversations (owner-scoped) |
| POST | `/api/ask/conversations` | Start a new conversation |
| GET  | `/api/ask/conversations/:id` | One conversation + its messages |
| POST | `/api/ask` | Ask a question (persisted, evidence-backed) |

## Birth-time reliability

Reliability comes from the saved chart (`time_accuracy`), never from the client.

- **exact / reported** — houses, angles, and Rising are used normally.
- **approximate** — houses/angles/Rising are still used, but a caution
  limitation is attached and their relevance is reduced (no overconfident claims).
- **unknown** — Rising, houses, and angle-dependent evidence are removed
  entirely; the answer still uses planetary signs and aspects, and the
  limitation is explained when it materially affects the answer.

## Simple vs Advanced

The existing detail preference is respected (legacy `Balanced` normalizes to
`Simple`, exactly as elsewhere). Simple gives plain evidence labels with no
degrees; Advanced adds signs, houses, degrees, orbs, and applying/separating
state — but only when those values actually exist. No technical value is ever
fabricated.

## Storage & privacy

- Conversations and messages are **owner-scoped** (RLS, `owner_id = auth.uid()`),
  consistent with `daily_fortunes` and `birth_profiles`.
- Each message stores its **evidence, question type, birth-time reliability,
  detail mode, active chart id, engine version, and status** — enough to
  reproduce *why* an answer was generated, and to keep old answers
  understandable after later engine updates.
- A failed generation is stored as a `failed` message so the user's question is
  never lost; it is surfaced as a failure, never as success.
- Ollama receives only the compact structured plan + the already-selected
  evidence (no journal, no last name, no coordinates, no tokens). It is not
  permanent memory or authoritative storage, and private readings are never
  silently used to train a model.
- No secrets, system prompts, provider config, raw seeds, or another account's
  data are exposed. Chat logging stays metadata-only (no question/answer bodies).

See [`data-boundaries.md`](data-boundaries.md) and [`local-llm.md`](local-llm.md).

## Provider setup

No new configuration is required — Ask Orbit works out of the box on the
deterministic presenter. To enable the optional Ollama reword, run Ollama
locally (same config the rest of the app uses):

| Variable | Default | Effect |
| --- | --- | --- |
| `ORBIT_LOCAL_LLM_ENABLED` | `true` | Master switch for local-LLM features. |
| `ORBIT_OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama endpoint. |
| `ORBIT_LOCAL_MODEL` | *(unset)* | Preferred model; Orbit never downloads one. |
| `ORBIT_ASK_USE_MODEL` | `true` | Set `false` to force the deterministic answer only. |

No paid/remote API is used, and no external network call happens unless a local
Ollama endpoint is configured and reachable.

## Database migration

`supabase/migrations/20260717120000_ask_orbit_conversations.sql` creates
`ask_conversations` and `ask_messages` with RLS + authenticated grants. It is
**reversible** (rollback block at the bottom).

As of Update 4.0.1 it has been applied to a **local** database and verified
there; it has **not** been applied to the hosted project. Apply it locally with:

```bash
supabase start
supabase migration up --local     # non-destructive; never `db push`
```

See [`ask-orbit-local-setup.md`](ask-orbit-local-setup.md) for the full ordered
walkthrough.

## Storage modes (honest by construction)

`usesPersistentStore(auth)` in `store.js` is the single source of truth;
`askStorageMode()` and `askStoreFor()` are both derived from it, so the mode the
UI reports can never drift from the store actually used (a test enforces this).

| Mode | Store | Meaning |
| --- | --- | --- |
| `persistent` | Supabase | Conversations survive a server restart. |
| `session` | in-memory | Local dev / tests. History clears on restart, and the UI says so. |

A save that fails is never reported as success: the answer is still returned, but
`persisted: false` and a plain-language note tell the user it wasn't saved. The
question is never lost, failed answers stay marked failed, and retrying reuses
the same conversation rather than duplicating the question.

## Testing

- `test/ask-orbit.test.js` (26) — classification, evidence selection/ranking,
  reliability filtering, unknown-time house removal, approximate caution,
  Simple/Advanced output, current-sky fallback, no fabricated values,
  determinism; service creation/reopen/ownership/validation/failed-persistence.
- `test/ask-migration.test.js` (7) — RLS + policy + grant + reproducibility +
  rollback validation, and the route-level auth guard.
- `test/reconciliation.test.js` (8) — proves both reconciled feature lines
  survived (returning-user flow + Me planet grid).
- `test/ask-storage-fallback.test.js` (12) — storage mode reporting, in-memory
  vs persistent, database-unavailable behavior, no false persistence, failed
  saves, retry without duplicates.
- `test/ask-provider.test.js` (17) — prose-format opt-out, output validation
  (markup/JSON/code fences rejected), think-block stripping, timeout/offline/
  error fallbacks, evidence immutability, and a LIVE Ollama case that skips when
  no model is installed.
- `test/ask-supabase-integration.test.js` (11) — REAL local Supabase: RLS
  anonymous + cross-user rejection, persistence across a new service instance,
  message ordering, unknown/approximate birth-time storage, failed-message
  persistence. Skips automatically without a local stack and refuses any
  non-loopback host.
