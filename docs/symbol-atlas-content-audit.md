# Symbol Atlas — content coverage audit (Dev Update 3.1)

Taken against `4107ee9` (Dev Update 1.12, Production) before any 3.1 content was
written. This is the record of what the starter set actually contained, what the
3.1 completion standard requires, and which gap each entry had. It is kept so
the next update can see the shape of the work rather than re-deriving it.

## What 1.12 shipped

Seven categories, fifty entries, one validator, one search index — all authored,
frozen, and loaded from the repository. Architecturally complete; editorially
thin by design, with `status: "starter"` naming the boundary.

| Category | Entries | Files |
| --- | --- | --- |
| planets | 10 | `entries-planets.js` |
| signs | 12 | `entries-signs.js` |
| houses | 12 | `entries-houses.js` (built by a `HOUSE()` factory) |
| aspects | 5 | `entries-foundations.js` |
| elements | 4 | `entries-foundations.js` |
| modalities | 3 | `entries-foundations.js` |
| angles | 4 | `entries-foundations.js` |

Total authored copy at `4107ee9`: **58,269 characters** across all fifty entries.

### Schema present at 1.12

`slug`, `category`, `title`, `glyph`, `summary`, `themes[]`, `strengths[]`,
`challenges[]`, `chartRole`, `advanced[]`, `facts{}`, `keywords[]`, `aliases[]`,
`related[]` — plus `id`, `status`, `order` derived in the assembler.

### Schema absent at 1.12

`overview`, `everyday`, `constructive`, `difficult`, `whenEmphasized`,
`reflections` — **missing on all fifty entries**. These are the six fields the
3.1 completion standard requires and the starter set never had.

## Content completion matrix

Quality columns describe the state at `4107ee9`. "Thin" means present and
correct but too short to answer the question a reader arrives with; "none"
means the field did not exist.

| Entry | Cat | Summary | Simple | Advanced | Strengths | Challenges | Chart role | Related | Keywords | Aliases | Everyday | Reflection | Tone | Missing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sun | planets | thin (109c) | thin | 1 para | 3 | 3 | thin (129c) | 4 valid | 7 | 2 | none | none | clean | overview, everyday, constructive, difficult, whenEmphasized, reflections |
| Moon | planets | thin (124c) | thin | 1 para | 3 | 3 | ok (187c) | 4 valid | 8 | 2 | none | none | clean | same six |
| Mercury | planets | thin (105c) | thin | 1 para | 3 | 3 | thin (175c) | 4 valid | 7 | **0** | none | none | clean | same six + aliases |
| Venus | planets | thin (114c) | thin | 1 para | 3 | 3 | thin (136c) | 5 valid | 8 | **0** | none | none | clean | same six + aliases |
| Mars | planets | thin (111c) | thin | 1 para | 3 | 3 | thin (112c) | 5 valid | 8 | **0** | none | none | clean | same six + aliases |
| Jupiter | planets | thin (100c) | thin | 1 para | 3 | 3 | thin (168c) | 4 valid | 8 | **0** | none | none | clean | same six + aliases |
| Saturn | planets | thin (121c) | thin | 1 para | 3 | 3 | thin (169c) | 4 valid | 8 | **0** | none | none | clean | same six + aliases |
| Uranus | planets | thin (115c) | thin | 1 para | 3 | 3 | ok (184c) | 4 valid | 7 | **0** | none | none | clean | same six + aliases |
| Neptune | planets | ok (146c) | thin | 1 para | 3 | 3 | thin (157c) | 3 valid | 8 | **0** | none | none | clean | same six + aliases |
| Pluto | planets | thin (98c) | thin | 1 para | 3 | 3 | thin (165c) | 3 valid | 7 | **0** | none | none | clean | same six + aliases |
| Aries … Pisces (12) | signs | thin (103–116c) | thin | 1 para | 3 | 3 | thin (122–164c) | 4–6 valid | 6 | 1–2 | none | none | clean | same six; no planet-through-sign clause for composition |
| 1st … 12th House (12) | houses | thin (110–136c) | thin | 0–1 para | **2** | **2** | ok (223–252c) | 2–3 valid | 5–7 | 4 | none | none | clean; no sign/house conflation found | same six; 7 of 12 had no `advanced` paragraph at all |
| Conjunction | aspects | thin (111c) | thin | 1 para | 2 | 2 | thin (154c) | 4 valid | 6 | 1 | none | none | clean | same six |
| Opposition | aspects | thin (130c) | thin | 1 para | 2 | 2 | thin (137c) | 4 valid | 6 | 2 | none | none | clean | same six |
| Square | aspects | thin (131c) | thin | 1 para | 2 | 2 | thin (162c) | 5 valid | 6 | **0** | none | none | clean | same six + aliases |
| Trine | aspects | thin (134c) | thin | 1 para | 2 | 2 | thin (160c) | 6 valid | 6 | **0** | none | none | clean | same six + aliases |
| Sextile | aspects | thin (138c) | thin | 1 para | 2 | 2 | thin (125c) | 2 valid | 5 | **0** | none | none | clean | same six + aliases |
| Fire, Earth, Air, Water | elements | thin (109–123c) | thin | 1 para | 2 | 2 | thin (117–134c) | 4 valid | 5 | 2 | none | none | clean | same six |
| Cardinal, Fixed, Mutable | modalities | thin (114–120c) | thin | 1 para | 2 | 2 | thin (119–133c) | 5 valid | 5 | 2 | none | none | clean | same six |
| Ascendant | angles | thin (131c) | thin | 1 para | 2 | 2 | ok (185c) | 3 valid | 6 | 5 | none | none | clean | same six |
| Descendant | angles | ok (143c) | thin | 1 para | 2 | 2 | thin (131c) | 3 valid | **4** | 3 | none | none | clean | same six + keywords |
| Midheaven | angles | thin (134c) | thin | 1 para | 2 | 2 | thin (123c) | 3 valid | 6 | 3 | none | none | clean | same six |
| Imum Coeli | angles | ok (162c) | thin | 1 para | 2 | 2 | thin (134c) | 3 valid | 6 | 3 | none | none | clean | same six |

### Findings, in priority order

1. **The six required sections did not exist.** No entry had `overview`,
   `everyday`, `constructive`, `difficult`, `whenEmphasized`, or `reflections`.
   This is the bulk of 3.1: 50 entries × 6 fields.
2. **Every summary was a single sentence.** The completion standard asks for a
   scannable at-a-glance block of two to four paragraphs. `summary` is the right
   short definition and stays; the paragraphs are new (`overview`).
3. **Eleven entries had no aliases at all** — eight planets and three aspects
   (`square`, `trine`, `sextile`). Every one of them is a word people type.
4. **Houses were structurally thinner than the rest**: two strengths and two
   challenges each, and seven of twelve carried no `advanced` paragraph. The
   `HOUSE()` factory made the thinness uniform, which hid it.
5. **`angles/descendant` had four keywords**, below the five the other angles
   carry, and none of them were the everyday words ("relationships",
   "partner").
6. **No composition vocabulary existed.** Nothing in the schema said what a
   planet's *function* is as a reusable clause, how a sign *styles* a function,
   or what arena a house *directs* it into — so a deterministic combination
   layer had nothing to compose from. Four new fields (`role`, `style`, `arena`,
   `interaction`/`axis`) are the smallest addition that supports Planet in Sign,
   Planet in House, Planet aspect Planet, and Planet with Angle without
   authoring hundreds of pages.
7. **Tone was already clean.** The 1.12 validator's fatalism scan
   (`always`, `never`, `guarantees`, `proves`, `destined`, `doomed`) found
   nothing, and a manual read found no sign–house conflation, no
   angle-as-planet claims, and no diagnostic language. 3.1 widens the banned
   list rather than repairing existing copy.
8. **Related graph was valid and had no islands** — every entry was reachable,
   asserted by test. 3.1 adds edges; it repairs none.

## What Dev Update 3.1 changes

* Six new required sections on all fifty entries, validated.
* Composition fields (`role`, `style`, `arena`, `interaction`, `axis`) feeding a
  deterministic combination layer — no AI, no randomness, same input → same
  output.
* Search metadata widened to everyday language ("feelings", "career", "love",
  "conflict", "rising", "hard aspect") without minting misleading aliases.
* Validator extended: required-section completeness, diagnostic language,
  sign–house conflation, angle–planet conflation, placeholder text, cross-entry
  duplicate-paragraph detection, and combination-reference integrity.

## What Dev Update 3.1 does not change

Engine orbs, compatibility scoring, export schema 1.2.0, Supabase schema,
Storage, chart calculation, and the 1.12 route/workspace architecture. No
Researcher-tier material: citations, dignities, orb research, house-system
comparisons, and traditional-versus-modern source tables remain 3.2.
