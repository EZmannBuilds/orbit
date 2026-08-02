# Legacy Sun-sign endpoints — deprecated

**Status: Deprecated. Still live, still supported, no removal date.**
Recorded during Dev Update 1.11 (relationship-aware compatibility).

## What is deprecated

Three public, unauthenticated routes score compatibility from **Sun signs
alone** — by counting steps between two signs on the zodiac wheel:

| Route | What it returns | Scorer |
| --- | --- | --- |
| `GET /api/compatibility?a=&b=` | `harmony_score`, `steps_apart`, `aspect` | `signGeometry()` in `lib/symbols.js` |
| `POST /api/query` | `details.harmony_score` when the prompt names two signs | `answerPrompt()` → `signGeometry()` |
| `POST /api/stella/chat` | same as `/api/query` | `answerPrompt()` → `signGeometry()` |

All three predate Orbit having an ephemeris. They read no birth chart, no birth
time, and no planet other than the Sun.

## Why they are deprecated

Dev Update 1.11 shipped full-chart compatibility at
`GET /api/compatibility/compare`, which reads ten bodies across two saved
charts and explains every rating from the specific contacts behind it. The
product's stated position is that Sun-sign compatibility is not a meaningful
answer to the question people are asking.

Keeping a route named `/api/compatibility` that returns a bare `harmony_score`
next to one that does the real work is a standing invitation to confusion — for
a future contributor, for anyone reading the README, and for any external
consumer who assumes the shorter path is the canonical one.

## Why they have not been removed

Removing a live, documented, public endpoint is a breaking change, and the
dependency audit below can only see **this repository**. It cannot see who
calls a public URL from outside. Deleting on that evidence would be guessing,
and a removal date this audit cannot stand behind is worse than no date.

## Dependency audit (Dev Update 1.11, commit `1470f48`)

Everything the repository can prove:

| Consumer | `GET /api/compatibility` | `/api/query`, `/api/stella/chat` |
| --- | --- | --- |
| Shipped browser app (`public/`) | **No reference.** The only `/api/compatibility` strings in `public/app.js` are the 1.11 `…/options` and `…/compare` paths. | **No reference.** |
| Dev Update 1.11 engine (`lib/compatibility/`) | **No reference.** Imports no `lib/symbols.js`, and no `signGeometry`, `harmony_score`, or `ZODIAC_ORDER`. | **No reference.** |
| Tests | Referenced only by `test/compatibility-endpoint.test.js` (comment) and `test/legacy-sun-sign-isolation.test.js`, which exist to prove separation. | None. |
| Documentation | `README.md` endpoint table. | `README.md` endpoint table. |
| Route dispatch | Exact match `route === "/api/compatibility"`. The 1.11 namespace is matched separately as `/api/compatibility/`, so the two cannot collide. | Exact match. |
| **External consumers** | **Unknown — not knowable from this repository.** | **Unknown.** |

`test/legacy-sun-sign-isolation.test.js` pins all of the above, so a later
change that wires a Sun-sign score into full-chart results fails in CI.

## Recommended follow-up patch (bounded, not scheduled)

A single small patch, to be run only when the owner decides. It is deliberately
sized to be reversible and to gather the one fact this audit could not.

**Phase 1 — measure (one patch, no behaviour change).**

1. Add a counter to each of the three handlers recording a hit: route, and
   whether the caller sent a browser-like `Accept`/`User-Agent`. Log nothing
   that identifies a person — no IP, no query values, no prompt text.
2. Return `Deprecation: true` and `Sunset` advisory headers (RFC 8594) plus a
   `deprecation_notice` string in the JSON body, pointing at
   `/api/compatibility/compare`. Additive only; every existing field stays.
3. Leave the routes fully functional.

**Phase 2 — decide, after a defined observation window (suggest 90 days).**

- **Zero non-synthetic hits** → remove the three handlers, remove
  `signGeometry`'s compatibility branch from `answerPrompt`, drop the README
  rows, and delete this note. `lib/symbols.js` keeps `signGeometry` only if the
  Symbol Atlas still needs it — check at the time.
- **Any real traffic** → keep the routes, publish a real sunset date now that
  it can be justified, and add the notice to the README rather than only here.

**Explicitly out of scope for that patch:** changing `signGeometry`'s maths,
touching the Symbol Atlas, altering `/api/symbols`, or modifying anything under
`lib/compatibility/`.

## Rules while it stays deprecated

- Do not connect any Dev Update 1.11 surface to these routes.
- Do not let `harmony_score` influence a full-chart compatibility result.
- Do not remove or break them outside the patch above.
- Do not advertise them as compatibility in new product copy.
