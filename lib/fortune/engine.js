// Orbit Axis :: deterministic Daily Fortune engine.
//
// Pure and deterministic. The same active chart on the same local date always
// produces the same fortune. Selection is seeded from a SHA-256 of
// (localDate, chartId, chartInputHash, skySnapshotHash, version) — never a
// nondeterministic random source.
// No network, no LLM: all astrology comes from the local Swiss Ephemeris
// engine (natal.js / current-sky.js). Ollama may later smooth wording, but the
// deterministic output here is the source of truth.

import { createHash } from "node:crypto";
import { elementOf, modalityOf } from "../astro/natal.js";

export const FORTUNE_ENGINE_VERSION = "fortune-v1";

const ELEMENTS = { Fire: "fire", Earth: "earth", Air: "air", Water: "water" };

// ── seeded, deterministic selection ──────────────────────────────────────────
export function fortuneSeed({ localDate, chartId, chartInputHash, skySnapshotHash }) {
  return createHash("sha256")
    .update([localDate, chartId || "local", chartInputHash || "", skySnapshotHash || "", FORTUNE_ENGINE_VERSION].join("|"))
    .digest("hex");
}
function streamInt(seed, label, mod) {
  const h = createHash("sha256").update(`${seed}:${label}`).digest("hex");
  return parseInt(h.slice(0, 8), 16) % mod;
}
function pick(seed, label, arr) {
  return arr[streamInt(seed, label, arr.length)];
}

// ── local date for a timezone (never the server's tz) ────────────────────────
export function localDateForZone(date, timezoneName) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezoneName || "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    });
    return fmt.format(date); // en-CA => YYYY-MM-DD
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  }
}

// ── geometry (transiting body vs fixed natal body) ───────────────────────────
function sep(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
const TRANSIT_ASPECTS = [
  { name: "conjunction", angle: 0, plain: "meeting" },
  { name: "sextile", angle: 60, plain: "gently supporting" },
  { name: "square", angle: 90, plain: "pushing against" },
  { name: "trine", angle: 120, plain: "flowing with" },
  { name: "opposition", angle: 180, plain: "pulling against" },
];
const SOFT = new Set(["trine", "sextile"]);
const HARD = new Set(["square", "opposition"]);

// Major aspects from current (moving) planets to natal (fixed) planets.
export function personalTransits(sky, chart, orbLimit = 3) {
  const out = [];
  const transiting = ["Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  const natalBodies = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  for (const t of transiting) {
    const tp = sky.planets?.[t];
    if (!tp) continue;
    for (const n of natalBodies) {
      const np = chart.planets?.[n];
      if (!np) continue;
      const s = sep(tp.longitude, np.longitude);
      for (const asp of TRANSIT_ASPECTS) {
        const orb = Math.abs(s - asp.angle);
        if (orb > orbLimit) continue;
        // applying if the transiting body (natal fixed) tightens the orb over 1 day
        const future = ((tp.longitude + (tp.speed || 0)) % 360 + 360) % 360;
        const orbFuture = Math.abs(sep(future, np.longitude) - asp.angle);
        out.push({
          transiting: t, natal: n, aspect: asp.name, plain: asp.plain,
          orb: Math.round(orb * 100) / 100, applying: orbFuture < orb,
          soft: SOFT.has(asp.name), hard: HARD.has(asp.name),
          t_lon: tp.longitude, n_lon: np.longitude,
        });
        break;
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}

// ── curated fragment banks (plain language, beginner-first) ──────────────────
const MOOD_BY_PHASE = {
  "New Moon": ["a quiet, fresh-start feeling — a good day to set one small intention", "a clean-slate mood; keep the day gentle and open"],
  "Waxing Crescent": ["a little momentum building — small steps feel doable", "soft forward motion; follow what's slowly gaining energy"],
  "First Quarter": ["a nudge to act on something you've been turning over", "a decision point — a small push moves things along"],
  "Waxing Gibbous": ["a tidy-the-loose-ends mood; refining feels good", "almost-there energy — polish rather than start"],
  "Full Moon": ["feelings run a little brighter and fuller than usual", "things feel vivid today; let emotions have some room"],
  "Waning Gibbous": ["a reflective, share-what-you've-learned kind of day", "a settling mood — good for honest conversations"],
  "Last Quarter": ["a good day to let go of one small thing", "release energy; loosen your grip on what's done"],
  "Waning Crescent": ["rest and daydreaming are allowed — move slowly", "a soft, low-key day; conserve your energy"],
};
const MOOD_ELEMENT = {
  Fire: "with a spark of warmth behind it", Earth: "with a steady, grounded feel",
  Air: "with a light, curious edge", Water: "with a tender, feelings-first undertone",
};

const LOVE_BY_ELEMENT = {
  Fire: ["warmth and playfulness come easily — say the bold, kind thing", "affection wants to be expressed openly today"],
  Earth: ["small, practical gestures of care land best today", "steadiness and reliability feel like love right now"],
  Air: ["good conversation is the way to closeness today", "connection grows through words and shared curiosity"],
  Water: ["tenderness and quiet presence matter more than grand gestures", "let yourself feel and gently share it"],
};
const LUCK_BY_SEASON = {
  base: ["doors feel a little easier to nudge open — notice small yeses", "conditions favor trying the thing you keep almost-doing", "a good window to ask, apply, or reach out", "supportive timing for learning and small bets"],
};
const WATCHOUT_GENERAL = [
  "give yourself a little extra time — rushing is where small mix-ups sneak in",
  "double-check the details before you commit to them",
  "pause before reacting; a short breath saves a long detour",
  "keep plans a bit flexible today",
];

// Lucky color — curated, all readable on the dark navy base.
const LUCKY_COLORS = [
  { name: "Lavender Mist", value: "#B8A7FF" }, { name: "Periwinkle", value: "#A6B1FF" },
  { name: "Moon White", value: "#EAEEFF" }, { name: "Soft Blush", value: "#FFB7C5" },
  { name: "Electric Blue", value: "#6FA8FF" }, { name: "Indigo Glow", value: "#8C7BFF" },
  { name: "Pale Gold", value: "#F0D48C" }, { name: "Sea Glass", value: "#8FE3D0" },
  { name: "Rosewater", value: "#F3C6D6" }, { name: "Amethyst", value: "#C08CFF" },
  { name: "Starlight Silver", value: "#D7DEF5" }, { name: "Twilight Teal", value: "#79D6E6" },
];

// ── lucky number: documented numerology reduction ────────────────────────────
// Rule: sum the digits of the local date (YYYYMMDD) plus a chart-seed offset
// (0..98), then digit-sum repeatedly to a single 1..9 (0 maps to 9). Stable for
// a given chart + day because both inputs are stable.
export function luckyNumber(seed, localDate) {
  const digits = localDate.replace(/-/g, "").split("").reduce((s, d) => s + Number(d), 0);
  let n = digits + streamInt(seed, "lucky-number", 99);
  while (n > 9) n = String(n).split("").reduce((s, d) => s + Number(d), 0);
  return n === 0 ? 9 : n;
}

function planetSign(chart, name) { return chart.planets?.[name]?.sign || null; }
function skySign(sky, name) { return sky.planets?.[name]?.sign || sky[name.toLowerCase()]?.sign || null; }

// ── main composition ─────────────────────────────────────────────────────────
// chart: computeNatalChart(...) output. sky: currentSky(...) output.
export function composeFortune({ chart, sky, localDate, timezoneName, chartId, chartInputHash }) {
  const seed = fortuneSeed({ localDate, chartId, chartInputHash, skySnapshotHash: sky.snapshot_hash });
  const transits = personalTransits(sky, chart);

  // ── Mood ──
  const moonPhase = sky.moon.phase_name;
  const moodBase = pick(seed, "mood", MOOD_BY_PHASE[moonPhase] || MOOD_BY_PHASE["Waning Crescent"]);
  const moonElement = elementOf(sky.moon.sign);
  const mood = `${cap(moodBase)} ${MOOD_ELEMENT[moonElement] || ""}.`.replace(/\s+\./, ".");

  // ── Love ── (natal Venus element, colored by any Venus/Mars transit)
  const venusSign = planetSign(chart, "Venus") || sky.moon.sign;
  const loveEl = elementOf(venusSign) || "Water";
  let love = cap(pick(seed, "love", LOVE_BY_ELEMENT[loveEl])) + ".";
  const venusTransit = transits.find((t) => (t.transiting === "Venus" || t.natal === "Venus") && t.soft);
  if (venusTransit) love += " Affection and ease may line up a little more naturally today.";

  // ── Luck ── (framed as favorable conditions; never a promise)
  let luck = cap(pick(seed, "luck", LUCK_BY_SEASON.base)) + ".";
  const jupiterTransit = transits.find((t) => (t.transiting === "Jupiter" || t.natal === "Jupiter") && t.soft);
  if (jupiterTransit) luck += " A supportive, growth-friendly note is in the mix.";
  luck += " (Conditions to notice, not guarantees.)";

  // ── Watch-Out ── (retrogrades + hard transits, practical, no fear)
  let watch;
  if (sky.retrogrades.includes("Mercury")) {
    watch = "Mercury is retrograde, so double-check messages, plans, and travel details before you lock them in";
  } else {
    const hard = transits.find((t) => t.hard);
    watch = hard
      ? `A ${hard.transiting}–${hard.natal} tension is in play — ${pick(seed, "watch", WATCHOUT_GENERAL)}`
      : cap(pick(seed, "watch", WATCHOUT_GENERAL));
  }
  watch += ".";

  const lucky_number = luckyNumber(seed, localDate);
  const lucky_color = pick(seed, "lucky-color", LUCKY_COLORS);

  const factors = buildFactors(sky, chart, transits);

  return {
    fortune_engine_version: FORTUNE_ENGINE_VERSION,
    fortune_date: localDate,
    timezone_name: timezoneName || "UTC",
    chart_id: chartId || null,
    seed_hash: seed,
    sky_snapshot: {
      zodiac_season: sky.zodiac_season,
      moon_sign: sky.moon.sign,
      moon_phase: sky.moon.phase_name,
      illumination_percent: sky.moon.illumination_percent,
      waxing: sky.moon.waxing,
      retrogrades: sky.retrogrades,
    },
    mood, love_reading: love, luck_reading: luck, watch_out: watch,
    lucky_number, lucky_color,
    factors,
  };
}

// ── "Why this reading" factors, phrased per detail level ─────────────────────
// Update Two removed the Balanced level: each factor now carries only `simple`
// and `advanced` phrasings. (Stored rows from before the update may still hold a
// `balanced` key; factorsForLevel simply never reads it.)
function buildFactors(sky, chart, transits) {
  const f = [];
  f.push({
    type: "season",
    simple: `The Sun is in ${sky.zodiac_season} season`,
    advanced: `Sun ${fmtDeg(sky.sun)} ${sky.sun.sign}`,
  });
  f.push({
    type: "moon",
    simple: `The Moon is in ${sky.moon.sign} and ${sky.moon.waxing ? "waxing (growing)" : "waning (shrinking)"} — ${Math.round(sky.moon.illumination_percent)}% lit`,
    advanced: `Moon ${fmtDeg(sky.moon)} ${sky.moon.sign}, ${sky.moon.phase_name}, ${sky.moon.illumination_percent}% illuminated, ${sky.moon.waxing ? "waxing" : "waning"}`,
  });
  for (const r of sky.retrogrades) {
    f.push({ type: "retrograde", simple: `${r} is retrograde (a review-and-slow-down signal)`, advanced: `${r} retrograde` });
  }
  for (const t of transits.slice(0, 3)) {
    f.push({
      type: "transit",
      simple: plainTransit(t),
      advanced: `Transiting ${t.transiting} ${t.aspect} natal ${t.natal}, orb ${fmtOrb(t.orb)}, ${t.applying ? "applying" : "separating"}`,
    });
  }
  return f;
}

function plainTransit(t) {
  const map = {
    Venus: "affection", Mars: "drive", Moon: "feelings", Sun: "sense of self",
    Mercury: "thinking and talking", Jupiter: "growth and luck", Saturn: "structure and limits",
  };
  const a = map[t.transiting] || t.transiting, b = map[t.natal] || t.natal;
  if (t.soft) return `Today's ${a} works together with your natural ${b}`;
  if (t.hard) return `Today's ${a} rubs against your natural ${b} — a little friction to work with`;
  return `Today's ${a} meets your natural ${b}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtDeg(b) { return b.degrees != null ? `${b.degrees}°${String(b.minutes ?? 0).padStart(2, "0")}′` : ""; }
function fmtOrb(orb) { const d = Math.floor(orb); const m = Math.round((orb - d) * 60); return `${d}°${String(m).padStart(2, "0")}′`; }

// Render the factor list at a given detail level (Simple | Advanced). Any
// non-Advanced value — including a legacy "Balanced" — renders as Simple.
export function factorsForLevel(factors, level) {
  const key = level === "Advanced" ? "advanced" : "simple";
  return factors.map((f) => f[key] ?? f.simple);
}
