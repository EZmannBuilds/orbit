# Supabase authentication and redirect configuration

**Nothing here has been applied.** Update 4.0.3 made no change to the hosted
Supabase project's authentication settings.

---

## 1. How Orbit actually authenticates

This matters, because it makes the redirect surface much smaller than it would
be for a typical app.

Orbit uses the **password grant, server-side**:

1. The browser POSTs email + password to Orbit's own `/api/auth/signin`.
2. The Orbit function calls Supabase `/auth/v1/token?grant_type=password`.
3. Orbit stores the returned session in its own `oa_session` cookie —
   `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` on any deployment.
4. The browser never holds a Supabase token in JavaScript, and never talks to
   Supabase Auth directly.

Consequences, verified in the source:

- **There is no OAuth flow.** No provider buttons, no `/auth/callback`, no
  authorisation-code exchange.
- **There is no password-reset flow.** `lib/auth/supabase-auth.js` implements
  sign-up, sign-in, refresh, get-user, and sign-out. Nothing else.
- **There is therefore no callback origin to allow-list for sign-in.**

The only redirect surface is the **email confirmation link**, and only if email
confirmation is enabled on the hosted project.

---

## 2. What actually needs configuring

### If email confirmation is DISABLED (simplest)

Nothing to configure. Sign-up returns a session immediately, Orbit sets its own
cookie, and no email link is ever sent.

`lib/server/create-app.js` already handles both cases: when sign-up returns no
session it responds *"Account created. Check your email if confirmation is
required, then sign in."*

### If email confirmation is ENABLED

Supabase dashboard → Authentication → URL Configuration:

| Setting | Value |
|---|---|
| **Site URL** | The production origin, once one exists. Until then, leave it as-is. |
| **Redirect URLs** | Add the specific Preview origin you intend to test. |

Preview deployment URLs look like:

```
https://orbit-<hash>-<scope>.vercel.app
```

The hash changes on **every** push, so a fixed Preview URL does not exist.
Options, in order of preference:

1. **Disable email confirmation for the Preview Supabase project.** It is a
   disposable project with test accounts. This is the recommended answer and
   avoids the wildcard question entirely.
2. **Use Vercel's stable branch alias.** Vercel also publishes a per-branch URL
   that does not change per commit:
   `https://orbit-git-<branch>-<scope>.vercel.app`. Add that one exact URL.
3. **Wildcard.** Supabase accepts `https://orbit-*-<scope>.vercel.app`.

### Is a wildcard Preview URL safe?

**Narrowly scoped: acceptable for a Preview project. Never for production.**

A wildcard tells Supabase "it is fine to send an auth token to any host matching
this pattern". `https://orbit-*-<scope>.vercel.app` is bounded to your own
Vercel scope, and `*.vercel.app` hosts are not freely registrable by third
parties, so the blast radius is your own deployments.

What makes it unacceptable for production:

- It applies to the project it is configured on. If Preview and Production ever
  shared a Supabase project, the wildcard would apply to real user accounts.
- A broader pattern such as `https://*.vercel.app` would allow **anyone else's**
  Vercel deployment to receive a token. Never use that.

Recommendation: **option 1**, disable confirmation on the disposable Preview
project. If you need confirmation tested, use option 2 — one exact branch alias
URL, no wildcard.

---

## 3. Origin handling in Orbit

| Concern | Current behaviour |
|---|---|
| Forwarded protocol | `x-forwarded-proto` is trusted **only** when the resolved environment says this is a Vercel deployment. On a local server the header is ignored, because anyone can send it. |
| Cookie `Secure` | Set unconditionally on a deployment, so a stripped or absent header cannot downgrade it. Not set on local HTTP, where a `Secure` cookie would break sign-in. |
| Cookie re-issue | Refresh and expiry re-issue the cookie with the *same* attributes, so a refresh cannot silently downgrade a Secure cookie. |
| CORS | `Access-Control-Allow-Origin: *` on API responses. Safe here **only because** authentication is a `SameSite=Lax` `HttpOnly` cookie that a cross-origin request cannot attach, and no credentials are echoed. Revisit if Orbit ever adopts token-in-header auth. |
| CSRF | `SameSite=Lax` blocks cross-site POSTs carrying the session cookie. |
| Redirects | Orbit issues none. There is no origin for an attacker to influence. |

Tested in `test/server-handler.test.js`: a forged `x-forwarded-proto` is ignored
off Vercel; a deployed cookie is Secure with or without the header.

---

## 4. Checklist before the first Preview sign-in

- [ ] Preview Supabase project exists and is separate from production
- [ ] Migrations applied to it (see [hosted-supabase-migration.md](hosted-supabase-migration.md))
- [ ] Email confirmation **disabled** on that project, or one exact branch-alias
      redirect URL added
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` set in Vercel Preview
- [ ] `ORBIT_PREVIEW_PROJECT_REFS` set to the Preview project reference
- [ ] A test account created **in the Preview project only**

## 5. Checklist before the first Production sign-in

- [ ] Site URL set to the real production origin
- [ ] **No wildcard** redirect URLs on the production project
- [ ] Email confirmation decision made deliberately
- [ ] `npm run deploy:check` passes with no blockers
