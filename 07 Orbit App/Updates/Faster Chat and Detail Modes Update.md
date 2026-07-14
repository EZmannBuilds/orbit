# Faster Chat and Simplified Detail Modes (Update Two)

Branch: `feat/orbit-axis-fast-chat-detail-modes`
Starting commit: `524f4e6` (Merge Home and Current Sky redesign)

Ask Orbit Axis now streams responses, keeps a compact and privacy-scoped
context, reuses natal-chart calculations, and degrades gracefully when Ollama is
offline. The astrology detail system was simplified from three modes to two.

## Feature goals

- Immediate visual acknowledgement after sending a message.
- Streamed assistant text instead of waiting for a full response.
- Compact, active-chart-scoped astrology context.
- No repeated natal-chart recalculation during ordinary conversation.
- Useful deterministic answers when the local model is unavailable.
- Clear loading / streaming / reconnecting / fallback / offline states.

## Out of scope (not in this branch)

Expanded Me page, natal chart wheel, new planets/points/asteroids/houses,
compatibility/synastry, tarot engine, news ingestion, Learn courses, another LLM
provider, cloud AI APIs, a model marketplace, conversation-memory redesign, and
any major navigation redesign.

## Detail modes: Balanced removed

Supported levels are now **Simple** (default) and **Advanced**. "Balanced" was
removed everywhere: Supabase check constraint, defaults, service/API validation,
frontend selector, `data-detail` CSS, fortune factor phrasings, and vault docs.

- Migration policy: any `Balanced` value (any casing) → **Simple**, never
  Advanced (Advanced can expose degrees/coordinates/aspects a user never chose
  to see). Unknown values also normalize to Simple.
- Server: `normalizeDetailLevel()` in `lib/fortune/service.js` is the single
  source of truth; `getDetail` normalizes on read, `setDetail` migrates
  `Balanced`→`Simple` but still rejects genuinely invalid values.
- Client: `normalizeDetail()` in `public/app.js` sanitizes stale localStorage /
  cached API values so an old `Balanced` never crashes or blanks the UI.

## Chat streaming protocol

- Transport: **Server-Sent Events** (`text/event-stream`) over the existing
  zero-dependency Node server — no new dependencies, no WebSockets.
- Endpoint: `POST /api/axis/chat/stream`. Available to authenticated users and
  to localhost in dev; never exposes Ollama to arbitrary remote callers.
- Events: `meta` (chart name, detail mode, request id), `delta` (text chunk),
  `notice` (fallback banner), `done` (path + stats), `error` (retryable).

### Browser streaming behavior

User message and an assistant placeholder render immediately. The first `delta`
appears before completion; later chunks append in order. A single assistant
message is finalized (no duplicates). Malformed frames are skipped. Markdown is
rendered through a minimal safe renderer (escape-first; bold/italic/inline-code/
fenced code only — no raw HTML or links). Auto-scroll only when the user is
already near the bottom. A browser refresh clears the session-only log, so it can
never leave a permanently "typing" bubble.

### Server streaming behavior

Validates message length + conversation length before opening the stream (so
real errors get real status codes). Streams Ollama deltas as SSE. Aborts the
upstream Ollama generation when the client disconnects (`req` close → Abort
controller). Enforces a request timeout. On a mid-stream failure with no partial
text, emits a deterministic fallback tail instead of a dead stream.

### Ollama streaming behavior

`OllamaProvider.streamChat()` requests `stream: true, think: false` (keeps
qwen3 reasoning out of the stream), parses NDJSON lines, yields
`{type:"delta"}` / `{type:"done"}` / `{type:"error"}`, and NEVER throws — callers
always get a terminal event. Oversized responses are cut off. Cancellation via
`AbortSignal` cancels the upstream request.

## Warmup and keep-alive

- Warmup trigger: once at server start (`warmupModel()`), only if the LLM is
  enabled AND Ollama is already reachable with the configured model installed.
  It issues a tiny `num_predict: 0` request. It will not start Ollama or pull a
  model, never blocks startup, and never fails the app.
- Keep-alive: `ORBIT_LLM_KEEP_ALIVE` (default `10m`) is sent on every chat and
  warmup request so the model stays resident between turns.
- Memory: one primary large model at a time; no parallel heavyweight agents.
  Suited to the 24 GB M4 Air.
- Disable warmup with `ORBIT_LLM_WARMUP=false`; unload immediately with
  `ORBIT_LLM_KEEP_ALIVE=0`.

## Context budget

Deterministic, documented limits (`CONTEXT_BUDGET` in
`lib/local-llm/chat-context.js`): up to 8 recent messages, 800 chars/message,
700-char chart summary, 400-char sky summary, 6000-char total. Truncation
prefers: current user message → recent turns → active-chart essentials → Current
Sky. Old greetings and repeated disclaimers are dropped first.

## Chart-summary contract (allow-list)

Only: nickname, first name, Big Three signs (plus degrees/aspects/placements/
dominant element in Advanced), and birth-time-known status. Never: last name,
email, user/row id, coordinates, provider place id, timezone DB fields, other
saved charts, tokens.

## Current Sky summary contract

Season, Sun/Moon sign, Moon phase + illumination + waxing/waning, retrogrades
(plus degrees in Advanced). Derived from the cached Current Sky snapshot.

## Caches and invalidation

In-memory only (never persisted, never raw rows/tokens):

- Chart-summary cache key: owner · chartId · chart input hash · detail mode.
- Sky-summary cache key: sky version · snapshot hash · detail mode.
- Combined-context cache key: owner · chartId · input hash · snapshot hash ·
  detail mode.

Invalidation is key-based and automatic: an active-chart change (chartId),
chart edit (input hash), detail-mode change (detail), or sky refresh (snapshot
hash) all produce a new key. `invalidateOwnerChart()` clears explicitly too.

## Calculation reuse

Chat reuses the saved chart-calculation cache; Swiss Ephemeris only runs again
when the active chart changes, its input changes, the calc cache is invalidated,
or the Current Sky cache expires. Proven by a `natalComputeCount()` instrument
and a unit test (`test/detail-level.test.js`).

## Deterministic fast path

Narrow, deterministic answers for factual/status questions where the LLM adds
nothing: detail mode, active chart, Sun/Moon/Rising sign, birth-time-known,
Moon phase, "is Ollama online". Anything interpretive returns `null` and routes
to Ollama. Responses are tagged internally as `fast` / `ollama` / `fallback`.

## Deterministic fallback

When Ollama is offline / model missing / times out: a fast, useful reply from
verified facts with the restrained notice "Local model unavailable. Orbit Axis
is using verified chart data only." No invented interpretations, no endless
retry. A bounded health cache (`ORBIT_LLM_HEALTH_CACHE_MS`, default 5s) avoids
hammering the local endpoint.

## Stop and retry

- Stop cancels the browser request, cancels the server stream and the upstream
  Ollama generation, keeps already-streamed text, marks it "Stopped.", and
  re-enables the composer. No duplicate assistant entry.
- Retry re-runs the original user message (current active chart, detail mode,
  sky context) without duplicating the visible user message or creating a
  duplicate completed assistant message.

## Rate limits and concurrency

Per-user: one active generation (`ORBIT_CHAT_MAX_PER_USER`) and 20 messages/min
(`ORBIT_CHAT_RATE_MAX`). Global cap `ORBIT_CHAT_MAX_GLOBAL` (default 2). Excess
requests get a clear 429; other users stay isolated; a client disconnect never
deadlocks the server.

## Timing instrumentation

Dev-safe logs (`[axis-chat]`, toggle `ORBIT_CHAT_LOG=false`): request id, path,
model, detail, cache hit/miss, context char count, time-to-first-token, total
time, cancellation status, fallback reason. Never logs message content, names,
emails, birth data, coordinates, prompts, or tokens.

## Privacy rules

The context builder is the single privacy boundary. System prompt, internal
context object, tokens, service-role key, Geoapify key, raw Ollama config, email,
last name, coordinates, and hidden chain-of-thought are never sent to the model
or returned to the browser. Streamed output is escaped safely.

## Accessibility decisions

`role="status"` live status region; labeled Stop ("Stop generating") and Retry
controls; assistant messages use `aria-live`; predictable focus; reduced-motion
respected (typing animation disabled under `data-motion="reduced"`).

## Responsive decisions

375 / 768 / 1280: no horizontal scroll; input, Send, Stop, and Retry all fit and
stay reachable (Stop measured 68×71px at 375px); streamed text wraps; code blocks
scroll inside their own container; chat column capped at ~900px on desktop;
bottom navigation stays usable.

## Test coverage

New suites: `test/detail-level.test.js`, `test/chat-context.test.js`,
`test/axis-chat.test.js`, `test/ollama-stream.test.js` (mock Ollama HTTP server).
Covers detail migration/normalization, constraint intent, context privacy +
budget + cache invalidation, calculation reuse, fast path, fallback, streaming
(deltas, malformed chunk, timeout, abort, missing model, no system-prompt leak),
warmup, and keep-alive. Full suite: 152 passing (was 112).

## Benchmark results (local, qwen3:14b)

- Time to first visible response — before: ~35.5 s (non-streaming). After: fast
  path < 0.1 s; streamed interpretive first token ~8 s.
- Total generation time — before: ~35.5 s for the same prompt. After: streaming
  begins at ~8 s and completes ~27 s while text is already visible.
- Prompt size — before: vault-retrieval + structured-JSON prompt (large,
  multi-source). After: compact context, ~236 input tokens / ~1018 chars.
- Chart recalculation — none on ordinary follow-ups (calc cache reused).
- Fallback response time — ~50 ms.

## Known limitations

- Chat is session-only (no long-term persistence) by existing product
  convention; refreshing clears the conversation.
- The hosted Supabase security advisor could not be reached via MCP in the build
  environment; `supabase db lint` (schema) is clean and RLS is intact.
- Live Ollama timing depends on local hardware/model state.

## Next recommended update

Optional lightweight conversation persistence (per existing conventions), an
Advanced-mode "show the math" affordance in chat, and streamed tarot reflections
once the tarot engine exists.
