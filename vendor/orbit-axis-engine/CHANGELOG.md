# Changelog

All notable changes to Orbit Axis Engine are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Before 1.0.0, minor versions may contain breaking changes. The response
`contractVersion` is versioned separately and independently.

## [0.1.0] — 2026-07-20

Initial extraction from the Orbit Axis application (Update 5.0).

### Added

- Deterministic natal chart calculation: planetary positions, houses, angles,
  aspects, retrograde state, element and modality balance, chart ruler.
- Current sky snapshot with lunar phase, illumination, retrogrades, and a
  stable coarse snapshot hash suitable for seeding daily readings.
- Personal transits from moving bodies to fixed natal bodies, with orb and
  applying/separating classification derived from the transiting body's speed.
- Swiss Ephemeris adapter with per-platform runtime resolution, checksum
  verification, hardened subprocess execution, and structured errors.
- `contractVersion` v1 metadata block on calculations.
- `npm run runtime:check` — offline verification of platform, manifest,
  checksums, ephemeris data, and a smoke calculation.
- Parity suite proving the extracted engine matches the pre-extraction
  implementation exactly.

### Platforms

- `darwin-arm64` (development), `linux-x64` (deployment, statically linked).
- Verified on both. Unsupported platforms fail with a named error rather than
  falling back to a binary built for another operating system.

### Ephemeris

- Swiss Ephemeris 2.10.03, built from official source
  (`github.com/aloistr/swisseph`, tag `v2.10.03`, commit `175e1fc`).
- macOS ↔ Linux parity: maximum longitude difference 0.0° across 440 compared
  values.

### Licence

- AGPL-3.0-or-later, inherited from the Swiss Ephemeris free licensing option.

### Not included

- No persistence, no user accounts, no network access, no AI provider.
- Synastry is not yet extracted; it remains in the application.
