# Source availability

The AGPL-3.0 requires that anyone who interacts with this software **over a
network** be offered its complete corresponding source code. This file records
how that obligation is met, so it is not left as an assumption.

## The repositories

| Component | Repository | Licence |
|---|---|---|
| Orbit Axis Engine (this project) | `https://github.com/EZmannBuilds/orbit-axis-engine` | AGPL-3.0-or-later |
| Orbit Axis application | `https://github.com/EZmannBuilds/orbit` | AGPL-3.0-or-later |
| Swiss Ephemeris (upstream) | `https://github.com/aloistr/swisseph` | AGPL or commercial (we use AGPL) |

Both Orbit repositories are public. The running application links to them from
its `/source` page, which is reachable without signing in.

## Why the whole project is AGPL

Swiss Ephemeris is dual-licensed. Astrodienst's own licence text says that a
developer who chooses the free option "must fulfill the conditions of that
license, which includes the obligation to place his or her whole software
project under the AGPL or a compatible license."

Orbit chose the free option. That choice propagates: the engine is AGPL, and
the application that depends on it is AGPL. A more permissive licence on either
would not be consistent with the dependency.

This is a description of the licence terms as published, not legal advice.

## Which version is running

Every calculation response carries a metadata block naming the engine version,
contract version, and the Swiss Ephemeris version actually in use:

```json
{
  "engineVersion": "0.1.0",
  "contractVersion": "v1",
  "ephemerisProvider": "swiss-ephemeris",
  "ephemerisVersion": "2.10.03"
}
```

The application's health endpoint reports the same values, so the source
corresponding to a given deployment can always be identified.

## Building from source

No build step and no dependencies. The engine is plain ES modules.

```bash
git clone https://github.com/EZmannBuilds/orbit-axis-engine
cd orbit-axis-engine
npm run runtime:check    # verifies the ephemeris runs on your platform
npm test                 # parity and regression suite
```

Supported platforms: `darwin-arm64` (development) and `linux-x64` (deployment).
An unsupported platform fails with a named error rather than substituting a
binary built for a different operating system.

## Rebuilding the Swiss Ephemeris binaries

The bundled binaries were built from official Astrodienst source. To reproduce
the Linux one:

```bash
docker run --rm --platform linux/amd64 -v "$PWD/out":/out debian:bookworm-slim bash -c '
  apt-get update -qq && apt-get install -y -qq build-essential git ca-certificates
  git clone --depth 1 --branch v2.10.03 https://github.com/aloistr/swisseph /src
  cd /src && make swetests && cp swetests /out/swetest'
```

Then record its SHA-256 in `src/adapters/swiss-ephemeris/manifest.json`
(`npm run runtime:check -- --print-checksums` prints it) and re-run the parity
suite. Regenerate fixtures only when an ephemeris change is intentional — never
to make a failing test pass.

## Modifying this software

You may modify and redistribute under the AGPL. If you run a modified version
as a network service, you must offer your users the modified source. Please
change the engine name and version so your build is not mistaken for this one.

## Reporting problems

Security issues: see `SECURITY.md`. Everything else: open an issue on the
repository above.
