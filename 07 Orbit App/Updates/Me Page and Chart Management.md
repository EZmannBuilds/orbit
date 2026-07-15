# Me Page and Chart Management (Update 3.3)

Branch: `feat/orbit-axis-me-chart-management`
Date: 2026-07-15

This update makes Me the clear home for a user's natal chart and saved-chart
management. Home remains focused on today's reading, Current Sky, fortune, and
daily guidance.

## What changed

- Replaced the old form-first My Chart panel with a profile-style Me page.
- Added an active-chart overview with chart name, active state, Big Three,
  birth date, birth location, birth time, time accuracy, and current detail mode.
- Added a prominent Big Three section with plain-language role labels and
  interpretations.
- Added focused Simple-mode key placements for Mercury, Venus, Mars, Jupiter,
  and Saturn.
- Added Advanced-mode disclosure sections for all placements, houses, aspects,
  angles, element/modality balance, and retrograde status.
- Moved saved-chart management onto Me and pointed the More saved-chart card
  back to Me.
- Reused the shared chart modal for add/edit and the shared confirmation dialog
  for delete.
- Routed Home's Manage action to Me.
- Removed the duplicate Supabase branch-state ignore block while preserving one
  `supabase/.branches/` ignore rule.

## Birth-time handling

The existing schema already supports `time_accuracy`, so no migration was
needed. The UI now explains:

- Exact birth time: Rising, houses, and angles can be read with confidence.
- Approximate birth time: calculated results are shown with a caution that
  Rising and houses may shift.
- Unknown birth time: Rising, houses, and angles are not fabricated.

Existing `reported` values remain compatible and display as reported birth time.

## Preserved behavior

- Returning-user chart restoration.
- Active-chart history and `last_active_at`.
- New-user-only onboarding.
- Home Viewing selector and Add Chart action.
- Owner-scoped chart access.
- Current Sky and daily fortune.
- Simple and Advanced display modes.
- Signed-out local preview.
- Accessible modal focus trap, Escape close, and focus restoration.

## Tests

Added regression coverage for Me page structure, birth-time reliability copy,
Simple/Advanced visibility, shared chart action paths, saved-chart failure retry,
and approximate birth-time calculation behavior.
