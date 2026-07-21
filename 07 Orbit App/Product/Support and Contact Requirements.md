---
id: 8b52f9e1-3d47-4c60-a91e-7f04b2c8d536
title: Support and Contact Requirements
type: product_decision
status: blocked
created_at: 2026-07-21T00:00:00-05:00
updated_at: 2026-07-21T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - support
  - release
  - blocker
source: user
supabase_sync: true
---

# Support and Contact Requirements

What Orbit Axis still needs from its owner before it can be offered publicly.
Identified in Update 5.1.

Related: [[Legal Pages and Disclaimers]], [[App Store Release Readiness]],
[[Known Issues — App Store Blockers]]

## Why these are blockers rather than defaults

The application will not invent them. Every legal page reads them from validated
configuration and renders a visible "not yet published" state when they are
missing, so the gap is obvious rather than papered over.

That is the point: a fake support address is a promise the product cannot keep,
and an invented jurisdiction is a legal claim nobody made.

## The four decisions

### Publisher name — `ORBIT_LEGAL_ENTITY`

Who Orbit Axis is published by. Your own name is a legitimate answer for a solo
release; a company name is the other. It appears in the Privacy Policy and the
Terms, and app stores ask for it separately.

### Support email — `ORBIT_SUPPORT_EMAIL`

A real address that is actually read. It carries privacy requests, security
reports, and account help, so it should not be a personal address you would
rather not publish. An alias that forwards somewhere is fine.

App stores require a working support contact.

### Governing jurisdiction — `ORBIT_GOVERNING_JURISDICTION`

Which law governs the Terms of Use. Normally where the publisher is established.
Worth asking the reviewing attorney rather than guessing — this one has
consequences that are not obvious from the outside.

### Minimum age — `ORBIT_MINIMUM_AGE`

Accepted values are 13 to 21. This is **not only** a legal choice:

- It sets the app-store age rating
- Under 16 in parts of the EU brings parental-consent obligations
- Under 13 brings COPPA obligations in the US, which Orbit is not built for
- Astrology content is generally rated low, so the constraint is data
  protection rather than content

13, 16, or 18 are the realistic options. 16 is the common choice for an app
handling personal data without a children's-privacy programme.

## Also outstanding, and not a configuration value

**Attorney review of the Terms of Use.** The document is written to describe
what Orbit really does, which makes it honest, but honest is not the same as
legally sufficient. See [[Legal Pages and Disclaimers]].

**Supabase redirect allow-list.** Password reset works end to end in code, but
Supabase only redirects to allow-listed URLs and does not expose that list to
the application, so it could not be verified programmatically. Add under
Authentication → URL Configuration → Redirect URLs:

```text
http://localhost:3001/reset-password.html
```

Plus the deployed equivalent when Orbit is deployed.

## Once decided

Set them in `.env.local` (and, later, in the Vercel environment). Every page
picks them up on reload — no code change, no redeploy of content.
