# Security policy

## Reporting a vulnerability

Please report security issues **privately** using GitHub's private vulnerability
reporting on this repository:

`https://github.com/EZmannBuilds/orbit-axis-engine/security/advisories/new`

Please do not open a public issue for a vulnerability, and please do not include
anyone's real birth data in a report — synthetic values reproduce every bug this
engine can have.

There is no funded bug-bounty programme. This is a personal open-source project;
reports are handled on a best-effort basis.

## Scope

In scope:

- Command injection into the Swiss Ephemeris subprocess
- Path traversal in executable or ephemeris-data resolution
- Crashes or resource exhaustion from crafted calculation input
- Incorrect astronomical output that could mislead a user
- Leakage of birth data through errors, logs, or diagnostics

Out of scope:

- Astrological interpretation being "wrong" — interpretation is symbolic, not
  factual, and is explicitly not a claim about reality
- Issues in the Orbit Axis application rather than this engine (report those on
  the application repository)
- Vulnerabilities in Swiss Ephemeris itself (report upstream to Astrodienst)

## Design measures already in place

These are asserted by the test suite, not just intended:

- Arguments are passed as an **array** to `execFileSync` with `shell: false`.
  No shell is involved, so metacharacters cannot become commands. An argument
  allow-list rejects malformed input as defence in depth.
- Dates, coordinates, and house systems are range-checked before a process
  starts.
- A strict execution timeout and an output size cap are always applied.
- The executable path comes from a signed-off manifest, never from user input.
  Bundled artefacts are checksum-verified.
- An unsupported platform fails with a named error. The engine never falls back
  to a binary built for another operating system.
- Customer-facing error messages contain no filesystem path, no native error
  text, and no birth data. Diagnostics record the failure, never the input.
- Incomplete or malformed ephemeris output is rejected rather than returned as
  a chart.

## What the engine never does

It has no network access, no database, no user accounts, no persistence, and no
AI provider. It cannot leak data it never receives and never stores.
