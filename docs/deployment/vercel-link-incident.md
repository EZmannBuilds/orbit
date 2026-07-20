# Incident: Orbit linked to the wrong Vercel project

Date: 2026-07-20. Repaired in Update 4.0.4.1.

Read this before running any `vercel` command in this repository.

---

## What happened

Run from `/Users/mr.mann/Projects/orbit`:

```bash
git push -u origin feat/orbit-axis-core-portability   # succeeded
npx vercel link                                        # attached Orbit to the WRONG project
npx vercel build                                       # failed: No Output Directory named "dist"
npm run deploy:check                                   # command not found
```

Two independent mistakes compounded, and neither was Orbit's code being wrong.

### 1. The link went to another application

No Orbit project existed in the Vercel team, so `vercel link` offered the only
project there — **`the-lorehouse`** — and it was accepted. That project is a
different application:

| | `the-lorehouse` | Orbit |
|---|---|---|
| Framework preset | `vite` | `Other` (`null`) |
| Output directory | unset → Vite default **`dist`** | **`public`** |
| Node version | 24.x | 22.x |

Vercel then wrote into Orbit's working tree:

- `.vercel/project.json` — the Lorehouse link
- `.vercel/.env.preview.local` — **the Lorehouse project's Preview environment**,
  including its Supabase URL, its publishable key, and an OIDC token
- `.vercel/output/*`, `.vercel/node/*` — partial build state
- a `VERCEL_OIDC_TOKEN` entry appended to Orbit's own `.env.local`
- two lines in `.gitignore`: `.vercel` and `.env*`

The build then used the Vite preset, looked for `dist`, found none, and stopped.
**The `dist` error was the symptom. The wrong link was the cause.** Creating a
`dist` directory would have "fixed" the error and produced a meaningless build.

### 2. The commands ran from a checkout that predated the work

`/Users/mr.mann/Projects/orbit` is on `feat/orbit-axis-environment-safety`
(Update 4.0.2). Everything relevant — `vercel.json`, `scripts/deploy-check.js`,
the portable Linux runtime — arrived in Updates 4.0.3 and 4.0.4, which live on
`feat/orbit-axis-core-portability` in the worktree at
`.claude/worktrees/vercel-deployment-readiness-617643`.

So:

- `npm run deploy:check` was genuinely absent — that checkout has no such script
- there was no `vercel.json` for Vercel to read, which is *why* the dashboard
  preset was the only source of truth for the output directory
- **the branch that was pushed was never the source tree that failed to build**

---

## Which directory to use

| Purpose | Directory |
|---|---|
| Vercel commands, builds, `deploy:check`, tests | `.claude/worktrees/vercel-deployment-readiness-617643` |
| Branch there | `feat/orbit-axis-core-portability` |
| The main checkout | `/Users/mr.mann/Projects/orbit` — still on Update 4.0.2 |

The main checkout will be the right place again once this work is merged into
`main`. Until then, running Vercel commands there builds an old tree.

`npm run deploy:check` now detects this itself: a checkout without the Update
4.0.4 portability files is reported as a BLOCKER.

---

## What the repair did

| Action | Result |
|---|---|
| Backed up `.env.local` outside the repository, mode 600 | Done before any edit |
| Removed the `VERCEL_OIDC_TOKEN` line from `.env.local` | Removed; all 12 owner variables intact, verified by comparing names |
| Deleted `.vercel/` from the main checkout | Removed, including the Lorehouse Preview environment file |
| Restored `.gitignore` and `package-lock.json` | Reverted to their committed state |
| Confirmed Lorehouse untouched | No deployment created, project intact |

### Why `.env*` was not kept

Vercel's `.gitignore` addition of `.env*` looks harmless but is not: this
repository deliberately **tracks** `.env.example`, `.env.local.example`,
`.env.preview.example`, and `.env.production.example` as placeholder templates.
The committed `.gitignore` even says so. The portability branch already ignores
`.env`, `.env.local`, `.env.*.local`, and `.vercel/` — which covers every real
secret while leaving the templates trackable. A test now asserts both halves.

### The OIDC token

`VERCEL_OIDC_TOKEN` is issued by Vercel for OIDC federation to third-party
services. Orbit does not use OIDC federation, and no local build needs it, so
it was removed. If a future `vercel pull` re-adds it, the same applies: it is
never needed for `vercel build`, must never be committed, and `.env.local` is
git-ignored regardless.

---

## Confirmed: Lorehouse was not modified

Verified with read-only commands only. No write, no deploy, no setting change.

| Check | Evidence |
|---|---|
| No deployment created | Newest Lorehouse deployment is **4 days old**; the incident was today. `vercel build` is local-only and never deploys. |
| Project not deleted | Still listed, production URL intact |
| No settings changed | Project "Updated" timestamp is **6 days** old |
| No environment variables changed | Nothing was written; only a read/pull occurred |
| Production branch unchanged | Never touched |

The only lasting effect was on **Orbit's** working tree, and that has been
cleaned.

---

## Preventing a repeat

`npm run deploy:check` now fails with a BLOCKER when:

- the link points at `the-lorehouse` (named explicitly)
- the link points at any project not on the approved list
- `.vercel/project.json` is malformed or unreadable
- there is no link at all (build cannot run)
- the checkout lacks the Update 4.0.4 portability files
- build output exists but the link is not an approved Orbit project
- any Vercel-generated file would be committable

The approved project is configured **by name** — `orbit-axis` — in
`lib/deploy/vercel-link.js`, extendable via `ORBIT_VERCEL_PROJECTS`. Project and
org ids are account-private and are never read, compared, or printed.

---

## Correct procedure, once an Orbit project exists

```bash
cd /Users/mr.mann/Projects/orbit/.claude/worktrees/vercel-deployment-readiness-617643

npm run deploy:check                              # confirm the checkout is right
npx vercel link --scope lorehouse-team --project orbit-axis --yes
npm run deploy:check                              # confirm the link is approved
npx vercel pull --yes --environment=preview
npx vercel build                                  # must report Output Directory: public
```

Never run `vercel deploy` or `vercel --prod` as part of verification. A local
build is allowed; a deployment is not.

If a build ever asks for `dist` again, the link is wrong. Check
`.vercel/project.json`'s `projectName` — do not create a `dist` directory.
