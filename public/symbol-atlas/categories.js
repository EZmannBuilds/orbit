// Orbit Axis :: Symbol Atlas categories (Dev Update 1.12).
//
// The Atlas's seven shelves. Order here IS display order — planets first
// because they are what a chart is made of, then the signs they sit in, the
// houses they occupy, the aspects between them, and finally the grammar
// underneath (elements, modalities, angles).
//
// Slugs are route segments (#symbol-atlas/planets/moon), so they are part of
// every deep link ever shared. They do not change. Nothing here is a database
// identifier and nothing here reaches one.

export const ATLAS_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "planets",
    slug: "planets",
    name: "Planets",
    shortName: "Planets",
    glyph: "☉",
    description: "The ten moving bodies a chart tracks — what each one is commonly said to describe.",
    searchTerms: Object.freeze(["planet", "planets", "luminary", "luminaries", "body", "bodies"]),
  }),
  Object.freeze({
    id: "signs",
    slug: "signs",
    name: "Zodiac Signs",
    shortName: "Signs",
    glyph: "♈",
    description: "The twelve signs of the zodiac — the styles a planet is read through.",
    searchTerms: Object.freeze(["sign", "signs", "zodiac", "zodiac sign", "zodiac signs"]),
  }),
  Object.freeze({
    id: "houses",
    slug: "houses",
    name: "Houses",
    shortName: "Houses",
    glyph: "⌂",
    description: "The twelve areas of life a birth-time chart divides the sky into.",
    searchTerms: Object.freeze(["house", "houses", "house system", "areas of life"]),
  }),
  Object.freeze({
    id: "aspects",
    slug: "aspects",
    name: "Aspects",
    shortName: "Aspects",
    glyph: "△",
    description: "The five major angles between planets, and what each kind of contact tends to mean.",
    searchTerms: Object.freeze(["aspect", "aspects", "angle between planets", "contact", "geometry"]),
  }),
  Object.freeze({
    id: "elements",
    slug: "elements",
    name: "Elements",
    shortName: "Elements",
    glyph: "🜂",
    description: "Fire, Earth, Air, and Water — the four temperaments the signs are grouped by.",
    searchTerms: Object.freeze(["element", "elements", "temperament", "triplicity", "triplicities"]),
  }),
  Object.freeze({
    id: "modalities",
    slug: "modalities",
    name: "Modalities",
    shortName: "Modalities",
    glyph: "⟳",
    description: "Cardinal, Fixed, and Mutable — how each sign tends to move through change.",
    searchTerms: Object.freeze(["modality", "modalities", "quality", "qualities", "quadruplicity", "mode"]),
  }),
  Object.freeze({
    id: "angles",
    slug: "angles",
    name: "Angles & Chart Points",
    shortName: "Angles",
    glyph: "↑",
    description: "The four cardinal points of a birth-time chart — the frame everything else hangs on.",
    searchTerms: Object.freeze(["angle", "angles", "chart point", "chart points", "axis", "axes"]),
  }),
]);

export const CATEGORY_BY_SLUG = Object.freeze(
  Object.fromEntries(ATLAS_CATEGORIES.map((c) => [c.slug, c])));

/** Display order of a category, for deterministic sorting everywhere. */
export function categoryOrder(slug) {
  const index = ATLAS_CATEGORIES.findIndex((c) => c.slug === slug);
  return index === -1 ? ATLAS_CATEGORIES.length : index;
}
