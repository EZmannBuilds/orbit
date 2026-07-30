# Supabase authentication redirect configuration

**Dev Update 1.2.** The hosted URL configuration was inspected and updated in
the Supabase dashboard on 2026-07-30. The two exact production entries below
are now present, and the existing localhost and Preview entries were retained.

## The failure this prevents

Orbit asks Supabase to send password-recovery links back to
`/reset-password.html`. Supabase treats its **Redirect URLs** list as an exact
allow-list.

When the requested URL is not on that list, GoTrue **does not reject the
request**. It silently substitutes the project's **Site URL**, so:

- the link in the email points at the application root,
- the reset form is never shown,
- the recovery token is discarded unused,
- nothing is logged as an error.

The only symptom is a person who cannot reset their password, and nothing in
the application can detect it.

## Reproduced locally, 2026-07-28

Against the local Supabase stack, with
`additional_redirect_urls = ["https://127.0.0.1:3000"]` and the reset page
absent from the list:

```text
redirect_to=http://127.0.0.1:3000            ← the Site URL, not the reset page
```

After adding the reset page to `supabase/config.toml`:

```text
redirect_to=http://localhost:3099/reset-password.html
```

Following that link produced a `303 See Other` to the reset page carrying a
valid recovery token, the form accepted a new password, the old password stopped
working, and the new one signed in. The same link used a second time returned
`otp_expired`, which the page reports honestly with the form hidden.

Local configuration is tracked in `supabase/config.toml`. **The hosted project
is not**, so this document records the dashboard verification separately.

## Required hosted configuration

Supabase dashboard → project `mtdrazdastcgiweauwoj` →
**Authentication → URL Configuration**.

| Setting | Required value |
| --- | --- |
| Site URL | `https://orbit-axis-omega.vercel.app` |
| Redirect URLs | must include `https://orbit-axis-omega.vercel.app/` |
| Redirect URLs | must include `https://orbit-axis-omega.vercel.app/reset-password.html` |

Retain any existing localhost development entries — removing them breaks local
recovery testing for no benefit.

**Do not** change email providers, the confirmation policy, JWT expiry, or any
other authentication setting while doing this. They are unrelated to the
redirect allow-list and are not part of Dev Update 1.2.

## Verifying afterwards

Use a **disposable** account. Never the owner's primary account.

1. Sign up with a disposable address on the public site.
2. Use **Forgot your password?**.
3. Open the email and read the link's `redirect_to` parameter **before**
   clicking. It must be
   `https://orbit-axis-omega.vercel.app/reset-password.html`.
   If it reads `https://orbit-axis-omega.vercel.app` instead, the allow-list
   entry is still missing or does not match exactly.
4. Click it, set a new password, and confirm the old one no longer works.
5. Click the same link again and confirm it reports an expired or invalid link
   rather than showing a form that cannot work.

## Status

Hosted dashboard configuration verified 2026-07-30:

- Site URL: `https://orbit-axis-omega.vercel.app`
- exact root redirect present
- exact `/reset-password.html` redirect present
- five pre-existing localhost/Preview entries retained
- no other Auth setting changed

The application side is complete and verified locally.
`passwordResetRedirect()` in `lib/server/create-app.js` derives
`https://<host>/reset-password.html` from the request host and never accepts a
client-supplied redirect. A disposable local account received the recovery
email and the reset link targeted the correct local page; invalid and reused
tokens are covered by the automated suite.

The hosted email journey was not executed because no approved disposable
hosted inbox/account was supplied. Configuration is verified; an actual hosted
recovery email is therefore still a release-owner acceptance check.
