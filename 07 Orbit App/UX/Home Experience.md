---
id: 8f2c95a4-7e13-4b60-9d84-3a71c6e0b258
title: Home Experience
type: ux_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - ux
  - home
  - fortune
source: user
supabase_sync: true
---

# Home Experience

Redesigned in Update 5.2. Home now opens on the reading, not on planetary
positions.

Related: [[Version-One Scope]], [[Technical Sky and Transits]],
[[Fortune Seed Architecture]], [[Architecture Notes — Versioned API]]

## Order

```text
1. Season and date context
2. Today's Fortune title
3. Fortune cards
4. Technical Sky
5. Ask Orbit
```

Technical Sky used to sit **above** the fortune, which meant Orbit opened on the
most technical thing it does. The reading is what someone came for; the
technical section explains it, so it follows it.

## The carousel is gone

Today's Fortune was five readings with one visible and the rest behind a swipe,
signalled only by a row of dots. On a phone that hid four fifths of the day's
reading.

It is now four cards — Overall, Connection, Momentum, Watch for — all visible by
scrolling. One column at 375px, two from 640px with the primary card spanning,
three from 1100px. No arrows, no dots, no swipe threshold, no gesture handling
at all.

**Removed:** viewport, arrows, dots, arrow-key and Home/End handlers, the 40px
swipe threshold, the entrance animation, carousel key/index state, and ~40 lines
of CSS.

## The title is derived, never invented

The heading above the cards is the opening clause of the overall reading — text
the deterministic engine already produced.

Generating a fresh headline would have made this the one place in Orbit where
reading text was not traceable to engine evidence. It is a presentation of
existing output, not a new one.

## The plain/technical split

The engine already separated these, which is what made the redesign clean:

| Half | Source | Where it appears |
| --- | --- | --- |
| Plain language | `mood`, `love_reading`, `luck_reading`, `watch_out` | Fortune cards |
| Technical | `factors[].advanced` | Technical Sky |

The fortune says what the day may feel like. Technical Sky says why. The fortune
never names a planet.

### The bug a source test could not catch

A test scanning the card *builder* for planet names passed while the rendered
page read **"Mercury is retrograde, so double-check messages…"** — because the
wording came from the engine's **data**, not the template.

Two engine strings were translated (the Mercury-retrograde watch-out, and a hard
transit phrased as "A Mars–Saturn tension"). The astrology and the determinism
are unchanged; only the words moved. The technical phrasing still exists in
`factors[].advanced`.

Tests now read composed output across four skies. The existing test asserting
the literal string `"Mercury is retrograde"` was rewritten to assert the
**meaning** survived — asserting the old phrasing would have re-enforced the
jargon it existed to check.

## Stored history is not rewritten

A fortune already saved keeps its original wording. Today's reading still shows
the old phrasing, and that is correct: a visual change must not invalidate
history. New fortunes use the new wording. A test covers a stored row with a
missing field.

## Active chart

The existing selector is unchanged — same authenticated activation endpoint, no
second selection system, chart persists across refresh, and the fortune and
Technical Sky re-render after a switch.
