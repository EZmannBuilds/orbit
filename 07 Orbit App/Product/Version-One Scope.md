---
id: 9a2d7e63-4f81-4b09-a5c7-3e60d8f1b724
title: Version-One Scope
type: product_definition
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - product
  - scope
  - release
source: user
supabase_sync: true
---

# Version-One Scope

What ships in version one, what does not, and why the difference is a flag
rather than a deletion. Decided in Update 5.0, Session 5.

Related: [[Orbit Axis Roadmap]], [[Architecture Notes — Account Deletion]],
[[App Store Release Readiness]], [[Deployment Status and Blockers]]

## In

```text
Home        the daily reading, current sky, active chart
Me          natal chart, placements, Simple and Advanced detail
Ask Orbit   deterministic astrology consultation
More        history, settings, account, deletion
```

Everything above is finished, tested, and works against the hosted database.

## Out, for now

**Tarot, Learn, and News.** All three are built to the shell stage and none are
finished.

They are hidden rather than removed. Shipping a half-built surface teaches
people that Orbit's navigation contains things that do not work, which is a
worse first impression than a smaller app that works everywhere you touch it.
Deleting them would mean rebuilding later — and the work is not the problem, its
readiness is.

## How the gate works

Environment flags, defaulting to off:

```text
ORBIT_FEATURE_TAROT
ORBIT_FEATURE_LEARN
ORBIT_FEATURE_NEWS
```

**Production ignores them entirely.** No environment variable can switch an
unfinished feature on for real users; that takes a code change and a release,
which is the right amount of ceremony for "show this to everybody". A stray
variable in a dashboard should not be able to expose a broken page.

Local development and Vercel previews *can* enable them deliberately, so the
work stays reviewable.

Only `true` and `enabled` count. `1`, `yes`, and `on` are off, on purpose — a
flag that guesses eventually guesses wrong, and here wrong means a stranger
finds an unfinished feature.

## Gating the navigation was not enough

The rail is only one way in. All four of these go through the same filtered
list:

- the navigation rail
- hash routing (`#tarot` and friends fall back to Home)
- the command palette
- number-key shortcuts

A disabled panel is **removed from the document**, not hidden with an attribute.
Hiding with CSS or `hidden` leaves the markup in the page for anyone reading the
DOM, and "we hid it" is not the same as "we did not ship it".

## The bug this turned up

The environment check took an options object, not a bare environment. Passing
the environment directly made it silently fall back to `process.env` and answer
"local" for everything — a production gate that was quietly open. A failing test
caught it, and the gate now defers to the application's own environment resolver
rather than re-deriving the answer. Two pieces of code that both decide "is this
production?" eventually disagree, and the one that disagrees quietly is the
feature flag nobody is watching.

## Known limitation

The unfinished panel markup still ships inside `index.html` and is removed at
runtime. It is unreachable by navigation, hash, palette, or shortcut, but it is
visible to anyone who reads the page source. Stripping it at build time would
require a bundler that Orbit deliberately does not have.

This is recorded rather than smoothed over: it is a real, if small, gap between
"not shipped" and "not reachable".

## Bringing one back

Finish it, then remove its entry from the feature registry so it is no longer
gated. Until then, set its flag locally to work on it — enabling one does not
enable the others.
