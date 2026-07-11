// Today's-sky calculations. Lunations use the mean synodic month against a
// reference new moon, accurate to within about a day — good enough for a
// symbolic timing app, and every payload is labeled approximate.

import { SIGN_START_DATES, ZODIAC_ORDER, ORBIT_SYMBOLS, symbolBySlug } from "./symbols.js";

const SYNODIC_MONTH = 29.53058867; // days
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
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

const PHASE_NAMES = [
  { max: 1.0, name: "New Moon", glyph: "🌑" },
  { max: 6.38, name: "Waxing Crescent", glyph: "🌒" },
  { max: 8.38, name: "First Quarter", glyph: "🌓" },
  { max: 13.77, name: "Waxing Gibbous", glyph: "🌔" },
  { max: 15.77, name: "Full Moon", glyph: "🌕" },
  { max: 21.15, name: "Waning Gibbous", glyph: "🌖" },
  { max: 23.15, name: "Last Quarter", glyph: "🌗" },
  { max: 28.53, name: "Waning Crescent", glyph: "🌘" },
  { max: 29.54, name: "New Moon", glyph: "🌑" },
];

export function moonPhase(date = new Date()) {
  const age = ((date.getTime() - REFERENCE_NEW_MOON) / DAY_MS) % SYNODIC_MONTH;
  const normalizedAge = age < 0 ? age + SYNODIC_MONTH : age;
  const illumination = (1 - Math.cos((2 * Math.PI * normalizedAge) / SYNODIC_MONTH)) / 2;
  const phase = PHASE_NAMES.find(entry => normalizedAge <= entry.max) ?? PHASE_NAMES[0];

  const daysToNew = (SYNODIC_MONTH - normalizedAge) % SYNODIC_MONTH;
  const halfMonth = SYNODIC_MONTH / 2;
  const daysToFull = normalizedAge <= halfMonth ? halfMonth - normalizedAge : SYNODIC_MONTH - normalizedAge + halfMonth;

  return {
    age_days: Math.round(normalizedAge * 10) / 10,
    phase: phase.name,
    glyph: phase.glyph,
    illumination_pct: Math.round(illumination * 100),
    waxing: normalizedAge < halfMonth,
    next_full_moon: new Date(date.getTime() + daysToFull * DAY_MS).toISOString().slice(0, 10),
    next_new_moon: new Date(date.getTime() + daysToNew * DAY_MS).toISOString().slice(0, 10),
    accuracy: "approximate (mean synodic cycle, ±1 day)",
  };
}

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

export function upcomingEvents(date = new Date(), count = 8) {
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

  // Lunations (next ~3 cycles of new + full)
  const moon = moonPhase(date);
  let full = new Date(moon.next_full_moon);
  let nw = new Date(moon.next_new_moon);
  for (let i = 0; i < 3; i++) {
    events.push({ date: full.toISOString().slice(0, 10), kind: "full_moon", title: "Full Moon 🌕", detail: "Peak illumination — culmination and visibility moments. (approximate)" });
    events.push({ date: nw.toISOString().slice(0, 10), kind: "new_moon", title: "New Moon 🌑", detail: "Dark sky — beginnings and intention-setting moments. (approximate)" });
    full = new Date(full.getTime() + SYNODIC_MONTH * DAY_MS);
    nw = new Date(nw.getTime() + SYNODIC_MONTH * DAY_MS);
  }

  // Mercury retrograde boundaries
  const iso = date.toISOString().slice(0, 10);
  for (const window of MERCURY_RETROGRADES) {
    if (window.start >= iso) events.push({ date: window.start, kind: "mercury_rx", title: "Mercury stations retrograde ☿", detail: `Retrograde through ${window.end} — review, revise, back up. (approximate)` });
    if (window.end >= iso) events.push({ date: window.end, kind: "mercury_direct", title: "Mercury stations direct ☿", detail: "Retrograde ends — clearer lanes for launches and messaging. (approximate)" });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events.filter(event => event.date >= iso).slice(0, count);
}

export function chartNow(date = new Date()) {
  return {
    generated_at: date.toISOString(),
    sun: sunSeason(date),
    moon: moonPhase(date),
    mercury: mercuryStatus(date),
    symbol_of_the_day: symbolOfTheDay(date),
    zodiac_order: ZODIAC_ORDER,
  };
}
