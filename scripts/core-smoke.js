#!/usr/bin/env node
// Orbit Core :: end-to-end calculation smoke test (Update 4.0.4).
//
//   npm run orbit:core:smoke
//   npm run orbit:core:smoke -- --json
//
// Runs the whole calculation chain that every Orbit feature depends on:
//
//   natal chart → current sky → personal transits → Ask Orbit evidence → fortune
//
// It uses fixed synthetic birth data (never a real person) and touches NOTHING
// else: no Supabase, no Ollama, no network, no filesystem writes. That is what
// makes it runnable inside a bare Linux container to prove that Orbit's
// astrology works off the owner's Mac.
//
// Exit code 0 means every stage produced a structurally valid result.

import { computeNatalChart, CALCULATION_VERSION } from "../lib/astro/natal.js";
import { currentSky, SKY_VERSION } from "../lib/astro/current-sky.js";
import { personalTransits, composeFortune, FORTUNE_ENGINE_VERSION } from "../lib/fortune/engine.js";
import { buildAskContext, ASK_ENGINE_VERSION } from "../lib/ask-orbit/context-engine.js";
import { runtimeKey } from "../lib/astro/runtime/resolve.js";
import { EPHEMERIS_VERSION } from "../lib/astro/ephemeris.js";

const asJson = process.argv.includes("--json");

// Synthetic, non-sensitive. Chicago, 1990-06-15 14:30 local (UTC-5).
// Field names match computeNatalChart's contract exactly.
const PROFILE = {
  id: "00000000-0000-4000-8000-000000000001",
  nickname: "Smoke Fixture",
  birth_date: "1990-06-15",
  birth_time: "14:30",
  time_accuracy: "exact",
  latitude: 41.8781,
  longitude: -87.6298,
  utc_offset_at_birth: "-05:00",
  house_system: "placidus",
  timezone_name: "America/Chicago",
};
// Fixed instant so the run is deterministic and comparable across platforms.
const AT = new Date("2026-07-20T12:00:00Z");

const stages = [];
const stage = (name, ok, detail, data = null) => { stages.push({ name, ok, detail, data }); return ok; };

let chart = null, sky = null, transits = null, ask = null, fortune = null;

try {
  chart = computeNatalChart(PROFILE);
  const planets = Object.keys(chart.planets || {}).length;
  const houses = (chart.houses || []).length;
  const asc = chart.angles?.ascendant ?? null;
  stage("natal-chart", planets >= 10 && houses === 12 && Boolean(asc) && chart.calculation_status === "complete",
    `${planets} planets, ${houses} houses, Ascendant ${asc?.sign ?? "missing"}, status ${chart.calculation_status}.`,
    { sun: chart.planets?.Sun?.longitude, asc: asc?.longitude });
} catch (e) { stage("natal-chart", false, `${e.name}: ${e.code || e.message}`); }

try {
  sky = currentSky(AT);
  const planets = Object.keys(sky.planets || {}).length;
  stage("current-sky", planets >= 10 && Boolean(sky.moon?.phase_name) && Boolean(sky.snapshot_hash),
    `${planets} planets, Moon ${sky.moon?.sign} ${sky.moon?.phase_name} at ${sky.moon?.illumination_percent}%, ${sky.retrogrades?.length ?? 0} retrograde.`,
    { sun: sky.planets?.Sun?.longitude, hash: sky.snapshot_hash });
} catch (e) { stage("current-sky", false, `${e.name}: ${e.code || e.message}`); }

try {
  transits = personalTransits(sky, chart, 3);
  stage("transits", Array.isArray(transits),
    `${transits.length} personal transit(s) within a 3° orb.`,
    { sample: transits.slice(0, 2).map((t) => `${t.transiting} ${t.aspect} natal ${t.natal} (orb ${t.orb?.toFixed?.(2)})`) });
} catch (e) { stage("transits", false, `${e.name}: ${e.code || e.message}`); }

try {
  ask = buildAskContext({
    active: { profile: PROFILE, chart },
    sky,
    detailMode: "Simple",
    question: "How is the current sky affecting me?",
    limit: 6,
  });
  const ev = ask.evidence || [];
  // Every evidence item must carry a label produced by a calculation. An empty
  // evidence list after a successful chart+sky is a real failure, not an empty
  // state: it would mean Ask Orbit had nothing calculated to stand on.
  const allSourced = ev.every((e) => e && typeof e.type === "string" && typeof e.relevance === "number");
  stage("ask-evidence", ev.length > 0 && allSourced && ask.engineVersion === ASK_ENGINE_VERSION && Boolean(ask.answerPlan),
    `${ev.length} evidence item(s), type(s): ${(ask.questionType || []).join(", ") || "none"}, reliability ${ask.birthTimeReliability}.`,
    { first: ev[0] ? `${ev[0].transitingBody ?? ev[0].body ?? ev[0].type} ${ev[0].aspect ?? ""} ${ev[0].natalBody ?? ""}`.trim() : null });
} catch (e) { stage("ask-evidence", false, `${e.name}: ${e.code || e.message}`); }

try {
  fortune = composeFortune({
    chart, sky, localDate: "2026-07-20", timezoneName: PROFILE.timezone_name,
    chartId: PROFILE.id, chartInputHash: "smoke",
  });
  const parts = ["mood", "love_reading", "luck_reading", "watch_out", "lucky_number", "lucky_color"];
  const present = parts.filter((k) => fortune?.[k] !== undefined && fortune[k] !== null && fortune[k] !== "");
  stage("fortune", present.length === parts.length && Boolean(fortune.seed_hash),
    `${present.length}/${parts.length} reading part(s) composed, ${(fortune.factors || []).length} factor(s).`);
} catch (e) { stage("fortune", false, `${e.name}: ${e.code || e.message}`); }

// ── report ──────────────────────────────────────────────────────────────────
const failed = stages.filter((s) => !s.ok);
const summary = {
  platform: runtimeKey(),
  ephemeris: EPHEMERIS_VERSION,
  versions: { natal: CALCULATION_VERSION, sky: SKY_VERSION, ask: ASK_ENGINE_VERSION, fortune: FORTUNE_ENGINE_VERSION },
  ok: failed.length === 0,
  stages,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("Orbit Core end-to-end calculation smoke test");
  console.log("");
  console.log(`  Platform:   ${summary.platform}`);
  console.log(`  Ephemeris:  ${summary.ephemeris}`);
  console.log("");
  for (const s of stages) {
    console.log(`  ${s.ok ? "ok  " : "FAIL"}  ${s.name.padEnd(14)} ${s.detail}`);
  }
  console.log("");
  // Printed so a cross-platform comparison is a diff, not a judgement call.
  console.log(`  natal Sun longitude : ${stages.find((s) => s.name === "natal-chart")?.data?.sun}`);
  console.log(`  natal Ascendant     : ${stages.find((s) => s.name === "natal-chart")?.data?.asc}`);
  console.log(`  sky Sun longitude   : ${stages.find((s) => s.name === "current-sky")?.data?.sun}`);
  console.log("");
  console.log("  Contacted: nothing. No Supabase, no Ollama, no network.");
  console.log("");
}

if (failed.length) {
  console.error(`CORE SMOKE FAILED — ${failed.length} stage(s) did not produce a valid result on ${summary.platform}.`);
  process.exit(1);
}
console.log(`Core smoke OK on ${summary.platform}.`);
