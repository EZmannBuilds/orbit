# Ask Orbit Live Integration Hardening (Update 4.0.1)

Branch: `feat/orbit-axis-ask-orbit-integration-hardening`
Date: 2026-07-18

Update 4.0 shipped Ask Orbit with strong unit coverage but five open integration
gaps. This update closed them by running the real thing: a real local database,
a real signed-in session, a real server restart, and a real local model.

## What was actually verified (not stubbed)

- **The migration is applied.** `supabase migration up --local` applied
  `20260717120000_ask_orbit_conversations.sql` to the local database. It was the
  only pending migration; the other 15 were already applied.
- **Real signed-in flow.** A disposable local account created a synthetic chart
  through `/api/charts`, activated it, and asked questions through `/api/ask`.
  29 end-to-end checks passed against the running server.
- **Persistence survives a restart.** The server was stopped and started again;
  signing back in reopened the pre-restart conversation with all six evidence
  items, the engine version, and chart traceability intact. This proves Supabase
  is genuinely the store, not memory.
- **Ownership is enforced by the database.** A second disposable user could not
  read, update, or delete the first user's conversation, and could not insert a
  row with a spoofed `owner_id`. Anonymous reads and writes are blocked.
- **The local model actually runs.** `qwen3:14b` produced a real reworded answer
  in ~10s, with the evidence list byte-identical to the deterministic engine's.

## Two real defects found and fixed

Both were invisible to unit tests because they only appear against a live model.

1. **Ask Orbit never received prose.** `provider.generate()` defaults to
   `format: "json"` (correct for the vault assistant, wrong here), so Ollama
   returned a JSON object, validation rejected it, and Ask Orbit silently fell
   back to the deterministic answer every single time. The provider now honours
   an explicit `format: "text"` opt-out; structured callers still get JSON.
2. **Markup was sanitized instead of rejected.** Model output containing
   `<script>` was stripped and then accepted. Output containing markup, code
   fences, or JSON is now rejected outright and the deterministic answer is used.
   A `<think>` block from reasoning models is stripped before validation.

A third, smaller issue was found in the browser: the "Why Orbit Said This"
section never actually collapsed, because setting `display` on a direct child of
`<details>` overrides the native collapse. The flex layout is now bound to the
`[open]` state.

A fourth: Ask Orbit cached its first gate decision, so signing in left the
"Sign in to ask Orbit" panel on screen until a manual reload. Gate states are now
re-resolved on every visit, and auth changes reset the panel.

## Honest storage state

Ask Orbit no longer implies that history is permanent when it isn't.

- `usesPersistentStore()` is the single source of truth; the reported mode and
  the store actually used are derived from it, so they cannot drift. A test
  enforces this.
- `persistent` means Supabase — conversations survive a restart.
- `session` means the in-memory fallback for local development and tests, and
  the UI says plainly that conversations will clear.
- If a save fails, the answer is still shown but is explicitly **not** reported
  as saved ("This answer couldn't be saved to your history."). The question is
  never lost, failed answers stay marked failed, and a retry into the same
  conversation does not duplicate the user's question.

## What Ollama changes, and what works without it

Ollama only rewords. The astrology engine selects and ranks the evidence first,
and the evidence shown to the user always comes from the engine — a test asserts
the model cannot replace or mutate it. With Ollama absent, offline, slow,
cancelled, or returning junk, Ask Orbit answers normally using the deterministic
formatter. Only the prose style changes.

Provider payload was audited: it contains the answer plan and the selected
evidence only — no raw chart dump, no tokens, no Supabase configuration, no
account data.

## Known limitations

- Verification used a **local** Supabase stack on ports 553xx. The hosted
  project was never touched: no `supabase db push`, no migration against
  production, no destructive command.
- `.env.local` still points at the hosted project. Local runs override
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` per-process; the file was not modified.
  Anyone running the app without that override is talking to production.
- The live-model test covers one model (`qwen3:14b`) on one machine. Timeout,
  cancellation, malformed output, and offline paths are covered by stub tests
  that run everywhere.
- Cancellation mid-generation falls back safely, but a partially streamed answer
  is not resumed — `/api/ask` is a single request/response, not a stream.

## Recommended next update

**Update 4.1: Transit Synthesis Engine** — applying/exact/separating states,
transit-strength scoring, evidence grouped by natal target, clearly merged
themes, and tests that prevent invented dates or degrees.
