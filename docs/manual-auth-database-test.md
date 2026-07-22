# Testing Orbit Axis locally — accounts and database

Everything below runs on your machine against the real Orbit Axis Supabase
project. Nothing here deploys, publishes, or pushes.

## Before you start: one thing to know

Orbit uses **one** Supabase project. Local development, preview, and production
all share it. That was a deliberate choice, and it has a consequence worth
holding onto:

> Anything you create, edit, or delete while testing locally is **real data in
> the real database**.

Orbit will not let you run this way by accident. It stops at startup unless
`.env.local` names the project explicitly, and it prints a warning every time it
starts. If you ever see that warning when you did not expect it, stop and check
which database you are pointed at.

## Start it

```bash
cd /path/to/orbit/.claude/worktrees/vercel-deployment-readiness-617643
npm ci
npm run dev
```

Then open:

```
http://localhost:3001
```

You should see this in the terminal:

```
  ⚠  Local development is using the HOSTED database (project mtdrazdastcgiweauwoj).
     Changes here affect real accounts. Acknowledged via ORBIT_ACKNOWLEDGE_PRODUCTION_DB.

Orbit astrology app listening at http://localhost:3001
Environment: local
Database: the hosted PRODUCTION database
```

The warning is expected. It is the safeguard working, not a problem.

## Confirm the database is connected

```bash
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool
```

Look for:

```json
"database":       { "configured": true, "reachable": true },
"authentication": { "configured": true, "reachable": true }
```

`configured` means the settings are present. `reachable` means Supabase
answered. If `configured` is false, `.env.local` is missing values. If
`configured` is true but `reachable` is false, the settings are there but
Supabase did not respond — check your network, then the Supabase dashboard.

This endpoint deliberately never tells you *which* project it is using or shows
any key. It is public, so it says only whether things work.

## Where the settings live

```
<the worktree above>/.env.local
```

It is gitignored and never committed. It needs:

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | The project URL |
| `SUPABASE_ANON_KEY` | The public key browsers use |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Never goes near a browser |
| `ORBIT_ACKNOWLEDGE_PRODUCTION_DB` | The project ref, naming the shared database on purpose |
| `GEOAPIFY_API_KEY` | Birthplace lookup |

**Never paste the contents of this file into a chat, an issue, a screenshot, or
Obsidian.** If you need to check what is set without revealing values:

```bash
grep -oE '^[A-Z0-9_]+=' .env.local | tr -d '='
```

That prints the names only.

## Create an account

1. Open <http://localhost:3001>. The sign-in card appears.
2. Choose **Create account**.
3. Enter an email and a password of at least 8 characters, twice.
4. Submit.

**If email confirmation is switched on** in the Supabase dashboard, you will see
"Account created. Check your email if confirmation is required, then sign in."
Open the email and click the link before signing in.

**If it is switched off**, you are signed in immediately.

Either behaviour is correct — which one you get depends on a Supabase dashboard
setting, not on Orbit.

## Sign in

Enter the email and password, submit. You should land on Home.

Things to check:

- The submit button greys out while the request is in flight, and comes back
  afterwards. Double-clicking it must not create two accounts.
- A wrong password says **"Email or password did not match."**
- An email with no account says **exactly the same thing.** That is
  deliberate — a different message would let anyone test which addresses have
  accounts.

## Reset a password

1. On the sign-in card, type your email into the Email box.
2. Choose **Forgot your password?**
3. You will always see "If an account exists for that email, a reset link is on
   its way." — again, the same answer either way, on purpose.
4. Open the email and click the link. It opens `/reset-password.html`.
5. Enter the new password twice and submit.
6. You are sent back to sign in. This is intentional: a reset link should not
   also hand over a logged-in session.

If the link says it has expired or been used, request a new one. Reset links are
single-use and time-limited.

**This needs one dashboard setting.** Supabase only redirects to URLs on its
allow-list. See *Your action required* at the bottom.

## Create a chart

On first sign-in with no charts, **Set up My Chart** opens by itself.

1. First name (last name optional).
2. Birth date, birth time.
3. Time accuracy — if you genuinely do not know the time, choose **Unknown
   birth time**. Orbit will withhold houses, Rising, and Midheaven rather than
   guess them.
4. Birthplace — type a city and **pick a suggestion from the list**. The
   timezone is worked out from the place and date. The Save button will not
   accept free text, because a birthplace with no coordinates cannot produce a
   chart.
5. **Save My Chart.**

Your first chart is automatically named *My Chart*, marked primary, and made
active.

## Save, switch, and inspect charts

- **Add another**: the **+** next to the chart selector on Home, or **Add
  Chart** on Me.
- **Switch**: use the *Viewing* selector on Home. The daily reading follows the
  active chart.
- **Check it stuck**: refresh the browser. The same chart should still be
  active — that is stored on your account, not in the browser.
- **Me** shows Big Three, placements, and balances. **Simple** and **Advanced**
  change how much detail is shown; Simple is the default.

## History

**More → Fortune History** lists past daily readings, newest first. A brand new
account shows an empty state rather than an error — that is correct.

## Sign out and back in

Sign out from **More → Account**. You should return to the sign-in card, and
your charts should disappear from the screen.

Sign back in. Everything should return: charts, active chart, history.

## What success looks like

- Sign-in works and survives a browser refresh.
- Closing and reopening the browser keeps you signed in.
- Your chart loads on Home and Me.
- Switching the active chart changes the daily reading.
- History lists past readings.
- Signing out clears the screen; signing back in restores it.
- No red errors in the browser console (Option-Cmd-I → Console).

## Common errors, in plain language

| What you see | What it means | What to do |
| --- | --- | --- |
| "Orbit stopped before startup because local development is configured to use the hosted production database" | The safeguard. `.env.local` does not name the project. | Add `ORBIT_ACKNOWLEDGE_PRODUCTION_DB=mtdrazdastcgiweauwoj`, or run a local database instead. |
| "Sign-in required" / a 401 | Your session ended or you are signed out. | Sign in again. |
| "Session expired. Please sign in again." | The session could not be refreshed. | Sign in again. Report it if it keeps happening quickly. |
| `"reachable": false` in health | Supabase did not answer. | Check your connection, then the Supabase status page. |
| "Email or password did not match." | Wrong password, **or** no such account. | Deliberately ambiguous. Try a reset. |
| "This reset link has expired or has already been used." | Reset links are single-use. | Request a new one. |
| "Select the matching birthplace." | You typed a city but did not pick from the list. | Pick a suggestion — Orbit needs coordinates. |
| Ask Orbit answers but does not save | The conversation tables were missing. | Applied 2026-07-21. If it returns, check migrations. |

## Safe troubleshooting commands

None of these write anything.

```bash
# Which variables are set (names only, no values)
grep -oE '^[A-Z0-9_]+=' .env.local | tr -d '='

# Is the database reachable?
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool

# Are the engine and API healthy?
npm run orbit:runtime:check

# Full local test suite (never touches the hosted database)
npm run test:local

# Deployment readiness
npm run deploy:check
```

One command **does** write to the hosted database, and it makes you say so:

```bash
# Verifies Row Level Security by creating two disposable users, then deleting them
node --env-file=.env.local scripts/rls-check.js --confirm-project mtdrazdastcgiweauwoj
```

Without `--confirm-project` it refuses to run.

## Your action required

**Add the reset-password redirect to Supabase.** Password reset works
end-to-end in code, but Supabase will only redirect to URLs you have allow-listed.
Until this is added, the emailed link will refuse to open the reset page.

In the Supabase dashboard → **Authentication → URL Configuration → Redirect
URLs**, add:

```
http://localhost:3001/reset-password.html
```

and, when the app is deployed, the same path on the deployed host.

This could not be done for you: it is a dashboard setting, and this session was
scoped not to change Supabase project settings.
