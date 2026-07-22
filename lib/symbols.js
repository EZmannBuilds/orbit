// Orbit knowledge base + deterministic query algorithms.
// The standalone Orbit service is the single owner of this data.
// Symbolic reflection only — no predictions.

export const ORBIT_DISCLAIMER =
  "Orbit offers symbolic reflection for creative and brand work, not prediction or advice.";

export const ZODIAC_ORDER = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
];

// A date belongs to the sign whose start is the latest one not after it,
// wrapping at Capricorn across the new year.
export const SIGN_START_DATES = [
  ["aquarius", [1, 20]],
  ["pisces", [2, 19]],
  ["aries", [3, 21]],
  ["taurus", [4, 20]],
  ["gemini", [5, 21]],
  ["cancer", [6, 21]],
  ["leo", [7, 23]],
  ["virgo", [8, 23]],
  ["libra", [9, 23]],
  ["scorpio", [10, 23]],
  ["sagittarius", [11, 22]],
  ["capricorn", [12, 22]],
];

export const ORBIT_SYMBOLS = [
  { kind: "zodiac_sign", slug: "aries", name: "Aries", glyph: "♈", element: "fire", modality: "cardinal", ruling_planet: "Mars", date_range: "Mar 21 - Apr 19",
    keywords: ["initiative", "courage", "spark", "pioneer", "energy", "leadership", "ram"],
    interpretation: "Aries is the spark of the zodiac: cardinal fire that symbolizes beginnings, courage, and the will to move first. Its ram imagery suits bold, high-contrast design language." },
  { kind: "zodiac_sign", slug: "taurus", name: "Taurus", glyph: "♉", element: "earth", modality: "fixed", ruling_planet: "Venus", date_range: "Apr 20 - May 20",
    keywords: ["steadiness", "comfort", "patience", "craft", "nature", "loyalty", "bull"],
    interpretation: "Taurus is fixed earth: a symbol of steadiness, sensory comfort, and patient craft. Its bull imagery pairs well with botanical and textured design motifs." },
  { kind: "zodiac_sign", slug: "gemini", name: "Gemini", glyph: "♊", element: "air", modality: "mutable", ruling_planet: "Mercury", date_range: "May 21 - Jun 20",
    keywords: ["curiosity", "duality", "wit", "communication", "twins", "playfulness", "ideas"],
    interpretation: "Gemini is mutable air: the twins symbolize curiosity, quick wit, and the play of two perspectives at once. Mirror and duality motifs carry its story well." },
  { kind: "zodiac_sign", slug: "cancer", name: "Cancer", glyph: "♋", element: "water", modality: "cardinal", ruling_planet: "Moon", date_range: "Jun 21 - Jul 22",
    keywords: ["nurture", "home", "memory", "protection", "moon", "tides", "crab"],
    interpretation: "Cancer is cardinal water: a symbol of nurture, memory, and the protective shell around what matters. Lunar and tide imagery suits its soft-glow aesthetic." },
  { kind: "zodiac_sign", slug: "leo", name: "Leo", glyph: "♌", element: "fire", modality: "fixed", ruling_planet: "Sun", date_range: "Jul 23 - Aug 22",
    keywords: ["radiance", "pride", "creativity", "heart", "performance", "sun", "lion"],
    interpretation: "Leo is fixed fire: the lion symbolizes radiance, creative pride, and warmth that wants to be shared. Sunburst and crown motifs are its natural vocabulary." },
  { kind: "zodiac_sign", slug: "virgo", name: "Virgo", glyph: "♍", element: "earth", modality: "mutable", ruling_planet: "Mercury", date_range: "Aug 23 - Sep 22",
    keywords: ["precision", "service", "detail", "harvest", "order", "discernment", "maiden"],
    interpretation: "Virgo is mutable earth: a symbol of precision, quiet service, and the harvest of careful work. Wheat, line-work, and orderly geometry express it cleanly." },
  { kind: "zodiac_sign", slug: "libra", name: "Libra", glyph: "♎", element: "air", modality: "cardinal", ruling_planet: "Venus", date_range: "Sep 23 - Oct 22",
    keywords: ["balance", "harmony", "beauty", "justice", "partnership", "scales", "grace"],
    interpretation: "Libra is cardinal air: the scales symbolize balance, aesthetic harmony, and the art of relationship. Symmetry and paired forms carry its meaning." },
  { kind: "zodiac_sign", slug: "scorpio", name: "Scorpio", glyph: "♏", element: "water", modality: "fixed", ruling_planet: "Pluto", date_range: "Oct 23 - Nov 21",
    keywords: ["depth", "intensity", "transformation", "mystery", "truth", "phoenix", "scorpion"],
    interpretation: "Scorpio is fixed water: a symbol of depth, intensity, and transformation from the inside out. Phoenix and dark-botanical motifs suit its mystery." },
  { kind: "zodiac_sign", slug: "sagittarius", name: "Sagittarius", glyph: "♐", element: "fire", modality: "mutable", ruling_planet: "Jupiter", date_range: "Nov 22 - Dec 21",
    keywords: ["adventure", "freedom", "optimism", "quest", "philosophy", "archer", "horizon"],
    interpretation: "Sagittarius is mutable fire: the archer symbolizes the quest, wide horizons, and optimistic aim. Arrow and star-map imagery tell its story." },
  { kind: "zodiac_sign", slug: "capricorn", name: "Capricorn", glyph: "♑", element: "earth", modality: "cardinal", ruling_planet: "Saturn", date_range: "Dec 22 - Jan 19",
    keywords: ["ambition", "discipline", "structure", "mastery", "endurance", "mountain", "seagoat"],
    interpretation: "Capricorn is cardinal earth: the sea-goat symbolizes patient ambition and the long climb to mastery. Mountain and architectural motifs ground its look." },
  { kind: "zodiac_sign", slug: "aquarius", name: "Aquarius", glyph: "♒", element: "air", modality: "fixed", ruling_planet: "Uranus", date_range: "Jan 20 - Feb 18",
    keywords: ["vision", "invention", "community", "future", "rebellion", "waterbearer", "originality"],
    interpretation: "Aquarius is fixed air: the water-bearer symbolizes vision poured out for the collective — invention, community, and the future. Circuit-and-wave motifs fit it." },
  { kind: "zodiac_sign", slug: "pisces", name: "Pisces", glyph: "♓", element: "water", modality: "mutable", ruling_planet: "Neptune", date_range: "Feb 19 - Mar 20",
    keywords: ["dream", "empathy", "imagination", "flow", "mysticism", "ocean", "fish"],
    interpretation: "Pisces is mutable water: two fish swimming in opposite directions symbolize dream, empathy, and the dissolve between worlds. Ocean-gradient imagery suits it." },
  { kind: "planet", slug: "sun", name: "Sun", glyph: "☉",
    keywords: ["identity", "vitality", "core", "purpose", "radiance", "self"],
    interpretation: "The Sun symbolizes core identity and vitality — the center a chart organizes around. In design language it reads as radiance and purpose." },
  { kind: "planet", slug: "moon", name: "Moon", glyph: "☽",
    keywords: ["emotion", "instinct", "memory", "cycles", "night", "comfort"],
    interpretation: "The Moon symbolizes emotional instinct, memory, and cycles — the inner tide. Crescent and phase imagery is its universal shorthand." },
  { kind: "planet", slug: "mercury", name: "Mercury", glyph: "☿",
    keywords: ["communication", "mind", "language", "travel", "messenger", "wit"],
    interpretation: "Mercury symbolizes the messenger mind: language, learning, and quick connections. Winged and script motifs carry its meaning." },
  { kind: "planet", slug: "venus", name: "Venus", glyph: "♀",
    keywords: ["love", "beauty", "value", "art", "attraction", "harmony"],
    interpretation: "Venus symbolizes love, beauty, and what we value — the aesthetic gravity in a chart. Floral and shell motifs are its classic vocabulary." },
  { kind: "planet", slug: "mars", name: "Mars", glyph: "♂",
    keywords: ["drive", "action", "desire", "courage", "heat", "will"],
    interpretation: "Mars symbolizes drive and decisive action — the heat that gets things moving. Blade and ember motifs express its energy." },
  { kind: "planet", slug: "jupiter", name: "Jupiter", glyph: "♃",
    keywords: ["expansion", "luck", "wisdom", "growth", "abundance", "journey"],
    interpretation: "Jupiter symbolizes expansion, wisdom, and generous luck — the widening horizon. Laurel and starburst motifs suit its abundance story." },
  { kind: "planet", slug: "saturn", name: "Saturn", glyph: "♄",
    keywords: ["structure", "time", "discipline", "boundaries", "mastery", "lessons"],
    interpretation: "Saturn symbolizes structure, time, and earned mastery — the ring that holds a form together. Geometric ring motifs carry its weight." },
  { kind: "planet", slug: "uranus", name: "Uranus", glyph: "♅",
    keywords: ["innovation", "surprise", "freedom", "electricity", "awakening", "rebel"],
    interpretation: "Uranus symbolizes sudden insight and liberating change — the lightning bolt in the system. Electric, glitch-styled motifs fit its voice." },
  { kind: "planet", slug: "neptune", name: "Neptune", glyph: "♆",
    keywords: ["dream", "mysticism", "imagination", "dissolution", "ocean", "veil"],
    interpretation: "Neptune symbolizes dream, glamour, and the dissolving veil between real and imagined. Mist and deep-sea gradients speak its language." },
  { kind: "planet", slug: "pluto", name: "Pluto", glyph: "♇",
    keywords: ["transformation", "power", "depth", "rebirth", "shadow", "underworld"],
    interpretation: "Pluto symbolizes deep transformation and rebirth — compost into gold. Phoenix and underworld-garden motifs suit its intensity." },
  { kind: "aspect", slug: "conjunction", name: "Conjunction", glyph: "☌",
    keywords: ["fusion", "unity", "amplification", "merge", "zero degrees"],
    interpretation: "A conjunction (0°) symbolizes fusion: two voices speaking as one, amplifying each other for better or louder." },
  { kind: "aspect", slug: "sextile", name: "Sextile", glyph: "⚹",
    keywords: ["opportunity", "ease", "cooperation", "sixty degrees", "support"],
    interpretation: "A sextile (60°) symbolizes friendly opportunity: energies that cooperate easily when invited to." },
  { kind: "aspect", slug: "square", name: "Square", glyph: "□",
    keywords: ["friction", "challenge", "growth", "ninety degrees", "tension"],
    interpretation: "A square (90°) symbolizes productive friction: tension that demands adjustment and builds strength through it." },
  { kind: "aspect", slug: "trine", name: "Trine", glyph: "△",
    keywords: ["flow", "harmony", "talent", "one twenty degrees", "grace"],
    interpretation: "A trine (120°) symbolizes natural flow: energies in the same element that harmonize without effort." },
  { kind: "aspect", slug: "opposition", name: "Opposition", glyph: "☍",
    keywords: ["polarity", "balance", "mirror", "one eighty degrees", "awareness"],
    interpretation: "An opposition (180°) symbolizes polarity: a mirror across the wheel asking two sides to balance rather than battle." },

  // ── Angles ────────────────────────────────────────────────────────────────
  // Added in Update 5.2b. The Symbol Atlas exists to explain symbols already
  // visible in Orbit, and these appear on Me and in transit detail. Nothing was
  // added merely to lengthen the list.
  { kind: "angle", slug: "ascendant", name: "Ascendant", glyph: "AC",
    keywords: ["rising", "rising sign", "ascending", "first house cusp", "approach", "self"],
    interpretation: "The Ascendant is the sign rising on the eastern horizon at birth. It symbolizes first approach — how someone meets a room before anything else is known about them. It requires a reliable birth time." },
  { kind: "angle", slug: "midheaven", name: "Midheaven", glyph: "MC",
    keywords: ["mc", "medium coeli", "career", "public", "tenth house cusp", "direction"],
    interpretation: "The Midheaven is the highest point of the chart. It symbolizes public direction and what someone becomes known for. Like the Ascendant, it depends on a reliable birth time." },

  // ── Houses ────────────────────────────────────────────────────────────────
  { kind: "house", slug: "house-system", name: "Houses", glyph: "⌂",
    keywords: ["house", "houses", "placidus", "cusp", "sector", "area of life", "twelve"],
    interpretation: "The twelve houses divide the chart into areas of life — where a placement expresses itself rather than what it is. Houses are calculated from the birth time and location, so without a reliable birth time Orbit withholds them rather than guessing." },

  // ── Moon phases ───────────────────────────────────────────────────────────
  { kind: "moon", slug: "new-moon", name: "New Moon", glyph: "●",
    keywords: ["new", "dark moon", "beginning", "start", "zero percent", "seed"],
    interpretation: "The New Moon is the Sun and Moon together, with no lit face turned toward Earth. It symbolizes a beginning before there is anything to show for it." },
  { kind: "moon", slug: "first-quarter", name: "First Quarter", glyph: "◐",
    keywords: ["first quarter", "waxing", "half", "building", "decision"],
    interpretation: "A half-lit Moon growing toward full. It symbolizes the point where a beginning meets its first real resistance and a decision is required." },
  { kind: "moon", slug: "full-moon", name: "Full Moon", glyph: "○",
    keywords: ["full", "opposition", "culmination", "peak", "hundred percent", "visible"],
    interpretation: "The Moon fully lit and opposite the Sun. It symbolizes culmination — what was begun is now visible, for better or worse." },
  { kind: "moon", slug: "last-quarter", name: "Last Quarter", glyph: "◑",
    keywords: ["last quarter", "third quarter", "waning", "release", "half"],
    interpretation: "A half-lit Moon shrinking toward dark. It symbolizes release: keeping what worked and letting the rest go." },

  // ── Other notation ────────────────────────────────────────────────────────
  { kind: "other", slug: "retrograde", name: "Retrograde", glyph: "℞",
    keywords: ["retrograde", "rx", "backwards", "apparent motion", "review"],
    interpretation: "℞ marks a planet that appears to move backwards from Earth. Nothing actually reverses — it is a trick of relative orbits. Symbolically it reads as review rather than misfortune, and Orbit shows it in Technical Sky beside the position." },
  { kind: "other", slug: "applying", name: "Applying", glyph: "→",
    keywords: ["applying", "approaching", "tightening", "building", "exact"],
    interpretation: "An applying aspect is still tightening toward exact. It symbolizes something building rather than fading, which is why Orbit lists applying transits before separating ones." },
  { kind: "other", slug: "separating", name: "Separating", glyph: "←",
    keywords: ["separating", "waning", "loosening", "past exact", "fading"],
    interpretation: "A separating aspect has passed exact and is loosening. Its effect is understood to be fading rather than arriving." },
  { kind: "other", slug: "orb", name: "Orb", glyph: "°",
    keywords: ["orb", "degrees", "closeness", "tightness", "exactness", "tolerance"],
    interpretation: "An orb is how far an aspect is from exact, measured in degrees. A smaller orb means a tighter, more pointed contact — Orbit sorts transits by it." },
];

const MONTH_NAMES = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

const STOPWORDS = new Set([
  "a", "an", "and", "the", "is", "are", "was", "were", "be", "been", "of", "to",
  "in", "on", "for", "with", "about", "what", "whats", "which", "who", "how",
  "tell", "me", "my", "your", "i", "im", "it", "its", "do", "does", "can",
  "could", "would", "should", "that", "this", "these", "those", "or", "as",
  "at", "by", "from", "sign", "signs", "zodiac", "astrology", "mean", "means",
  "meaning", "symbol", "symbols", "please", "give", "show",
]);

// Sign-distance geometry: steps apart on the wheel -> aspect + harmony score.
export const DISTANCE_ASPECTS = {
  0: { aspect: "conjunction", score: 82, note: "same sign — a fusion of identical instincts" },
  1: { aspect: null, score: 52, note: "neighboring signs — adjacent chapters with little shared vocabulary" },
  2: { aspect: "sextile", score: 78, note: "two signs apart — a friendly sextile of compatible elements" },
  3: { aspect: "square", score: 55, note: "three signs apart — a square that trades comfort for growth" },
  4: { aspect: "trine", score: 88, note: "four signs apart — a trine sharing the same element" },
  5: { aspect: null, score: 48, note: "five signs apart — a quincunx asking for constant adjustment" },
  6: { aspect: "opposition", score: 65, note: "opposite signs — a polarity that can mirror or magnetize" },
};

export function tokenize(text) {
  const words = String(text).toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter(word => !STOPWORDS.has(word));
}

export function parseBirthDate(prompt) {
  const lowered = String(prompt).toLowerCase();
  const named = lowered.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  let month, day;
  if (named) {
    month = MONTH_NAMES[named[1]];
    day = parseInt(named[2], 10);
  } else {
    const numeric = lowered.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/);
    if (!numeric) return null;
    month = parseInt(numeric[1], 10);
    day = parseInt(numeric[2], 10);
  }
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return [month, day];
}

export function signSlugForDate(month, day) {
  let latest = "capricorn"; // covers Jan 1-19
  for (const [slug, [startMonth, startDay]] of SIGN_START_DATES) {
    if (month > startMonth || (month === startMonth && day >= startDay)) latest = slug;
  }
  return latest;
}

export function findSignMentions(prompt) {
  const lowered = String(prompt).toLowerCase();
  const found = [];
  for (const slug of ZODIAC_ORDER) {
    const position = lowered.indexOf(slug);
    if (position >= 0) found.push([position, slug]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, slug]) => slug);
}

export function symbolBySlug(slug) {
  return ORBIT_SYMBOLS.find(symbol => symbol.slug === slug) ?? null;
}

export function rankSymbols(prompt, limit = 3) {
  const tokens = tokenize(prompt);
  if (!tokens.length) return [];

  const ranked = [];
  for (const symbol of ORBIT_SYMBOLS) {
    const keywords = new Set(symbol.keywords ?? []);
    const interpretationWords = new Set(tokenize(symbol.interpretation ?? ""));
    const nameLower = symbol.name.toLowerCase();

    let score = 0;
    const matched = new Set();
    for (const token of tokens) {
      if (token === nameLower || token === symbol.slug) { score += 4; matched.add(token); }
      else if (keywords.has(token)) { score += 2; matched.add(token); }
      else if (interpretationWords.has(token)) { score += 1; matched.add(token); }
    }
    if (score > 0) {
      ranked.push({
        slug: symbol.slug, name: symbol.name, kind: symbol.kind, glyph: symbol.glyph,
        score, matched_terms: [...matched].sort(),
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return ranked.slice(0, limit);
}

export function signGeometry(signA, signB) {
  const indexA = ZODIAC_ORDER.indexOf(signA);
  const indexB = ZODIAC_ORDER.indexOf(signB);
  const rawDistance = Math.abs(indexA - indexB) % 12;
  const steps = Math.min(rawDistance, 12 - rawDistance);
  return { steps, ...DISTANCE_ASPECTS[steps] };
}

export function summarizeSign(symbol) {
  return `${symbol.name} ${symbol.glyph ?? ""} (${symbol.date_range ?? "no date range"}) — ` +
    `${symbol.element} element, ${symbol.modality} modality, ruled by ${symbol.ruling_planet}. ` +
    symbol.interpretation;
}

// Route a user prompt through Orbit's algorithms and compose a reply.
export function answerPrompt(prompt) {
  const signMentions = findSignMentions(prompt);
  const lowered = String(prompt).toLowerCase();
  const wantsCompatibility = /compatib|match|get along|pair|together|relationship/.test(lowered);

  if (signMentions.length >= 2 && (wantsCompatibility || signMentions.length === 2)) {
    const [signA, signB] = signMentions;
    const geometry = signGeometry(signA, signB);
    const symbolA = symbolBySlug(signA);
    const symbolB = symbolBySlug(signB);
    const aspect = geometry.aspect ? symbolBySlug(geometry.aspect) : null;

    const lines = [`${symbolA.name} ${symbolA.glyph} and ${symbolB.name} ${symbolB.glyph} sit ${geometry.note}.`];
    if (aspect) lines.push(aspect.interpretation);
    lines.push(
      `Symbolic harmony score: ${geometry.score}/100 ` +
      `(${symbolA.element} ${symbolA.modality} meets ${symbolB.element} ${symbolB.modality}).`
    );
    return {
      intent: "compatibility",
      reply: lines.join(" "),
      matches: [
        { slug: signA, name: symbolA.name, kind: "zodiac_sign", glyph: symbolA.glyph, score: geometry.score },
        { slug: signB, name: symbolB.name, kind: "zodiac_sign", glyph: symbolB.glyph, score: geometry.score },
      ],
      algorithm: "sign_distance_geometry",
      details: { steps_apart: geometry.steps, aspect: geometry.aspect, harmony_score: geometry.score },
    };
  }

  const birthDate = parseBirthDate(prompt);
  if (birthDate) {
    const [month, day] = birthDate;
    const slug = signSlugForDate(month, day);
    const symbol = symbolBySlug(slug);
    return {
      intent: "birth_date_lookup",
      reply: `A birth date of ${month}/${day} falls under ${symbol.name}. ${summarizeSign(symbol)}`,
      matches: [{ slug, name: symbol.name, kind: "zodiac_sign", glyph: symbol.glyph, score: 100 }],
      algorithm: "sign_date_boundaries",
      details: { month, day },
    };
  }

  if (signMentions.length === 1) {
    const symbol = symbolBySlug(signMentions[0]);
    return {
      intent: "sign_lookup",
      reply: summarizeSign(symbol),
      matches: [{ slug: symbol.slug, name: symbol.name, kind: "zodiac_sign", glyph: symbol.glyph, score: 100 }],
      algorithm: "direct_lookup",
      details: {},
    };
  }

  const ranked = rankSymbols(prompt);
  if (ranked.length) {
    const allTerms = [...new Set(ranked.flatMap(entry => entry.matched_terms))].sort();
    const lines = [`Your prompt orbits themes of ${allTerms.join(", ")}.`];
    for (const entry of ranked) {
      const symbol = symbolBySlug(entry.slug);
      lines.push(`${symbol.name} ${symbol.glyph} (match ${entry.score}): ${symbol.interpretation}`);
    }
    return {
      intent: "keyword_search",
      reply: lines.join(" "),
      matches: ranked,
      algorithm: "keyword_overlap_scoring",
      details: { tokens: tokenize(prompt) },
    };
  }

  return {
    intent: "unresolved",
    reply: 'Orbit could not find a symbolic match for that. Try a birth date ("born June 5"), a compatibility question ("Aries and Leo"), a sign or planet name, or a theme like courage, balance, or transformation.',
    matches: [],
    algorithm: "none",
    details: {},
  };
}
