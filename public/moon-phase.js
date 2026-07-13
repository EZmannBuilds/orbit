// Orbit Axis :: procedural Moon renderer.
//
// Pure, deterministic, DOM-independent (importable from a browser <script
// type="module"> or directly from a Node test). Builds a stylized 2D phase
// icon from illumination + waxing/waning alone — no external image service,
// no astronomy calculation of its own. The existing Swiss-Ephemeris-backed
// current-sky data is the only source of truth for illumination/waxing.
//
// Geometry: a half-circle "limb" arc plus an ellipse "terminator" arc, both
// drawn from the top point to the bottom point of the disc. Because the two
// arcs traverse in opposite directions (top->bottom, then bottom->top), an
// SVG sweep-flag of the same value bulges the OPPOSITE side, not the same
// one — so matching flags produce a gibbous (terminator opposite the limb)
// and flipped flags produce a crescent (terminator same side as the limb).
// See "07 Orbit App/Technical/Moon Phase Renderer.md" for the full derivation.

function escAttr(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function moonPhasePathD(cx, cy, r, illuminationFraction, waxing) {
  const k = Math.max(0, Math.min(1, Number(illuminationFraction) || 0));
  const rx = Math.abs(0.5 - k) * 2 * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = k < 0.5 ? 1 - sweepOuter : sweepOuter;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A ${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`;
}

// Non-visual text alternative, e.g. "Waxing Gibbous Moon, 73% illuminated".
// Never relies on the visual alone to communicate the phase.
export function moonAccessibleLabel(phaseName, illumination) {
  const pct = Math.round(Math.max(0, Math.min(100, Number(illumination) || 0)));
  return `${phaseName || "Moon"} Moon, ${pct}% illuminated`;
}

export function renderMoonSVG({ illumination = 0, waxing = true, phaseName = "Moon", size = 132 } = {}) {
  const r = size / 2 - 4;
  const cx = size / 2, cy = size / 2;
  const k = Math.max(0, Math.min(100, Number(illumination) || 0)) / 100;
  const label = escAttr(moonAccessibleLabel(phaseName, illumination));
  return `
    <svg class="current-sky-moon__svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" focusable="false">
      <defs>
        <radialGradient id="axisMoonLit" cx="35%" cy="32%" r="75%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="45%" stop-color="#eaeeff" />
          <stop offset="100%" stop-color="#97a3d6" />
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#141833" />
      <path d="${moonPhasePathD(cx, cy, r, k, waxing)}" fill="url(#axisMoonLit)" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
    </svg>`;
}
