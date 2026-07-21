# Orbit Axis Engine

Deterministic astrology calculation engine. Natal charts, houses, aspects,
retrogrades, lunar phase, and transits — computed locally with Swiss Ephemeris,
with no network call and no dependencies.

Extracted from the [Orbit Axis](https://github.com/EZmannBuilds/orbit)
application so that the calculations can be inspected, tested, and reused
independently of the app that presents them.

**Licence: AGPL-3.0-or-later.** See [Licensing](#licensing) — this is not
optional, and it is inherited from Swiss Ephemeris.

---

## What it does

```js
import { computeNatalChart, currentSky, personalTransits, buildMetadata } from "@ezmannbuilds/orbit-axis-engine";

const chart = computeNatalChart({
  birth_date: "1990-06-15",
  birth_time: "14:30",
  time_accuracy: "exact",
  latitude: 41.8781,
  longitude: -87.6298,
  utc_offset_at_birth: "-05:00",
  house_system: "placidus",
});

chart.planets.Sun.longitude;      // 84.4280202
chart.angles.ascendant.sign;      // "Libra"
chart.houses.length;              // 12

const sky = currentSky(new Date());
const transits = personalTransits(sky, chart, 3);
// [{ transiting: "Mercury", natal: "Jupiter", aspect: "conjunction",
//    orb: 0.9, applying: true, ... }]
```

Every response can carry a metadata block so a stored reading stays
reproducible:

```js
buildMetadata({ houseSystem: "placidus", timezone: "America/Chicago" });
// { engineVersion: "0.1.0", contractVersion: "v1",
//   ephemerisProvider: "swiss-ephemeris", ephemerisVersion: "2.10.03",
//   zodiacType: "tropical", calculatedAt: "..." }
```

## What it deliberately does not do

This is the boundary that makes the engine worth extracting:

- **No users.** It has no concept of an account, and no Supabase.
- **No persistence.** It computes and returns; storage is the caller's job.
- **No AI.** It never asks a language model for a fact. Interpretation layers
  may *explain* the evidence it produces; they may not add to it.
- **No birth-data logging.** Diagnostics record the failure, never the input.
- **No silent fallbacks.** An unsupported platform, a missing binary, or
  malformed output raises a named error rather than returning a plausible-looking
  chart.

The application owns identity, storage, and wording. The engine owns the
numbers. There is exactly one place the numbers come from.

## Install

```bash
npm install github:EZmannBuilds/orbit-axis-engine#v0.1.0
```

Pin to a tag or commit. Do not depend on a moving branch in production.

No build step. No dependencies. Node 22.x.

## Supported platforms

| Runtime | Linkage | Purpose |
|---|---|---|
| `darwin-arm64` | dynamic | Local development on Apple Silicon |
| `linux-x64` | **static** | Deployment (Vercel functions, containers, CI) |

The Linux build is statically linked, so it does not depend on the host's glibc
version — verified running on busybox, which ships no glibc at all.

`darwin-x64` and `linux-arm64` are recorded as unsupported rather than shipped
untested. Ask if you need one.

```bash
npm run runtime:check     # platform, checksums, data files, smoke calculation
```

## Accuracy and parity

Swiss Ephemeris **2.10.03**, built from official Astrodienst source.

The macOS and Linux builds were compared across 440 values: maximum longitude
difference **0.0°** (bit-identical); speed differs by 1e-7 °/day in the last
printed digit only. Signs, degrees, retrograde states, house cusps, angles,
lunar phase, and transit applying/separating classification are identical.

The parity fixture in `tests/fixtures/` was generated from the Orbit Axis
application *before* extraction, so the suite proves the engine is a faithful
replacement and not merely self-consistent.

```bash
npm test
```

Test tolerances are far tighter than the observed difference and must not be
widened to make a failing test pass — real drift means the binaries, data
files, or flags genuinely differ, which is a bug to find.

## Licensing

Swiss Ephemeris is dual-licensed by Astrodienst: **AGPL** or a paid
**Professional License**. This project uses the AGPL option.

Astrodienst's licence text states that choosing the AGPL carries "the
obligation to place his or her whole software project under the AGPL or a
compatible license". That is why this engine — and the Orbit Axis application
that consumes it — are AGPL-3.0-or-later rather than something more permissive.

The AGPL also requires that users of a **network service** be offered the
corresponding source. See [SOURCE.md](SOURCE.md).

If you would rather not accept those terms, buy a Swiss Ephemeris Professional
License from Astrodienst and use the engine under whatever terms that permits —
but note this repository's own code remains AGPL.

> This is a plain-language summary of published licence terms, not legal advice.

## Not a prediction system

The engine computes astronomical positions accurately. It does not predict
events. Astrological interpretation is symbolic and is not a statement of fact.
Nothing here is medical, legal, financial, or psychological advice.

## Documentation

- [SOURCE.md](SOURCE.md) — source availability, build and modification
- [NOTICE](NOTICE) — copyright and Swiss Ephemeris attribution
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — bundled components
- [SECURITY.md](SECURITY.md) — reporting a vulnerability
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to work on this
- [CHANGELOG.md](CHANGELOG.md) — version history
