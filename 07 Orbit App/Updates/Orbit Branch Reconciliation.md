# Orbit Branch Reconciliation (Update 3.3.2)

Branch: `feat/orbit-axis-ask-orbit-foundation`
Date: 2026-07-17

This update reconciles the completed Orbit chart feature branches into a single
clean development base and creates the integration branch for Update 4.0.

## Real ancestry discovered

The two feature branches named for this reconciliation were **not divergent**.
Git ancestry (verified with `git merge-base --is-ancestor` and
`git merge-base`) shows a single linear history:

```
524f4e6  main (Merge Home and Current Sky)
  └─ e777d98  feat/orbit-axis-fast-chat-detail-modes
       └─ e753165  feat/orbit-axis-returning-user-chart-flow
            └─ 1037036  Update 3.2
                 └─ 9606bb4  Update 3.2.3
                      └─ dcfc88d  feat/orbit-axis-active-chart-history (3.2.4)
                           └─ 79f45a6  feat/orbit-axis-me-chart-management (3.3)
                                └─ 018efe1  feat/orbit-axis-me-planet-grid-redesign (3.3.1)
```

- `git merge-base e753165 018efe1` → `e753165`.
- `e753165` (returning-user chart flow) **is an ancestor of** `018efe1`
  (Me planet grid redesign).
- `018efe1` is **not** an ancestor of `e753165`.

Conclusion: `feat/orbit-axis-me-planet-grid-redesign` (018efe1) already contains
every commit from `feat/orbit-axis-returning-user-chart-flow` (e753165). No
three-way merge, cherry-pick, or conflict resolution was required — the work was
already integrated linearly.

## Integration strategy used

- Created `feat/orbit-axis-ask-orbit-foundation` from `018efe1`, the tip that
  already contains both completed feature lines.
- No `reset --hard`, no force push, no destructive rebase, no branch deletion,
  no discarded work, and no Supabase reset/repair/push.
- The original feature branches are left untouched as history.

## Conflicts encountered

None. Because the history is linear, there was nothing to merge and no conflict
to resolve. This was confirmed by the reconciled tree being identical to
`018efe1` and by the full test suite passing unchanged.

## Features preserved (verified by the existing suite)

Returning-user flow (from `feat/orbit-axis-returning-user-chart-flow`):

- Signed-in users with saved charts load directly into their experience; a
  failed or slow chart request never shows onboarding; onboarding appears only
  after auth resolves and a successful request confirms zero charts; stale or
  missing active-chart references heal; the server stays the source of truth;
  fortune failures do not control onboarding; the startup gate prevents flashing;
  chart create/edit/manage/delete-confirm/switch all work; modal focus trap,
  Escape, focus restoration, and reduced-motion behavior intact.

Me page (from `feat/orbit-axis-me-planet-grid-redesign`):

- "The Keys to Your Chart" shows Rising, Sun, Moon; the Planets grid shows
  Mercury–Pluto; all planets visible in Simple mode; cards open detail modals;
  Simple and Advanced supported; Balanced normalizes to Simple and is not a
  selectable mode; exact/reported/approximate/unknown birth-time behavior stays
  accurate; unknown time never fabricates Rising or houses; grid responsive at
  ~375/768/1280px; keyboard activation and modal accessibility intact.

## Validation

Run on the integration branch immediately after creation:

- `npm run lint` — clean.
- `npm test` — 192 passing, 0 failing (identical to the base, since the tree is
  unchanged).

See [[Ask Orbit Foundation]] for the Update 4.0 work that builds on this base.
