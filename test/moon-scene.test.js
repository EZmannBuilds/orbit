// Orbit Axis :: the Moon scene's deterministic layer.
//
// The scene is mostly CSS and SVG, which tests cannot see. What they CAN
// pin down is everything the look depends on: that the stars never move
// between renders, that the phase geometry comes from canonical data, and that
// a missing field becomes a missing scene rather than a confident wrong Moon.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  starField, STAR_COUNT, STAR_SEED, SHOOTING_STAR, SHOOTING_STAR_KEY,
  sceneInputs, illuminationLabel, moonPositionLabel, MOTION,
  OBSERVER_ORIENTATION_SUPPORTED, SCALE_ACCURATE, ORIENTATION_NOTE,
} from "../public/moon-scene.js";
import { moonState } from "../lib/home/highlights.js";
import { moonPhasePathD, moonAccessibleLabel } from "../public/moon-phase.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// ── The star field ──────────────────────────────────────────────────────────

test("the star field is identical on every call, not random", () => {
  const a = starField();
  const b = starField();
  assert.equal(a.length, STAR_COUNT);
  assert.deepEqual(a, b, "two renders must produce the same sky");
  // And a third time, after other work, in case of hidden generator state.
  starField(10, 1);
  assert.deepEqual(starField(), a);
});

test("a different seed gives a different sky, so the seed is doing the work", () => {
  assert.notDeepEqual(starField(STAR_COUNT, STAR_SEED + 1), starField());
});

test("stars stay out of the band where the Earth arc and text live", () => {
  for (const s of starField()) {
    assert.ok(s.y >= 0 && s.y <= 62, `star at ${s.y}% intrudes on the lower band`);
    assert.ok(s.x >= 0 && s.x <= 100);
    assert.ok(s.o > 0 && s.o < 1, "never invisible and never fully opaque");
    assert.ok(s.r > 0 && s.r < 2, "restrained density, not a starburst");
  }
});

test("nothing in the scene layer is random or clock-dependent", () => {
  const src = readFileSync(join(ROOT, "public", "moon-scene.js"), "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");
  assert.ok(!code.includes("Math.random"), "no Math.random in the scene layer");
  assert.ok(!code.includes("Date.now"), "no clock-dependent geometry");
  assert.ok(!code.includes("fetch("), "the scene layer makes no requests");
});

test("the shooting star has a fixed trajectory and a non-personal session key", () => {
  assert.ok(Number.isFinite(SHOOTING_STAR.x1) && Number.isFinite(SHOOTING_STAR.y2));
  assert.ok(SHOOTING_STAR.durationMs > 0 && SHOOTING_STAR.durationMs < 4000,
    "brief enough to read as a glance, not an animation");
  assert.match(SHOOTING_STAR_KEY, /^oa_/);
  assert.doesNotMatch(SHOOTING_STAR_KEY, /user|email|id|chart|birth/i,
    "the session key names nothing personal");
});

// ── Phase geometry, from canonical data only ────────────────────────────────

const PHASES = [
  { phase: "New Moon", illumination: 0, waxing: true },
  { phase: "Waxing Crescent", illumination: 24, waxing: true },
  { phase: "First Quarter", illumination: 50, waxing: true },
  { phase: "Waxing Gibbous", illumination: 78, waxing: true },
  { phase: "Full Moon", illumination: 100, waxing: true },
  { phase: "Waning Gibbous", illumination: 78, waxing: false },
  { phase: "Last Quarter", illumination: 50, waxing: false },
  { phase: "Waning Crescent", illumination: 24, waxing: false },
];

test("all eight canonical phases produce scene inputs", () => {
  for (const p of PHASES) {
    const s = sceneInputs(p);
    assert.ok(s, `${p.phase} produced nothing`);
    assert.equal(s.phase, p.phase);
    assert.equal(s.direction, p.waxing ? "waxing" : "waning");
    assert.ok(s.fraction >= 0 && s.fraction <= 1);
  }
});

test("waxing and waning of the same illumination draw differently", () => {
  for (const pct of [24, 50, 78]) {
    const wax = moonPhasePathD(66, 66, 62, pct / 100, true);
    const wane = moonPhasePathD(66, 66, 62, pct / 100, false);
    assert.notEqual(wax, wane,
      `${pct}% waxing and waning must not share artwork`);
  }
});

test("crescent and gibbous draw differently, and New is not Full", () => {
  const crescent = moonPhasePathD(66, 66, 62, 0.24, true);
  const gibbous = moonPhasePathD(66, 66, 62, 0.78, true);
  assert.notEqual(crescent, gibbous);
  const newMoon = moonPhasePathD(66, 66, 62, 0, true);
  const full = moonPhasePathD(66, 66, 62, 1, true);
  assert.notEqual(newMoon, full, "a New Moon must never render as a Full Moon");
});

test("the same payload always produces the same geometry", () => {
  const once = PHASES.map((p) => moonPhasePathD(66, 66, 62, p.illumination / 100, p.waxing));
  const twice = PHASES.map((p) => moonPhasePathD(66, 66, 62, p.illumination / 100, p.waxing));
  assert.deepEqual(once, twice);
});

test("the scene claims phase, never observer orientation or scale", () => {
  assert.equal(OBSERVER_ORIENTATION_SUPPORTED, false);
  assert.equal(SCALE_ACCURATE, false);
  assert.match(ORIENTATION_NOTE, /not the tilt/i);
});

// ── Missing and malformed data ──────────────────────────────────────────────

test("a missing field yields no scene rather than a default Full Moon", () => {
  assert.equal(sceneInputs(null), null);
  assert.equal(sceneInputs({}), null);
  assert.equal(sceneInputs({ phase: "Full Moon" }), null, "no illumination, no scene");
  assert.equal(sceneInputs({ illumination: 100 }), null, "no phase name, no scene");
});

test("moonState survives a payload missing degree and elongation", () => {
  const sky = { moon: { phase_name: "Full Moon", illumination_percent: 99.6, waxing: false, sign: "Leo" } };
  const m = moonState(sky);
  assert.equal(m.degrees, null, "an absent degree is null, never 0");
  assert.equal(m.elongation, null);
  assert.equal(m.illumination, 100, "illumination is rounded once, at the source");
  assert.equal(moonPositionLabel(m), "Moon in Leo", "the degree line degrades to the sign");
});

test("moonState carries the canonical degree and phase angle when present", () => {
  const sky = { moon: {
    phase_name: "Waxing Gibbous", illumination_percent: 82.7, waxing: true,
    sign: "Pisces", degrees: 4, minutes: 31, elongation_degrees: 128.4,
  } };
  const m = moonState(sky);
  assert.equal(m.degrees, 4);
  assert.equal(m.elongation, 128.4);
  assert.equal(moonPositionLabel(m), "Moon at 4° Pisces");
});

test("illumination is honestly rounded, never a float on screen", () => {
  assert.equal(illuminationLabel(82.7), "83% illuminated");
  assert.equal(illuminationLabel(0), "0% illuminated");
  assert.equal(illuminationLabel(100), "100% illuminated");
  assert.equal(illuminationLabel(null), null);
  assert.doesNotMatch(illuminationLabel(47.3819), /\./, "no decimal reaches the screen");
});

test("the accessible label states the phase without the artwork", () => {
  const label = moonAccessibleLabel("Waning Crescent", 12.4);
  assert.match(label, /Waning Crescent/);
  assert.match(label, /12% illuminated/);
});

// ── Motion policy ───────────────────────────────────────────────────────────

test("ambient motion is slow enough not to read as loading", () => {
  assert.ok(MOTION.driftSeconds >= 30, "Moon drift is atmospheric, not animated");
  assert.ok(MOTION.starDriftSeconds >= 60);
  assert.ok(MOTION.glowSeconds >= 8);
  assert.ok(MOTION.refreshMs > 0 && MOTION.refreshMs <= 2000,
    "the refresh turn is partial and brief, never a continuous spin");
});
