# Contributing to Orbit Axis

## Setting up

```bash
git clone <this repository>
cd orbit
npm ci
cp .env.example .env.local     # then fill it in
npm run dev                    # http://localhost:3001
```

Orbit needs Node 22. There is no bundler and no transpiler: the code in the
repository is the code that runs.

### Environment

`.env.example` documents every variable. The ones that matter to get started:

| Variable | Needed for |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Accounts and saved charts |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Account deletion and admin paths |
| `GEOAPIFY_API_KEY` | Birthplace lookup |
| `ORBIT_FEATURE_*` | Unfinished features, off by default |

Calculation works with none of them — charts, transits, and synastry need no
database at all.

**The service-role key must never reach a browser.** A test scans the built
client output for it.

### A database on your machine

```bash
supabase start
npm run test:local
```

Orbit refuses to start local development against a production database unless
you explicitly name that project in `.env.local`. Tests can never reach a
production database, and that guard has no override.

## Before opening a pull request

```bash
npm run engine:check    # vendored engine matches its repository
npm run lint
npm run build
npm run test:local
npm audit --omit=dev
```

## How this codebase is written

A few conventions worth knowing, because they are load-bearing rather than
stylistic:

- **Comments explain why, not what.** If a decision would look arbitrary to
  someone reading it in a year, the reason belongs next to it.
- **Never silently repair input.** An impossible date is rejected, not nudged. A
  chart computed from repaired input is wrong in a way nobody can see.
- **Never echo personal values in errors.** Name the field, never its contents.
  Birth details end up in logs, screenshots, and bug reports.
- **Uncertainty is surfaced, not hidden.** An unknown birth time means houses
  and angles are withheld and the response says so.
- **Verify against the real thing.** A model of a deployment is not the
  deployment; this project has shipped bugs that only the real artifact revealed.

## Tests

`node --test`, no framework. Name tests as statements about behaviour
(`"an unverifiable token deletes nothing"`), not after the function they call.

Do not weaken a test to make it pass. A failing test is usually telling you
something true — an order-dependent failure here once revealed a design flaw, not
a flaky test.

Never use real birth data in a fixture. Synthetic values only.

## The calculation engine

Astrology calculations live in a separate AGPL repository and are vendored into
`vendor/orbit-axis-engine`. Do not edit the vendored copy: change the engine
repository, then re-sync. `npm run engine:check` fails on drift.

## Licence

Orbit Axis is AGPL-3.0-or-later, and contributions are accepted under the same
terms. This is inherited from Swiss Ephemeris's AGPL option rather than chosen
independently — see `NOTICE`.

By contributing you confirm you have the right to submit the work under that
licence.

## Conduct

See `CODE_OF_CONDUCT.md`.

## Security

Do not open a public issue for a vulnerability. See `SECURITY.md`.
