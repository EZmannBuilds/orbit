# Contributing

## Ground rules

**Astronomy is not negotiable.** Any change that alters a calculated number
must be justified as a correctness fix, with evidence. "The test was failing"
is not a justification for changing a fixture or widening a tolerance.

**The engine stays ignorant of users.** No accounts, no database, no
persistence, no network, no AI provider. If a change needs any of those, it
belongs in the application, not here.

**AI never produces a fact.** Interpretation layers may explain evidence this
engine calculated. They may not invent a placement, aspect, house, transit, or
date.

## Setup

```bash
git clone https://github.com/EZmannBuilds/orbit-axis-engine
cd orbit-axis-engine
npm run verify     # lint + runtime check + tests
```

No dependencies to install and no build step. Node 22.x.

## Before opening a pull request

```bash
npm run lint
npm run runtime:check
npm test
```

And on the deployment platform, because macOS passing proves nothing about
Linux:

```bash
docker run --rm --platform linux/amd64 -v "$PWD":/engine:ro -w /engine \
  node:22-slim sh -c 'node scripts/runtime-check.js && node --test'
```

## Changing calculations

1. Add a failing test that demonstrates the current behaviour is wrong.
2. Fix it.
3. Run the parity suite on **both** platforms.
4. If a fixture legitimately changes, say so explicitly in the pull request and
   explain why the old value was wrong. Regenerating a fixture to silence a
   failure is the one thing that will get a change rejected outright.
5. Add a CHANGELOG entry.

## Upgrading Swiss Ephemeris

1. Rebuild each binary from official Astrodienst source (see SOURCE.md).
2. `npm run runtime:check -- --print-checksums`, paste into
   `src/adapters/swiss-ephemeris/manifest.json`, update the version, tag,
   commit, and verification date.
3. Regenerate fixtures only because the ephemeris version intentionally
   changed.
4. Re-run everything on both platforms.
5. Bump the minor version and write a CHANGELOG entry naming the ephemeris
   version.

## Adding a platform

Do not add a manifest entry for a platform you have not tested. An untested
entry is worse than an absent one: absent fails loudly and clearly, untested
fails mysteriously in production. Build the binary from official source, record
its real checksum, and run the parity suite on that platform.

## Style

Match the surrounding code. Plain ES modules, JSDoc types, no build step, no
dependencies. Comments should explain *why*, not restate *what*.

## Security

Do not open a public issue for a vulnerability. See SECURITY.md.

## Licence

Contributions are accepted under AGPL-3.0-or-later, matching the project.
