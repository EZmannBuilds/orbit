# Testing account deletion locally

> **Use a disposable account. Do not test permanent deletion with your primary
> account.** Deletion is real and immediate. There is no undo, no soft-delete,
> and no backup Orbit can restore from.

Everything here runs on your machine against the real Orbit Axis Supabase
project. Nothing deploys, publishes, or pushes.

## Start the app

```bash
cd /Users/mr.mann/Projects/orbit/.claude/worktrees/vercel-deployment-readiness-617643
npm ci
npm run dev
```

Open **http://localhost:3001**

You will see this, and it is expected:

```
  ⚠  Local development is using the HOSTED database (project mtdrazdastcgiweauwoj).
     Changes here affect real accounts.
```

That warning is the reason this page insists on a disposable account. A deletion
you run here deletes from the same database your real account lives in.

## Create a disposable account

1. Open <http://localhost:3001>
2. Choose **Create account**
3. Use an address you do not care about — `orbit-test-<anything>@example.com`
   works and is obviously synthetic
4. Any password of 8+ characters

If email confirmation is switched on in Supabase, confirm it, then sign in.

## Give it something to delete

Deleting an empty account proves very little. Before deleting:

1. Create a chart when **Set up My Chart** appears (any birth details — do not
   use your own)
2. Let **Home** load a daily reading
3. Open **Ask Orbit** and ask one question
4. Change the detail level on Home from Simple to Advanced

## Cancel a deletion first

Confirm the escape hatches work before using the real one.

1. **More → Account** (expand it)
2. Scroll to the red **Delete your account** section
3. Choose **Delete account**
4. The dialog opens. **"Delete my account" is greyed out** — that is correct
5. Type `delete` in lowercase. The button **stays** greyed out
6. Type `DELETE`. The button becomes available
7. Press **Escape**, or choose **Cancel**

The dialog should close and the keyboard focus should land back on the **Delete
account** button you started from. Reopen it — the box should be empty again and
the button greyed out.

Your account should be completely untouched.

## Complete the deletion

1. Reopen the dialog
2. Type `DELETE`
3. Choose **Delete my account**

Within a few seconds:

- The dialog closes
- You are returned to the signed-out home screen
- A message confirms the account was permanently deleted

## What success looks like

Check each of these:

| Check | Expected |
| --- | --- |
| Refresh the page | Still signed out. No chart, no reading |
| Press the browser Back button | No private page reappears |
| Sign in with the deleted email and password | **Fails** — "Email or password did not match." |
| Create a new account with the same email | Works, and starts completely empty |

That last one matters: the address is free again, and the new account inherits
nothing from the old one.

## Confirming the data is really gone

Deletion removes the Supabase identity, and every user-owned table cascades from
it in a single database transaction. Orbit then counts what is left across
sixteen tables and refuses to report success if anything survived.

To check yourself, from the Supabase dashboard SQL editor:

```sql
-- Should return 0
select count(*) from auth.users where email = 'the-disposable-address@example.com';
```

You do not need to check each table by hand — if any row had survived, the app
would have shown you an error instead of a confirmation.

## Verifying Tarot, Learn, and News are gone from version one

They are built but unfinished, so they are hidden in production.

1. Look at the left navigation. It should read exactly:
   **Home · Me · Ask Orbit · More**
2. There should be no Tarot, no Learn, no News, and no empty gap where they were
3. Type `#tarot` at the end of the URL and press Enter → you land on **Home**,
   not a blank or half-built page. Same for `#learn` and `#news`
4. Open the command palette (the **Command** button) → none of the three appear

To work on them again, add this to `.env.local` and restart:

```
ORBIT_FEATURE_TAROT=true
```

Only that feature comes back. Production ignores these variables entirely — the
features cannot be switched on in production by configuration alone, which is
deliberate.

## Common errors, in plain language

| What you see | What it means | What to do |
| --- | --- | --- |
| "Type DELETE to confirm" | The typed text was not exactly `DELETE` | Type it in capitals, no spaces |
| "Sign in to delete your account." | Your session ended before you confirmed | Sign in and try again |
| "Your account could not be deleted just now. Nothing was removed." | Orbit could not reach Supabase. Nothing was deleted | Check your connection and retry |
| "…some data could not be confirmed deleted (reference …)" | The account was removed but a check did not come back clean | Retry — it is safe. Quote the reference if it persists |
| "Could not reach Orbit. Your account was not deleted." | The browser could not reach the local server | Check the server is still running |
| Deletion succeeds but you were already deleted | A retry after a partial failure | Treated as success, which is correct |

## Safe troubleshooting commands

None of these write anything:

```bash
# Which feature flags are active right now
curl -s http://localhost:3001/api/features | python3 -m json.tool

# Is the database reachable?
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool

# Anonymous deletion must be refused
curl -s -X DELETE http://localhost:3001/api/v1/account \
  -H 'Content-Type: application/json' -d '{"confirmation":"DELETE"}'

# Full local test suite (never touches the hosted database)
npm run test:local
```

## What not to do

- **Do not** sign in with your real account and click through this guide
- **Do not** paste `.env.local` contents anywhere
- **Do not** run the deletion endpoint with a token belonging to a real account
- **Do not** disable the startup warning — it is the thing standing between a
  test and a real account

## Your action required

Nothing for this page. The one outstanding external setting is unrelated to
deletion: the password-reset redirect URL, described in
[manual-auth-database-test.md](manual-auth-database-test.md).
