# Symbol Atlas — the reference workspace

**Since Dev Update 1.12.** Orbit's built-in astrology reference: seven
categories, fifty starter entries, authored and deterministic, shipped entirely
from the repository. Dev Update 3.1 deepens content; Dev Update 3.2 adds
researcher material. Neither is started, and nothing in the interface promises
them.

## Routes

```
#symbol-atlas                     home — search + categories
#symbol-atlas/<category>          category page (canonical order)
#symbol-atlas/<category>/<slug>   entry page
```

The flat hash router grants nested routes to exactly one workspace — the Atlas
(`currentWorkspace` in `public/app.js`). Unknown categories and entries render
the Atlas's own not-found states with the URL intact; `resolveLegacyRoute`
never redirects an Atlas sub-route to Home. Direct load, refresh, Back,
Forward, and copy-link all work because every card, crumb, and chip is a real
`<a href>`.

Category slugs: `planets`, `signs`, `houses`, `aspects`, `elements`,
`modalities`, `angles`. House slugs are `1st-house` … `12th-house`; angle slugs
are `ascendant`, `descendant`, `midheaven`, `imum-coeli`.

## Content architecture

```
public/symbol-atlas/
  categories.js            the seven shelves (order = display order)
  entries-planets.js       10 planets and luminaries
  entries-signs.js         12 signs (facts mirror lib/symbols.js, tested)
  entries-houses.js        12 houses (aliases: "first house", "house 1", …)
  entries-foundations.js   5 aspects, 4 elements, 3 modalities, 4 angles
  index.js                 assembly, lookups, related graph, validator
  search.js                deterministic search + ranking
lib/symbol-atlas/index.js  server-side re-export (chart-identity.js pattern)
```

Entries are frozen data, never markup — the validator refuses angle brackets,
and the renderer escapes everything. `id` (`category-slug`) and `status`
(`starter`) derive in the assembler so no author can mistype them. The
browser lazy-loads the module on first Atlas visit (~76 KB transferred, once);
app boot pays nothing, and no search or entry view ever makes a request.

The validator (`validateAtlasContent`) runs in the test gate and fails CI on:
duplicate ids/slugs, unresolvable related references, self-reference, missing
required fields, missing starter entries (checked by name), non-lowercase
aliases, angle brackets, and fatalistic language (`always`, `never`,
`guarantees`, `proves`, `destined`, `doomed`…). Two parity tests pin the Atlas
to the software beside it: sign facts must equal `lib/symbols.js`, and aspect
orb facts must state the engine's real numbers (8/8/6/6/4, +1 luminary).

## Search ranking

Documented in `public/symbol-atlas/search.js` and enforced rank-by-rank in
`test/symbol-atlas-search.test.js`:

| Rank | Match | Example |
| --- | --- | --- |
| 0 | exact title | `moon` → Moon |
| 1 | exact alias | `MC` → Midheaven, `first house` → 1st House |
| 2 | title prefix | `sag` → Sagittarius |
| 3 | keyword | `career` → Midheaven, 10th House |
| 4 | category term | `planets` → all ten |
| 5 | summary substring | `friction` → Square |

Ties break by canonical category order, then authored entry order. Queries are
normalised (case, whitespace, punctuation, ordinal words: `first` ↔ `1st`) and
treated strictly as text. No fuzzy-search library, no network, no stored or
logged queries.

## Simple and Advanced

Update 5.2 collapsed Orbit's detail toggle — one level, plain language first,
technical depth behind progressive disclosure. The Atlas follows that
convention: entry pages lead with the summary, themes, strengths, challenges,
and chart role, with an **Advanced** `<details>` section carrying methodology
notes and structured facts (rulerships, orbs, axes). Both read from one
canonical entry — there is no second copy to drift.

## Contextual links

Wherever Orbit already names a symbol, the name links to its entry:

| Surface | Links |
| --- | --- |
| My Chart | planets, signs, houses (reading cards); bodies + aspect (aspect cards); elements + modalities (balance bars) |
| Current Positions | planet name, sign |
| Today's Transits | transiting planet, natal planet, aspect (evidence table) |
| Compatibility | bodies + aspect, on a quiet "In the Atlas" line per factor |
| Atlas home | "From your chart": Sun/Moon/rising sign from the in-memory summary |

Rules (tested in `test/symbol-atlas-links.test.js`): an unknown name degrades
to plain text rather than minting a dead link; links never open a new tab,
never carry query data, and never touch chart activation, identity, or
compatibility scoring. Combined interpretations ("Moon in Cancer in the 4th
House") are deliberately not authored — contextual surfaces link the individual
canonical entries; combination content is Dev Update 3.1 territory.

## Boundaries

- **No AI** — no provider contacted, no generated content, no prompt storage.
- **No database or Storage involvement** — reference content is repository
  data; nothing about the Atlas touches Supabase, and exports are unchanged
  (schema 1.2.0).
- **No analytics, no tracking, no localStorage** — a search query lives as
  long as the keystroke.
- **Methodology note** (shown on entries and Atlas home): *"Symbol Atlas
  provides authored astrological reference material. It describes common
  interpretive traditions and does not guarantee personality traits, events,
  or outcomes."*
