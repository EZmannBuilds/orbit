// Orbit Axis :: procedural Moon renderer tests.
// Pure/deterministic — no DOM, no network, no external image service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { moonPhasePathD, moonAccessibleLabel, renderMoonSVG } from "../public/moon-phase.js";

function pathIsDegenerate(d) {
  // Both arcs share identical radii and endpoints -> zero enclosed area.
  const rxMatch = d.match(/A ([\d.]+) ([\d.]+) 0 0 (\d) .+? A ([\d.]+) ([\d.]+) 0 0 (\d)/);
  return rxMatch && Math.abs(Number(rxMatch[1]) - Number(rxMatch[4])) < 0.01;
}

test("new moon (0% illuminated) collapses to a degenerate (invisible) lit path", () => {
  const d = moonPhasePathD(66, 66, 62, 0, true);
  assert.ok(pathIsDegenerate(d));
});

test("full moon (100% illuminated) produces a full-radius terminator arc (fully lit disc)", () => {
  const d = moonPhasePathD(66, 66, 62, 1, true);
  // rx should equal r at k=1 -> the terminator becomes a genuine semicircle.
  const rxMatch = d.match(/A ([\d.]+) [\d.]+ 0 0 \d .+? A ([\d.]+)/);
  assert.equal(Number(rxMatch[1]), 62);
  assert.ok(Math.abs(Number(rxMatch[2]) - 62) < 0.01);
});

test("first/last quarter (50% illuminated) has a zero-width terminator (straight line)", () => {
  const d = moonPhasePathD(66, 66, 62, 0.5, true);
  const rxMatch = d.match(/A [\d.]+ [\d.]+ 0 0 \d [\d.]+ [\d.]+ A ([\d.]+)/);
  assert.equal(Number(rxMatch[1]), 0);
});

test("waxing and waning bulge on opposite sides for the same illumination", () => {
  const waxing = moonPhasePathD(66, 66, 62, 0.25, true);
  const waning = moonPhasePathD(66, 66, 62, 0.25, false);
  assert.notEqual(waxing, waning);
  // The limb arc's sweep flag is the clearest signal of which side is lit.
  const sweepOf = (d) => d.match(/A [\d.]+ [\d.]+ 0 0 (\d)/)[1];
  assert.notEqual(sweepOf(waxing), sweepOf(waning));
});

test("illumination fraction is clamped to [0,1] for out-of-range input", () => {
  const over = moonPhasePathD(66, 66, 62, 5, true);
  const full = moonPhasePathD(66, 66, 62, 1, true);
  assert.equal(over, full);
  const under = moonPhasePathD(66, 66, 62, -3, true);
  const zero = moonPhasePathD(66, 66, 62, 0, true);
  assert.equal(under, zero);
});

test("invalid illumination input (NaN/undefined) degrades to 0, not a crash", () => {
  assert.doesNotThrow(() => moonPhasePathD(66, 66, 62, undefined, true));
  assert.doesNotThrow(() => moonPhasePathD(66, 66, 62, NaN, true));
  const undef = moonPhasePathD(66, 66, 62, undefined, true);
  const zero = moonPhasePathD(66, 66, 62, 0, true);
  assert.equal(undef, zero);
});

test("output is deterministic for repeated identical input", () => {
  const a = moonPhasePathD(66, 66, 62, 0.37, true);
  const b = moonPhasePathD(66, 66, 62, 0.37, true);
  assert.equal(a, b);
});

test("accessible label names the phase and rounds the illumination percent", () => {
  assert.equal(moonAccessibleLabel("Waxing Gibbous", 73.4), "Waxing Gibbous Moon, 73% illuminated");
  assert.equal(moonAccessibleLabel("New Moon", 0.3), "New Moon Moon, 0% illuminated");
  assert.equal(moonAccessibleLabel(null, 50), "Moon Moon, 50% illuminated");
});

test("renderMoonSVG output never references an external image service", () => {
  const svg = renderMoonSVG({ illumination: 42, waxing: true, phaseName: "Waxing Gibbous" });
  assert.ok(!/https?:\/\//.test(svg), "SVG must not reference any external URL");
  assert.ok(svg.includes("role=\"img\""));
  assert.ok(svg.includes("aria-label="));
});

test("renderMoonSVG accessible label matches the accessible-label helper", () => {
  const svg = renderMoonSVG({ illumination: 73.4, waxing: true, phaseName: "Waxing Gibbous" });
  assert.ok(svg.includes(moonAccessibleLabel("Waxing Gibbous", 73.4)));
});

test("renderMoonSVG escapes an untrusted phase name (no raw HTML injection)", () => {
  const svg = renderMoonSVG({ illumination: 50, waxing: true, phaseName: "<script>alert(1)</script>" });
  assert.ok(!svg.includes("<script>alert"));
});

test("all eight canonical phases produce distinct paths", () => {
  const phases = [
    [0, true], [0.25, true], [0.5, true], [0.75, true],
    [1, true], [0.75, false], [0.5, false], [0.25, false],
  ];
  const paths = phases.map(([k, w]) => moonPhasePathD(66, 66, 62, k, w));
  assert.equal(new Set(paths).size, paths.length, "each phase should render a visually distinct path");
});
