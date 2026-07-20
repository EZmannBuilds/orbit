# Vercel Build Verification (Update 4.0.4.2)

Branch: `feat/orbit-axis-core-portability`
Date: 2026-07-20

**The first real `npx vercel build` succeeded.** Orbit is now linked to
`lorehouse-team/orbit-axis` and the build output has been inspected, tested on
Linux x64, and scanned.

Nothing was deployed. No Supabase migration was applied. The repository remains
private.

## The build

| | |
| --- | --- |
| Vercel CLI | 55.0.0 |
| Node.js | 22.23.1 |
| Linked project | `orbit-axis` (not `the-lorehouse`) |
| Framework | `Other` — from `vercel.json`, dashboard has no override |
| Build command | `npm run build` |
| Output directory | **`public`** — the `dist` error is gone |
| Function runtime | `nodejs22.x`, maxDuration 30s |
| Result | `status: ok` |
| Output | `.vercel/output` — 21 static files, 49 files in the function |

Worth recording: Vercel warned that `"engines": { "node": "22.x" }` in
`package.json` **overrides** the dashboard's Node setting of `24.x`. The pin
added in Update 4.0.4.1 did exactly its job. The dashboard still says 24.x and
should be aligned to 22.x so the two stop disagreeing.

## Three defects the real build exposed

Modelling was not enough. Each of these was invisible until a genuine build ran.

### 1. The macOS executable was being packaged into the Linux function

`.vercelignore` excludes `lib/astro/bin/darwin-arm64/`, and the bundle model
reported it excluded. The real build packaged it anyway — 836 KB of Mach-O
binary inside a Linux function.

The cause is a distinction that had been missed: **`.vercelignore` governs what
is UPLOADED. It does not govern what lands inside a function.** A function is
assembled from Vercel's file tracing plus `includeFiles`, and neither consults
`.vercelignore`. Narrowing `includeFiles` did not help either, because tracing
was pulling the binary in. Only `excludeFiles` removed it.

Bundle size fell from 3.6 MB to 2.8 MB — exactly the size of the macOS binary.

### 2. The bundle model was confidently wrong

`lib/deploy/bundle.js` had claimed the macOS binary was excluded. Rather than
delete the model, its limitation is now documented in the file itself, and a new
module — `lib/deploy/vercel-output.js` — reads the **real** build output. Where
the two disagree, the build wins. A test asserts the limitation stays
documented.

### 3. Local builds record the build machine's architecture

`.vc-config.json` records `architecture: arm64`, because the build ran on Apple
Silicon. A normal `vercel deploy` rebuilds on Vercel's Linux builders and is
unaffected — but `vercel deploy --prebuilt` would ship an arm64 function
alongside a `linux-x64` executable, which could not run. `deploy:check` now
warns about this, and `--prebuilt` remains banned.

## Verification of the built artifact

Not the source tree — the artifact Vercel produced.

The function bundle was materialised exactly as it would deploy (the `.func`
tree plus every `filePathMap` entry resolved) and run inside a `linux/amd64`
container under Preview environment variables, with every outbound socket
trapped:

- boots and answers `/api/health`
- **performs a real astrology calculation** — Sun 118.217° Cancer, Moon Libra
  First Quarter
- development routes return 404
- unknown API paths return a controlled JSON 404
- input errors return safe messages with no native process text
- **zero** connection attempts to localhost Ollama or Supabase, even with
  Ollama deliberately enabled and pointed at `127.0.0.1:11434`

Also verified: the bundled `linux-x64` executable matches its recorded SHA-256;
all three `.se1` files and the runtime manifest are reachable; static output is
byte-identical to `public/`; the macOS binary is absent.

Secret scan across `.vercel/output`: two hits, both benign — the published
Supabase **local demo** anon key (documented as not a secret, valid only against
a local stack) and a denylist regex that redacts secrets. No `.env` file, no
`project.json`, no OIDC token, no vault or Supabase data in the output.

## Blockers

`npm run deploy:check` fell from **4 blockers to 2**. Both remaining are
owner-controlled Supabase work:

1. No approved Preview Supabase project
2. Ask Orbit hosted migration not verified

Cleared: the `.vercel/` packaging blockers, the missing-build finding, and the
canonical-vault drift.

Still open as warnings: hosted RLS unverified, Preview variables not configured
in Vercel, Production unverified, and **no real Preview deployment has ever been
created or tested**.

The Swiss Ephemeris licensing question is unchanged and unresolved. A successful
build resolves nothing about it. See [[Swiss Ephemeris Integration]].

## Vault housekeeping

`deploy:check` had flagged `Updates/Vercel Deployment Readiness.md` as present in
the repository mirror but missing from the canonical vault. On inspection it was
a **superseded duplicate** of the canonical
[[Vercel Deployment Foundation]] — the same Update 4.0.3, under its old name.
It was not copied. The mirror was aligned to the canonical name instead, so the
two stop disagreeing without creating a duplicate note.

## Related

- [[Vercel Project Link Repair]]
- [[Orbit Core Portability]]
- [[Deployment Status and Blockers]]
- [[Vercel Deployment Foundation]]
