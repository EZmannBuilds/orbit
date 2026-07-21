---
id: 5e91c274-6a38-4d1f-b703-8c42e9f0a165
title: Legal Pages and Disclaimers
type: product_decision
status: active
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - legal
  - privacy
  - release
  - compliance
source: user
supabase_sync: true
---

# Legal Pages and Disclaimers

The public information surfaces, built in Update 5.1.

Related: [[Privacy and Data Inventory]], [[Architecture Notes — Account Deletion]],
[[Version-One Scope]], [[Support and Contact Requirements]],
[[Architecture Notes — Open Source Licensing]]

## The pages

```text
/privacy            what is collected, why, and how to remove it
/terms              Terms of Use — never "Terms and Services"
/support            practical help, written for a stuck person
/source             AGPL disclosure and live version facts
/account-deletion   what deletion really does
```

All work without an account, share one layout, and are linked from
**More → Account** and from the sign-in card — the point at which someone is
actually agreeing to the terms.

Both `/privacy` and `/privacy.html` resolve. `vercel.json` sets `cleanUrls` and
the local server does the same, so a link that works locally works deployed.

## The governing principle: nothing is invented

Four facts are **owner decisions, not engineering ones**:

- who publishes Orbit Axis
- the support email address
- the governing jurisdiction
- the minimum age

Each is validated configuration. Anything unset renders as a visible
"not yet published" box.

**A plausible-looking support address is worse than a visible gap.** A gap gets
noticed and fixed; a convincing placeholder gets shipped and silently swallows
the messages people send to it. No `mailto:` link is rendered at all until a real
address exists, so the pages cannot ship a dead contact.

Tests assert that no page contains an invented company suffix, street address,
or jurisdiction — the specific failure mode being guarded against is a page that
*looks* complete.

## Validation refuses rather than accepts

- A malformed email address is rejected, not rendered
- An age outside 13–21 is treated as a typo, not a policy
- A source URL must be https on a known code host; anything else falls back to
  "publication pending"

**Bug found while testing:** `parseInt("16.5")` silently yields `16`, which would
have published a minimum age nobody wrote. Digits only now.

## The Privacy Policy describes this application

It was reconciled against the real schema and the real request path, not adapted
from a template. It states plainly that there is **no analytics, no tracking, and
no advertising**, because there is none — and a template would have said
otherwise by default.

It does **not** claim instant erasure from provider backups, because that cannot
be verified. It says so instead.

## Disclaimers: one line where people are

A single quiet sentence under Ask Orbit — reflection and entertainment, not
medical, mental-health, legal, or financial advice, not an emergency service —
with a link to the full terms.

Deliberately understated. An entertainment feature wrapped in alarming styling
teaches people to skip warnings, and then the one warning that matters is skipped
too. The sentence that matters is the crisis one, and it points somewhere real
rather than at Orbit.

The Terms separate **calculated fact** from **AI-assisted wording**, and record
that the public service uses the deterministic engine with no external AI
provider involved.

## Not attorney-reviewed

> This document is a practical product draft and has not been reviewed by an
> attorney.

Recorded in an HTML comment for maintainers and in the owner guide, deliberately
**not** on the customer-facing page, where it would undermine the document
without helping anyone. It describes what Orbit really does, which makes it
honest — honest is not the same as legally sufficient.

## Still required from the owner

| Value | Variable |
| --- | --- |
| Publisher name | `ORBIT_LEGAL_ENTITY` |
| Support email | `ORBIT_SUPPORT_EMAIL` |
| Governing jurisdiction | `ORBIT_GOVERNING_JURISDICTION` |
| Minimum age (13/16/18) | `ORBIT_MINIMUM_AGE` |

Plus an attorney review before public launch. The minimum age also affects the
app-store age rating, so it is not purely a legal choice.
