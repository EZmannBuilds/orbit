# Me Planet Grid Redesign (Update 3.3.1)

Branch: `feat/orbit-axis-me-planet-grid-redesign`
Date: 2026-07-15

This update redesigns the Me page's natal placement layout into a compact,
responsive placement grid. The goal is faster scanning without removing chart
depth.

## New hierarchy

- The Keys to Your Chart appears first with Rising, Sun, and Moon.
- Planets appears next with Mercury, Venus, Mars, Jupiter, Saturn, Uranus,
  Neptune, and Pluto.
- The standard planet order is Sun, Moon, Mercury, Venus, Mars, Jupiter,
  Saturn, Uranus, Neptune, Pluto, with Rising represented above as a chart key.
- Saved chart management remains on Me below the chart sections.

## Card behavior

Each placement uses the same compact card pattern:

- Leading glyph.
- Placement title with sign and reliable house information.
- Degree and retrograde state when relevant.
- One short practical role.
- A chevron indicating that more detail is available.

Cards are semantic buttons. Selecting a card opens the shared accessible modal
system with focus trapping, Escape close, and focus restoration to the selected
card.

## Simple and Advanced modes

Simple mode keeps all major planets visible and concise. It does not hide
Uranus, Neptune, or Pluto.

Advanced mode keeps the same grid and adds restrained technical details, such
as element, modality, retrograde state, absolute longitude, and existing
advanced chart disclosures for houses, aspects, angles, balances, and
retrogrades.

## Birth-time reliability

- Exact birth time: Rising, houses, and angles display normally.
- Reported birth time: placements display with a note that the saved reported
  time is being used.
- Approximate birth time: the UI warns that Rising, angles, and houses may
  shift.
- Unknown birth time: Rising is shown as unavailable, houses display as
  unavailable, and planetary sign placements remain visible.
- Moon uncertainty remains visible when the unknown-time calculation flags it.

## Responsive rules

- Around 375px: one-column placement list with no horizontal scrolling.
- Around 768px: two-column placement grids with consistent card heights.
- Around 1280px: three-column keys and planet grids.
- Long placement titles wrap inside cards instead of forcing overflow.

## Accessibility decisions

- Placement cards are full-size buttons rather than small nested links.
- Keyboard activation uses semantic buttons plus an explicit Enter and Space
  handler for consistent behavior.
- The placement detail modal reuses Orbit's existing focus trap and Escape
  behavior.
- Focus returns to the triggering placement card after the detail modal closes.
- Visible focus states are defined for card navigation.

## Preserved behavior

- Active-chart overview.
- Saved charts.
- Add, edit, activate, and delete chart flows.
- Shared chart modal.
- Shared delete confirmation.
- Active-chart fallback and persistence.
- Home Manage navigation to Me.
- Birth-time accuracy editing.
- Returning-user onboarding protections.

## Validation

Regression coverage was added for chart keys, full planet ordering, outer
planet visibility in Simple mode, real placement data usage, unknown birth-time
handling, placement detail behavior, and responsive grid rules.
