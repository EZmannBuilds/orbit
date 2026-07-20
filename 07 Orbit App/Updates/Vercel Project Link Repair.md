# Vercel Project Link Repair (Update 4.0.4.1)

Branch: `feat/orbit-axis-core-portability`
Date: 2026-07-20

A repair update. No new product work.

## What happened

Run from the main checkout `/Users/mr.mann/Projects/orbit`:

```bash
git push -u origin feat/orbit-axis-core-portability   # succeeded
npx vercel link                                        # attached Orbit to the WRONG project
npx vercel build                                       # failed: No Output Directory named "dist"
npm run deploy:check                                   # command not found
```

Two independent problems compounded. Neither was Orbit's code being wrong.

### The link went to a different application

No Orbit project existed in the Vercel team, so `vercel link` offered the only
project there — **`the-lorehouse`** — and it was accepted.

| | `the-lorehouse` | Orbit |
| --- | --- | --- |
| Framework preset | `vite` | `Other` (`null`) |
| Output directory | unset → Vite default **`dist`** | **`public`** |
| Node version | 24.x | 22.x |

Vercel then wrote into Orbit's working tree: the Lorehouse link
(`.vercel/project.json`), **the Lorehouse project's Preview environment file**
(`.vercel/.env.preview.local`, including its Supabase URL, publishable key, and
an OIDC token), partial build state, a `VERCEL_OIDC_TOKEN` line appended to
Orbit's own `.env.local`, and two lines in `.gitignore`.

The build used the Vite preset, looked for `dist`, and stopped. **The `dist`
error was the symptom; the wrong link was the cause.** Creating a `dist`
directory would have "fixed" the message and produced a meaningless build.

### The commands ran from a checkout that predated the work

The main checkout is on `feat/orbit-axis-environment-safety` (Update 4.0.2).
Everything relevant — `vercel.json`, `scripts/deploy-check.js`, the portable
Linux runtime — arrived in Updates 4.0.3 and 4.0.4, which live on
`feat/orbit-axis-core-portability` in the portability worktree.

So `deploy:check` was genuinely absent, and there was no `vercel.json` for
Vercel to read — which is *why* the dashboard preset became the only source of
truth for the output directory. **The branch that was pushed was never the
source tree that failed to build.**

## Repair

| Action | Result |
| --- | --- |
| `.env.local` backed up outside the repository, mode 600 | Done before any edit |
| `VERCEL_OIDC_TOKEN` removed from `.env.local` | Removed; all 12 owner variables intact, verified by comparing names before and after |
| `.vercel/` deleted from the main checkout | Removed, including the Lorehouse Preview environment file |
| `.gitignore` and `package-lock.json` restored | Reverted to their committed state |
| Node version pinned | `engines.node` changed from `>=20.11` to `22.x` |

Vercel's `.gitignore` addition of `.env*` was **not** kept. This repository
deliberately tracks `.env.example`, `.env.local.example`, `.env.preview.example`,
and `.env.production.example` as placeholder templates; `.env*` would have
started ignoring them. The portability branch already ignores `.env`,
`.env.local`, `.env.*.local`, and `.vercel/`, which covers every real secret
while leaving templates trackable. A test now asserts both halves.

`VERCEL_OIDC_TOKEN` is issued for OIDC federation to third-party services.
Orbit does not use it and no local build needs it, so removal is safe. If a
future `vercel pull` re-adds it, the same reasoning applies.

## Lorehouse was not modified

Verified with read-only commands only.

| Check | Evidence |
| --- | --- |
| No deployment created | Newest Lorehouse deployment is **4 days old**; the incident was today. `vercel build` is local-only and never deploys. |
| Project not deleted | Still listed, production URL intact |
| No settings changed | Project "Updated" timestamp is **6 days** old |
| No environment variables changed | Nothing was written; only a read occurred |
| Production branch unchanged | Never touched |

The only lasting effect was on Orbit's own working tree, and it has been cleaned.

## Prevention

`npm run deploy:check` now reports a BLOCKER when the link points at
`the-lorehouse` (named explicitly), at any project not on the approved list,
when `.vercel/project.json` is malformed, when there is no link, when the
checkout lacks the Update 4.0.4 portability files, when build output exists but
the link is wrong, or when any Vercel-generated file would be committable.

The approved project is configured **by name** — `orbit-axis` — in
`lib/deploy/vercel-link.js`, extendable via `ORBIT_VERCEL_PROJECTS`. Project and
org ids are account-private and are never read, compared, or printed. 23 tests
cover it.

## Still blocked

**There is no `orbit-axis` Vercel project.** The team contains exactly one
project, and it belongs to a different application. So:

- `npx vercel pull` and `npx vercel build` still cannot run
- **the Vercel build remains UNVERIFIED** — `npm run build` is a local
  verification step, not a substitute
- creating the project changes external account state and needs owner approval

Orbit must **not** be linked to `the-lorehouse` to work around this.

Other blockers are unchanged: no approved Preview Supabase project, hosted Ask
Orbit migration unapplied, Swiss Ephemeris licensing unresolved. Live list:
[[Deployment Status and Blockers]].

## Verification

449 tests before, **472 after** (23 new link tests), 0 failures. Lint,
typecheck, build, `orbit:runtime:check`, `orbit:core:smoke`, `env:check`, and
vault validation all pass. `deploy:check` exits 1 with 3 owner-only blockers —
down from 4, because the branch-push blocker cleared.

Nothing was deployed, merged, force-pushed, or migrated. The repository remains
private.

## Related

- [[Orbit Core Portability]]
- [[Deployment Status and Blockers]]
- [[Vercel Deployment Foundation]]
