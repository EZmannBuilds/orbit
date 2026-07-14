# Returning User Chart Flow (Update Three)

Branch: `feat/orbit-axis-returning-user-chart-flow`
Starting commit: `e777d98` (Stream Orbit chat and simplify detail modes)

A signed-in user with at least one saved chart was being asked to set up their
birth chart again on login, refresh, and return to Home. Chart setup is
onboarding — not a recurring login screen. This update fixes that and adds the
minimum saved-chart management needed to support it.

## Root causes

There were two, and both had to go.

1. **An empty chart list was treated as "this account has no charts."**
   `loadSavedCharts()` swallowed any `/api/charts` failure and left `charts`
   empty. The startup code then read "no charts" and opened onboarding. A slow or
   failed request looked identical to a brand-new account.

2. **The fortune path opened the onboarding gate.** `axisLoadToday()` contained
   `$("#onboarding-gate").hidden = state.charts.length > 0`, so a failed *fortune*
   request could re-onboard a user who already had charts.

A third, quieter problem: if saved charts existed but no active chart was stored
(or the stored id pointed at a deleted chart), the personalized experience never
loaded.

## Returning-user startup flow

Startup now runs in a fixed order and the outcome is an explicit decision:

1. Resolve authentication.
2. Load the signed-in user's saved charts (Supabase, owner-scoped, source of truth).
3. Decide the view — one of six states, in `public/startup-state.js`:

| State | When |
|---|---|
| `LOADING` | auth and/or the chart request are still in flight |
| `SIGNED_OUT` | no session — local preview, untouched |
| `ERROR` | the chart request failed — recoverable, offer retry |
| `ONBOARDING` | signed in, request **succeeded**, genuinely zero charts |
| `READY` | returning user with at least one chart |

The decision is a pure function so the returning-user guarantee is unit tested
rather than only observable in a browser. Crucially it keys off the *status* of
the saved-chart request, never off the array alone.

## Chart onboarding rules

Onboarding appears automatically **only** when all of these hold: auth finished,
the user is signed in, the saved-chart request completed successfully, and the
account has zero saved charts.

It is never opened because a request was slow, a fortune/Current Sky/history call
failed, the active chart wasn't immediately available, local storage was empty, or
the user refreshed. Closing it does not reopen it for the session; the Home "+"
action reopens chart creation on demand.

## Preventing the flash

A startup gate covers the app from first paint until auth *and* the chart request
resolve, so the setup form is never rendered and then hidden. `finishStartup()`
runs in a `finally`, so a failure can never leave the interface blocked.

## Active-chart restoration

There is one active-chart system. The server resolves it in
`lib/charts/service.js`:

- Use the stored active chart when it exists and still belongs to the owner.
- Otherwise pick a sensible one — primary "My Chart" → most recently updated →
  first — and **persist it through the existing activation path**, so Home, the
  fortune, chat, and history all agree and the choice survives a refresh.
- A stale/dangling active id heals to a real chart instead of reading as "no chart".
- Deleting the active chart promotes a replacement; only deleting the last chart
  produces the empty state.

## Saved-chart management UX

Home stays calm and focused on the daily reading. Beside the existing Viewing
selector: a "+" action (opens the chart modal) and a "Manage" link (to More).
When only one chart exists the selector stays disabled showing its name, and "+"
remains available.

One shared modal creates *and* edits/renames charts. A shared modal utility gives
focus trap, Escape to close, focus restoration to the opener, visible focus, and
reduced-motion support. Destructive deletion uses an accessible `alertdialog`
confirmation instead of `window.confirm`, with distinct copy when it's the last
chart.

## Error and recovery behavior

A failed saved-chart request shows a recoverable error with a retry — never a
claim that the user has no chart, and never a prompt to recreate it. Current Sky
still renders so Home is never left blank. Messages avoid database terminology,
UUIDs, raw API errors, and authentication internals.

## Incidental fix

The legacy `--accent`/`--violet` variables were scoped to `#panel-me, #panel-more`
only, so `.chart-form button` outside those panels computed to a transparent
background with near-black text. The onboarding "Save My Chart" CTA — the primary
action of the new-user flow — was effectively invisible. The variable scope now
includes the gates and the modal, and design-system buttons opt out of the legacy
rule.

## Test coverage

`test/returning-user.test.js` — 21 tests covering all twelve required cases plus
three regression locks: the fortune path can never touch the onboarding gate,
onboarding is opened from exactly one place, and a failed chart request never
clears known charts. Full suite: 173 passing (was 152).

## Validation

Lint, tests, and build pass. Vault validates. Verified in-browser across the
startup scenarios (returning user, multiple charts, zero charts, slow auth +
slow charts, failed request) with zero onboarding flashes, plus 375/768/1280,
keyboard operation, reduced motion, and no console errors.

## Known limitations

- The signed-in scenarios were exercised by driving the real shipped startup code
  against stubbed auth/chart endpoints; a live signed-in pass with real
  credentials is still worth doing.
- Chart management still lives on the More page; only the "+" and "Manage"
  entry points were added to Home, deliberately.

## Next recommended update

Consider a last-active timestamp on saved charts so "most recently active" can be
preferred over "most recently updated" when auto-selecting a chart.
