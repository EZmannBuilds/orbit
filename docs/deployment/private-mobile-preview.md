# Opening the private Preview on your phone

> **This Preview writes to your real Orbit database.** Anything you create,
> edit, or delete in it is real data on the same Supabase project Production
> uses. Sign in with your own account, use it normally — but do not test
> deletion or anything destructive here.

## The URL

```
https://orbit-axis-p2cnietqb-lorehouse-team.vercel.app
```

Branch: `feat/orbit-axis-private-mobile-preview`

## Getting past the protection

The Preview is protected by **Vercel Authentication**. Opening it while signed
out redirects you to a Vercel login page — that is the protection working, not
an error.

On your phone:

1. Open <https://vercel.com/login> in your phone browser and sign in with the
   account that owns `lorehouse-team`
2. Then open the Preview URL above
3. You should land on Orbit Axis

If you skip step 1 you will bounce to the Vercel login page every time. Once
signed in, the session persists, so this is a one-time step per device.

Nobody without access to your Vercel team can open this URL.

## Ten-second check, before anything else

Once you are past the Vercel login, open this on the phone:

```
/api/v1/health
```

(the full URL above with `/api/v1/health` on the end)

**You should see JSON**, something like:

```json
{"data":{"status":"ok","database":{"configured":true,"reachable":true},
         "authentication":{"configured":true,"reachable":true}}}
```

That one page answers everything at once: the function booted, the routing
works, and Supabase is reachable.

If instead you see **"Orbit is not configured for this environment yet"**, the
deployment did not receive its settings — tell me and I will fix that
specifically. If you see a Vercel error page, the routing is still wrong.

## Signing in to Orbit

Use **your existing Orbit account** — the Preview shares the same database, so
your account, charts, and readings are already there.

## What should work

| | |
| --- | --- |
| Sign in / sign out | Your existing account |
| Home | Current Sky, daily reading, active chart |
| Me | Natal chart, placements, Simple/Advanced |
| Saved charts | Create, switch, and they persist |
| Ask Orbit | Deterministic answers with evidence |
| Ask Orbit history | Saved to the database and survives reload |
| History | Past daily readings |
| More → Account | Account details, legal links |
| Legal pages | `/privacy`, `/terms`, `/support`, `/source`, `/account-deletion` |

Navigation should read **Home · Me · Ask Orbit · More**. Tarot, Learn, and News
are deliberately absent — they are unfinished and hidden in this release.

## What to check on the phone

- Nothing scrolls sideways
- The Ask Orbit input is visible above the bottom navigation
- The keyboard does not permanently cover the input
- Buttons are comfortably tappable
- Chart cards stay legible
- Loading states appear rather than blank screens

## What will NOT work, and why

**Ask Orbit uses the deterministic engine only.** The local language model runs
on your machine during development and is deliberately unreachable from a
deployed function — a Vercel server has no localhost to call. Answers are
calculated rather than AI-worded, and that is correct behaviour, not a failure.

**Password reset may not complete.** The reset email will send, but Supabase
only redirects to URLs on its allow-list, and the Preview URL is not on it yet.
See *Your action required* below.

## Do not, in this Preview

- Delete your account (it is real, and permanent)
- Delete real saved charts you want to keep
- Invite anyone else — the Preview is for you, and the database is production

## If something fails

Note what you were doing, what you expected, and what happened. If an error
shows a **reference** code, include it — it identifies the request without
containing any of your birth details.

## If the URL stops working

Pushing another commit to the branch creates a **new** Preview URL. The one
above points at commit `b780193`. A newer deployment will have a different
address; the branch's latest Preview is always listed in the Vercel dashboard
under `lorehouse-team/orbit-axis`.

## Your action required

**Add the Preview URL to Supabase's redirect allow-list**, or password reset and
email confirmation links will not return to the app.

Supabase dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

```
https://orbit-axis-p2cnietqb-lorehouse-team.vercel.app/**
```

This was not done for you: it is a dashboard setting on the live Auth
configuration, and changing authentication behaviour on the project your real
account uses is your call rather than mine.

Sign-in and sign-out do not depend on it and work now.
