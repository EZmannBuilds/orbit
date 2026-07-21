# Third-party notices

Orbit Axis Engine has **no npm dependencies** — neither runtime nor
development. `package.json` declares empty `dependencies` and `devDependencies`,
and there is no lockfile to audit because there is nothing to install.

Everything below is bundled directly rather than fetched from a registry.

## Swiss Ephemeris

- **Project:** Swiss Ephemeris
- **Copyright:** © 1997–2021 Astrodienst AG, Switzerland
- **Website:** https://www.astro.com/swisseph/
- **Source used:** https://github.com/aloistr/swisseph, tag `v2.10.03`, commit `175e1fc`
- **Licence:** Dual — AGPL **or** a paid Swiss Ephemeris Professional License.
  Orbit Axis Engine uses the **AGPL** option.

Bundled artefacts:

| Path | What it is |
|---|---|
| `bin/darwin-arm64/swetest` | macOS Apple Silicon build, for local development |
| `bin/linux-x64/swetest` | Linux x86-64 build, statically linked, for deployment |
| `ephemeris/seas_18.se1` | Asteroid ephemeris data |
| `ephemeris/semo_18.se1` | Moon ephemeris data |
| `ephemeris/sepl_18.se1` | Planetary ephemeris data |

SHA-256 checksums for all five are recorded in
`src/adapters/swiss-ephemeris/manifest.json` and verified by
`npm run runtime:check`.

Astrodienst's licence requires that their copyright notices are preserved and
that the authors' names are not used for promotion without written permission.
Both are observed. See `NOTICE`.

## Node.js

The engine runs on Node.js 22.x and uses only its standard library
(`node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:url`).
Node.js is distributed under the MIT licence by the OpenJS Foundation.
