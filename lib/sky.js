// Legacy symbolic-sky helpers that do not calculate lunar phase.
//
// Dev Update 1.1 removed this file's mean-cycle Moon implementation. Current
// phase, illumination, waxing/waning, and lunation instants now come only from
// Orbit Axis Engine through CurrentSkyContext.

import { SIGN_START_DATES, ORBIT_SYMBOLS, symbolBySlug } from "./symbols.js";

const DAY_MS = 86400000;

// Approximate Mercury retrograde windows (geocentric), labeled approximate in
// every response. Extend this table as years roll over.
const MERCURY_RETROGRADES = [
  { start: "2026-02-26", end: "2026-03-20" },
  { start: "2026-06-29", end: "2026-07-23" },
  { start: "2026-10-24", end: "2026-11-13" },
];

export const CHAKRAS = [
  { id: "root",      name: "Root",      sanskrit: "Muladhara",    color: "#ef4444", element: "earth", focus: "grounding, safety, stability",     note: "Base of the spine. When Orbit reads the room toward root, the moment calls for grounding before building." },
  { id: "sacral",    name: "Sacral",    sanskrit: "Svadhisthana", color: "#f97316", element: "water", focus: "flow, creativity, pleasure",       note: "Below the navel. Sacral moments favor creative flow and letting work feel good." },
  { id: "solar",     name: "Solar Plexus", sanskrit: "Manipura",  color: "#eab308", element: "fire",  focus: "will, momentum, confidence",       note: "Above the navel. Solar moments carry drive — push the project that needs force." },
  { id: "heart",     name: "Heart",     sanskrit: "Anahata",      color: "#22c55e", element: "air",   focus: "connection, warmth, balance",      note: "Center of the chest. Heart moments favor collaboration and generous review." },
  { id: "throat",    name: "Throat",    sanskrit: "Vishuddha",    color: "#3b82f6", element: "ether", focus: "expression, clarity, voice",       note: "The throat. Throat moments are for writing copy, naming things, and saying it plainly." },
  { id: "third-eye", name: "Third Eye", sanskrit: "Ajna",         color: "#6366f1", element: "light", focus: "insight, focus, pattern-seeing",   note: "Between the brows. Third-eye moments favor deep focus and analysis." },
  { id: "crown",     name: "Crown",     sanskrit: "Sahasrara",    color: "#a855f7", element: "thought", focus: "rest, integration, release",     note: "Top of the head. Crown moments ask for rest and letting the work integrate." },
];

function seasonBounds(date) {
  const year = date.getFullYear();
  // Build the season start dates around this date, then find the current one.
  const starts = [];
  for (const offset of [-1, 0, 1]) {
    for (const [slug, [month, day]] of SIGN_START_DATES) {
      starts.push({ slug, start: new Date(year + offset, month - 1, day) });
    }
  }
  starts.sort((a, b) => a.start - b.start);
  let current = starts[0];
  let next = starts[1];
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i].start <= date && date < starts[i + 1].start) {
      current = starts[i];
      next = starts[i + 1];
      break;
    }
  }
  return { current, next };
}

export function sunSeason(date = new Date()) {
  const { current, next } = seasonBounds(date);
  const symbol = symbolBySlug(current.slug);
  const total = next.start - current.start;
  const elapsed = date - current.start;
  return {
    sign: current.slug,
    name: symbol.name,
    glyph: symbol.glyph,
    element: symbol.element,
    modality: symbol.modality,
    ruling_planet: symbol.ruling_planet,
    date_range: symbol.date_range,
    season_started: current.start.toISOString().slice(0, 10),
    season_ends: next.start.toISOString().slice(0, 10),
    progress_pct: Math.min(99, Math.max(0, Math.round((elapsed / total) * 100))),
    next_sign: symbolBySlug(next.slug).name,
  };
}

export function mercuryStatus(date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  for (const window of MERCURY_RETROGRADES) {
    if (iso >= window.start && iso <= window.end) {
      return { retrograde: true, window, message: `Mercury is retrograde (${window.start} → ${window.end}).`, accuracy: "approximate" };
    }
  }
  const upcoming = MERCURY_RETROGRADES.find(window => window.start > iso);
  return {
    retrograde: false,
    next_window: upcoming ?? null,
    message: upcoming
      ? `Mercury is direct. Next retrograde ${upcoming.start} → ${upcoming.end}.`
      : "Mercury is direct. No retrograde windows left in the loaded table — extend MERCURY_RETROGRADES.",
    accuracy: "approximate",
  };
}

// Deterministic symbol of the day: rotates through the atlas by date.
export function symbolOfTheDay(date = new Date()) {
  const daysSinceEpoch = Math.floor(date.getTime() / DAY_MS);
  return ORBIT_SYMBOLS[daysSinceEpoch % ORBIT_SYMBOLS.length];
}

export function upcomingEvents(date = new Date(), count = 8, { currentSkyContext = null } = {}) {
  const events = [];

  // Sun ingresses (next 3 sign seasons)
  let cursor = new Date(date);
  for (let i = 0; i < 3; i++) {
    const { next } = seasonBounds(cursor);
    const symbol = symbolBySlug(next.slug);
    events.push({
      date: next.start.toISOString().slice(0, 10),
      kind: "sun_ingress",
      title: `Sun enters ${symbol.name} ${symbol.glyph}`,
      detail: `${symbol.name} season begins — ${symbol.element} ${symbol.modality}. ${symbol.keywords.slice(0, 3).join(", ")}.`,
    });
    cursor = new Date(next.start.getTime() + DAY_MS);
  }

  // Lunations come only from the engine-backed CurrentSkyContext. The old
  // implementation projected a mean synodic cycle here, which could disagree
  // with Home's Swiss Ephemeris phase and waxing/waning state.
  if (!currentSkyContext?.next_full_moon || !currentSkyContext?.next_new_moon) {
    throw new TypeError("upcomingEvents requires a canonical CurrentSkyContext");
  }
  events.push({
    date: currentSkyContext.next_full_moon.local_date,
    instant_utc: currentSkyContext.next_full_moon.instant_utc,
    kind: "full_moon",
    title: "Full Moon 🌕",
    detail: "Peak illumination — culmination and visibility moments.",
    source: "orbit-axis-engine",
  });
  events.push({
    date: currentSkyContext.next_new_moon.local_date,
    instant_utc: currentSkyContext.next_new_moon.instant_utc,
    kind: "new_moon",
    title: "New Moon 🌑",
    detail: "Dark sky — beginnings and intention-setting moments.",
    source: "orbit-axis-engine",
  });

  // Mercury retrograde boundaries
  const iso = date.toISOString().slice(0, 10);
  for (const window of MERCURY_RETROGRADES) {
    if (window.start >= iso) events.push({ date: window.start, kind: "mercury_rx", title: "Mercury stations retrograde ☿", detail: `Retrograde through ${window.end} — review, revise, back up. (approximate)` });
    if (window.end >= iso) events.push({ date: window.end, kind: "mercury_direct", title: "Mercury stations direct ☿", detail: "Retrograde ends — clearer lanes for launches and messaging. (approximate)" });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events.filter(event => event.date >= iso).slice(0, count);
}
