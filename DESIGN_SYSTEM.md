# Orbit Design System

Orbit's interface is built on a small, token-driven design system. The goal is a
calm, precise **observatory** — Apple Health for astrology, Bloomberg Terminal
without the clutter, Linear-grade consistency. The beauty comes from typography,
spacing, motion, and hierarchy, never decoration.

Every screen should answer three questions instantly: **Where am I? What matters
most? What should I do next?**

---

## File layout

```
public/
├── index.html            # App shell + workspace panels (semantic markup only)
├── app.js                # Router, data loading, renderers, command palette
└── styles/
    ├── tokens.css        # ① Design tokens — the single source of truth
    ├── base.css          # ② Reset, typography helpers, a11y, motion
    ├── components.css     # ③ Reusable UI primitives (the component library)
    └── app.css            # ④ App shell layout + the two app-specific views
```

Load order matters: `tokens → base → components → app`. Nothing below the token
layer hardcodes a color, size, radius, or duration — everything references a
custom property.

---

## Design tokens (`styles/tokens.css`)

Centralized in one file so a single change propagates everywhere.

| Group | Tokens | Notes |
| --- | --- | --- |
| **Color (semantic)** | `--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-surface-sunken`, `--color-border`, `--color-border-strong`, `--color-primary`, `--color-secondary`, `--color-muted`, `--color-faint`, `--color-accent`, `--color-success`, `--color-warning`, `--color-error` | Neutral ink ramp + **one** calm blue accent. No zodiac/sign colors. |
| **Typography** | `--text-display` (34) → `--text-title` (24) → `--text-heading` (18) → `--text-card-title` (15) → `--text-body` (14) → `--text-caption` (12.5) → `--text-meta` (11); weights, leading, tracking | Emphasis via weight, not color. |
| **Spacing** | `--space-0`…`--space-16` (4px grid) | Density modes remap `--density-*` from these. |
| **Radius** | `--radius-sm/md/lg/xl/full` | |
| **Elevation** | `--shadow-e1/e2/e3` | Very subtle, layered. |
| **Motion** | `--duration-instant/fast/base/slow`, `--ease-standard/decelerate/emphasized` | |
| **Breakpoints** | 640 / 900 / 1200 / 1440 | Documented; used by media queries. |
| **Layout** | `--rail-width`, `--topbar-height`, `--container-max` | |

### Themes & modes (set as attributes on `<html>`)

| Attribute | Values | Effect |
| --- | --- | --- |
| `data-theme` | `dark` (default) / `light` | Full semantic palette swap. |
| `data-density` | `comfortable` (default) / `compact` | Remaps `--density-*` + control height. |
| `data-text` | `default` / `large` | Scales the rem base. |
| `data-contrast` | `normal` / `high` | Stronger borders + text. Also honors `prefers-contrast`. |
| `data-motion` | `full` / `reduced` | Kills animation. Also honors `prefers-reduced-motion`. |

All five persist to `localStorage` (`orbit.*`) and are configurable in the
**Settings** workspace.

---

## Component library (`styles/components.css`)

Every primitive is namespaced `o-`. Each consumes only tokens, so it inherits
theme, density, contrast, and motion automatically.

| Component | Class | Purpose |
| --- | --- | --- |
| Button | `.o-btn` (`--primary`, `--secondary`, `--ghost`, `--sm`, `--block`) | Actions |
| Icon button | `.o-icon-btn` | Toolbar / nav |
| Input / Select | `.o-input`, `.o-select`, `.o-field`, `.o-label` | Forms |
| Search | `.o-search` | Input with leading icon |
| Badge | `.o-badge` (`--accent`) | Inline labels |
| Status pill | `.o-pill` (`--success/warning/error/accent`) | Dot + status |
| Card | `.o-card` (`--elevated`, `--flush`, `--interactive`) | Container |
| Metric tile | `.o-tile` | Single value + eyebrow + glyph |
| Section header | `.o-section-head` | Title + description + actions |
| Card header | `.o-card-head` | Eyebrow/title inside cards |
| Info panel | `.o-panel`, `.o-kv` | Key/value rows |
| Tabs | `.o-tabs`, `.o-tab` | In-view switching |
| Segmented control | `.o-segment` | Compact toggle group |
| List | `.o-list`, `.o-list__row` | Rows |
| Table | `.o-table`, `.o-table-wrap` | Data (horizontal-scroll safe) |
| Timeline | `.o-timeline` | Dated events |
| Progress | `.o-progress`, `.o-ring` | Linear + radial |
| Expandable | `.o-expand` | Disclosure |
| Tooltip | `[data-tooltip]` | CSS-only hint |
| Dialog | `.o-overlay`, `.o-dialog` | Modal |
| Command palette | `.o-cmd` | ⌘K launcher |
| Skeleton | `.o-skel` (`--line/title/tile`) | Loading placeholder |
| Spinner | `.o-spinner` | Inline loading |
| Empty state | `.o-empty` | No-data view |
| Toast | `.o-toast` | Transient feedback |
| Motion utils | `.o-fade-in`, `.o-rise-in` | Entrance animation |

Typographic helpers live in `base.css`: `.u-display`, `.u-title`, `.u-heading`,
`.u-card-title`, `.u-body`, `.u-caption`, `.u-meta`, `.u-eyebrow`, plus
`.u-mono`, `.u-strong`, `.u-muted`, `.u-tnum`.

---

## Navigation — the workspace model

"Pages" are now **workspaces**, defined once in `WORKSPACES` (`app.js`) and
rendered into the navigation rail. A hash router (`#dashboard`, `#charts`, …)
toggles panels; each workspace has a title, a short description, a primary
action, and search where relevant.

| Workspace | Contents (existing functionality, re-homed) |
| --- | --- |
| **Dashboard** | Today's Sky tiles · Upcoming Events · Quick Actions · System Status |
| **Charts** | Zodiac wheel · Birth-date → sign · Compatibility geometry |
| **Transits** | Current placements · Upcoming sky-events timeline |
| **Research** | Ask Orbit (deterministic query) · Symbol atlas (search + filter) |
| **Settings** | Appearance controls · System info · Disclaimer |

Journal/other example workspaces from the brief were intentionally **not**
stubbed in — the brief forbids empty cards and filler, so only workspaces backed
by real data ship.

### Command palette
`⌘K` / `Ctrl-K` (or the top-bar search) opens a palette to jump between
workspaces and run actions (Ask Orbit, look up a sign, toggle theme/density).
Full keyboard support: arrows, Enter, Escape. Number keys `1–5` jump directly
to workspaces.

---

## Accessibility

- Skip-link to content; `:focus-visible` ring on every interactive element.
- Rail uses `role="tab"` / `aria-current`; panels are labelled `tabpanel`s.
- Wheel segments are focusable buttons with keyboard activation.
- Command palette is a labelled `combobox`/`listbox` with `aria-selected`.
- `prefers-reduced-motion`, `prefers-contrast`, and `prefers-color-scheme` are
  all honored, each with an explicit in-app override.
- Large-text mode; ARIA live regions for toasts.

---

## Old → new mapping

| Old (`public/style.css`, deleted) | New |
| --- | --- |
| `.topbar` / `.brand` | `.rail` (workspace nav) + `.topnav` |
| `.card` (mystical gradient, gold headings) | `.o-card` + `.o-card-head` (neutral) |
| `.sky-grid` / `.sky-card` | `.o-tile` metric tiles in a `.grid-tiles` |
| `.badge.rx` / `.badge.direct` | `.o-pill--warning` / `.o-pill--success` |
| `.tool-row` inputs/buttons | `.o-field` + `.o-input`/`.o-select` + `.o-btn` |
| `.events` / `.event-row` | `.o-timeline` (Transits) + `.o-list` (Dashboard) |
| `.atlas-filters` (pill buttons) | `.o-tabs` + a live `.o-search` |
| `.symbol-card` (gold glyphs) | `.symbol-card` (neutral, token-driven) |
| Fantasy starfield + purple/gold gradients | Removed — flat neutral surfaces |
| Single dark page | Themeable (dark/light) + density/contrast/motion/text modes |

Business logic, the JSON API, the sky/chart math (`lib/`), and the server were
**not** modified — this change is presentation only.

---

## Validating

```bash
node --check server.js
for f in lib/*.js public/app.js; do node --check "$f"; done
npm start   # then open http://localhost:3001
```

Verify: no console errors, responsive layouts (rail → icon bar → top bar),
keyboard navigation (⌘K, 1–5, Tab), and both dark and light themes.
