# Static interpretation content

Authored, deterministic, version-controlled. **No generative AI is involved at
any point** — nothing here calls a model, and no chart data leaves the process.

## Why this is compositional, not exhaustive

Ten planets across twelve signs across twelve houses is 1,440 paragraphs before
aspects, and a corpus that size cannot be kept consistent by hand — it drifts,
repeats, and contradicts itself. So the content is authored per *layer* and
composed at read time:

| Layer | Answers | Entries |
| --- | --- | --- |
| `planets.js` | what function is operating | 10 |
| `signs.js` | how that function expresses itself | 12 |
| `houses.js` | where it is experienced | 12 |
| `aspects.js` | how two functions interact | 5 |
| `elements.js` | what the chart emphasises | 4 |
| `modalities.js` | how the chart moves | 3 |
| `retrograde.js` | how a function turns inward | 1 + per-planet notes |
| `angles.js` | the Ascendant and Midheaven | 2 |
| `limitations.js` | what Orbit Axis will not claim | per warning |

~50 authored entries instead of ~1,500, and every combination is reachable.

## The rules the composer must keep

1. **The same chart produces the same words.** No randomness, no time input, no
   network. `composePlacement()` is a pure function of its arguments.
2. **A layer never contradicts the layer above it.** Sign text describes *how*,
   never *what* — "expresses this boldly", not "makes you a bold person".
3. **Nothing is claimed that the engine did not calculate.** House text only
   appears when `planet_houses` has an entry; Rising text only when the engine
   returned an Ascendant.
4. **No fatalism, no diagnosis.** See `test/interpretation-content.test.js`,
   which scans every string for the banned registers.

## Voice

Astrology is symbolic reflection, not measurement, and the copy has to carry
that without being so hedged it says nothing. The house style is:

- "often associated with", "may notice", "one expression of this is"
- never "you will always", "this guarantees", "you cannot"
- never a medical, legal, financial, or mental-health claim
- second person, no assumptions about the reader's gender, relationships,
  family, body, or circumstances

Every entry is original writing. No astrology site or book was used as source
text.
