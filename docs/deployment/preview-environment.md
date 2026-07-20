# Preview environment, security checklist, and open blockers

Run `npm run deploy:check` for the live version of this list. This document
explains the *why* behind each item.

---

## 1. What "deployment readiness" means here

Update 4.0.3 makes the repository technically ready to connect to Vercel.

It does **not** mean any of the following:

- Production deployment is approved
- Hosted migrations have been applied
- A Preview Supabase project exists
- Swiss Ephemeris licensing is resolved
- Legal review is complete
- Monetization or analytics are active
- A custom domain is configured
- Orbit Intelligence production hosting has been selected

Nothing was pushed, merged, deployed, or migrated remotely.

---

## 2. Open blockers

### Must fix before Preview

**1. The deployment branch is not pushed.**
Vercel can only build a commit that exists on GitHub. Updates 4.0 through 4.0.3
are local-only — 18 commits ahead of `origin/main`.

**2. No approved Preview Supabase project exists.**
`APPROVED_PREVIEW_PROJECT_REFS` is deliberately empty and
`ORBIT_PREVIEW_PROJECT_REFS` is unset, so Orbit refuses to start in preview
mode. This is the guard working, not a bug. A hosted project is not
preview-safe merely because it is not production.
*Owner decision:* create a separate disposable Supabase project, or explicitly
approve production-backed Preview (not recommended — Preview is where data gets
broken on purpose).

**3. Missing Vercel Preview environment variables.**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORBIT_ENVIRONMENT`, and
`ORBIT_PREVIEW_PROJECT_REFS`. Only the owner can set these.

**4. The Swiss Ephemeris binary cannot run on Vercel.**
This is the most consequential finding of the update, and it is a genuine
blocker rather than a warning.

`lib/astro/bin/swetest` is a compiled **Mach-O 64-bit arm64** executable — built
for Apple Silicon macOS. Vercel Functions run **Linux x86-64**. The binary
cannot execute there, and *every* astrology feature shells out to it: natal
charts, current sky, daily fortunes, and the evidence behind every Ask Orbit
answer.

Without this resolved, a Preview deployment will serve the frontend, sign users
in, and then fail on every astrology request.

`ephemerisCapability()` (added in 4.0.3) detects this and reports it by name
rather than failing with an opaque `ENOEXEC`, and `deploy:check` reports it
before a deploy rather than after.

*Owner options:*
- build a `linux-x64` `swetest` and select the right binary per platform
- replace the subprocess with a JavaScript or WASM ephemeris
- move the calculation into a separate service the function calls

This has not been done, because each option is a real product decision with
licensing and accuracy consequences.

### Must fix before Production

- Hosted Ask Orbit migration applied (see
  [hosted-supabase-migration.md](hosted-supabase-migration.md))
- Production environment variables set in Vercel
- Production RLS verified against the live project
- Production branch and promotion decision made deliberately
- `npm run deploy:check` passing with zero blockers
- Everything in the Preview list above, resolved

### Legal and launch blockers

**Swiss Ephemeris licensing is UNRESOLVED and undocumented in this repository.**

Swiss Ephemeris is dual-licensed: AGPL, or a paid commercial licence from
Astrodienst. Both carry obligations for a publicly reachable deployment — the
AGPL path requires offering corresponding source to users of the network
service.

No licence file, notice, or purchase record exists in this repository. This is
stated as unresolved because it *is* unresolved; it must not be treated as
settled without documentation. Resolve before any public launch.

---

## 3. What will and will not work in Preview

Assuming Preview variables are set and an approved Supabase project exists, but
**before** the ephemeris blocker is resolved:

| Feature | Preview |
|---|---|
| Frontend loads, CSS and modules served | Works |
| Navigation between views | Works |
| Sign up / sign in / sign out | Works |
| Session restoration for a returning user | Works |
| Saved chart list (metadata only) | Works |
| Natal chart calculation | **Fails** — ephemeris binary |
| Current Sky | **Fails** — ephemeris binary |
| Daily fortune | **Fails** — ephemeris binary |
| Ask Orbit answers | **Fails** — evidence comes from the ephemeris |
| Ask Orbit history persistence | Fails until the hosted migration is applied |
| Ollama-worded answers | Never — deterministic engine only, by design |
| Development routes, disposable users, seeds | Never — disabled on a deployment |

Once the ephemeris is resolved, everything except Ask Orbit persistence works,
and that is fixed by applying the migration.

---

## 4. Security checklist

Verified in this update:

- [x] `.env.local` is git-ignored and `.vercelignore`-excluded; never modified,
      moved, or rotated
- [x] `.vercel/` added to `.gitignore` — project ids and pulled env values
      cannot be committed
- [x] Obsidian vault (`07 Orbit App/`), `docs/`, `prompts/`, `.orbit/`,
      `supabase/`, and `test/` excluded from the Vercel upload
- [x] No secret in `vercel.json`; no hardcoded deployment URL
- [x] Service-role key never required by a deployment; `deploy:check` raises a
      BLOCKER if one is present on a deployment
- [x] Orbit has no bundler, so no server-only value can be inlined into a
      frontend bundle; no source maps are generated
- [x] Session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` on deployments
- [x] Production and Preview errors return a generic message; stack traces and
      internal messages stay in the function log
- [x] `/api/health` reveals nothing about environment, database, or version
- [x] Development and vault routes return a plain `404` on a deployment — they
      do not hint that they exist
- [x] Guard messages never contain a key, token, or credential-bearing URL —
      only environment name, hostname, and public project reference
- [x] Chat logging records timing metadata only: never message content, birth
      details, coordinates, prompts, or generated readings
- [x] Secret scan run across the tracked tree — no key material found

Still to verify by the owner, on the live project:

- [ ] Production RLS behaviour with two real accounts
- [ ] Supabase Site URL and redirect URLs
- [ ] That no service-role key was pasted into the Vercel dashboard

---

## 5. Creating the Preview Supabase project

Owner-only. Not performed by this update.

1. Supabase dashboard → **New project**. Name it distinctly, e.g.
   `orbit-preview`. Choose the same region as production.
2. Copy the project reference from its URL
   (`https://<project-ref>.supabase.co`). It is a public identifier, not a
   secret.
3. Link and apply migrations **to that project only**:
   ```bash
   supabase link --project-ref <preview-project-ref>
   supabase db push
   ```
   Double-check the project reference before pressing enter. This is the one
   step in the whole process where a typo reaches production.
4. Copy its anon key from Project Settings → API.
5. In Vercel → Project → Settings → Environment Variables, scoped to
   **Preview** only:
   ```
   ORBIT_ENVIRONMENT=preview
   SUPABASE_URL=https://<preview-project-ref>.supabase.co
   SUPABASE_ANON_KEY=<preview anon key>
   ORBIT_PREVIEW_PROJECT_REFS=<preview-project-ref>
   ```
6. Disable email confirmation on the Preview project (see
   [auth-redirects.md](auth-redirects.md)).
7. Redeploy. Orbit will now start in preview mode instead of refusing.

Do **not** put the production project reference in
`ORBIT_PREVIEW_PROJECT_REFS`. That approval exists precisely so it cannot happen
by accident.
