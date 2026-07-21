---
id: 1b70c280-5762-438b-b227-d226a59b6625
title: Privacy and Data Inventory
type: technical_decision
status: active
created_at: 2026-07-19T00:00:00-05:00
updated_at: 2026-07-19T00:00:00-05:00
tags:
  - orbit
  - orbit-axis
  - privacy
  - security
  - app-store
source: user
supabase_sync: true
supabase_id:
---

# Privacy and Data Inventory

Audited 2026-07-19 against `3bfe4c2`. This is the factual basis for the privacy
policy, the App Store Connect privacy answers, and the account-deletion cascade.
Parent: [[App Store Release Readiness]].

## Data collected

| Data | Source | Stored where | Leaves device? | Linked to identity | Tracking | Deletion |
| --- | --- | --- | --- | --- | --- | --- |
| Email address | user at sign-up | Supabase `auth.users` | yes | yes | no | must delete on account deletion |
| Password | user | Supabase Auth (hashed) | yes | yes | no | deleted with identity |
| **Birth date** | user | `birth_profiles` | yes | yes | no | cascade |
| **Birth time + accuracy** | user | `birth_profiles` | yes | yes | no | cascade |
| **Birthplace + lat/long** | Geoapify search | `birth_profiles` | yes | yes | no | cascade |
| Names / nickname | user | `birth_profiles`, `profiles` | yes | yes | no | cascade |
| Calculated chart JSON | computed | `chart_calculations` | yes | yes | no | cascade |
| Daily fortunes | computed | `daily_fortunes` | yes | yes | no | cascade |
| Ask Orbit questions | user | `ask_messages.question` | yes | yes | no | cascade |
| Ask Orbit answers + evidence | computed | `ask_messages` | yes | yes | no | cascade |
| Conversations | app | `ask_conversations` | yes | yes | no | cascade |
| Preferences (detail level, timezone) | user | `profiles` | yes | yes | no | cascade |
| Session token | Supabase Auth | HttpOnly cookie | yes | yes | no | cleared on sign-out/deletion |

**Birth date, time, and location are personal data** and, combined, are close to
uniquely identifying. Treat them at the same sensitivity as the email address.

## Third parties

| Party | Receives | Purpose | Notes |
| --- | --- | --- | --- |
| **Supabase** | all account + chart data | auth + database | processor; must appear in the policy |
| **Geoapify** | birthplace search text | geocoding | server-side proxied; key never in client |
| **Ollama (local)** | structured answer plan + selected evidence | optional wording | **local only today**; never reached from a device build |

No analytics, no crash reporting, no advertising, no attribution, no tracking
SDKs exist. Nothing to declare for App Tracking Transparency **today** — re-check
if any SDK is added.

## Account-deletion cascade (must be built — B-04)

Owner-scoped tables requiring deletion:

- `ask_messages` → `ask_conversations`
- `daily_fortunes`
- `chart_calculations` → `birth_profiles`
- `chart_settings`, `journal_entries`, `journal_links`, `pattern_insights`,
  `tarot_readings`, `people`
- `profiles` (preferences, active-chart pointer)
- `vault_notes` / `sync_events` — confirm ownership scope
- Supabase `auth.users` identity itself
- Client: session cookie, any cached chart/reading state

Requirements: real deletion (not deactivation), honest failure reporting, and —
**if Sign in with Apple is ever adopted** — token revocation via Apple's REST API.

## Privacy-policy contents required

Identity + contact · every data category above · purpose per category · linkage ·
processors (Supabase, Geoapify) · retention · deletion + how to request it ·
security practices · children's privacy · international transfer · user rights ·
policy-change process · effective date.

The policy must be reachable **without logging in**, from inside the app and from
App Store Connect.

## Rules already enforced in code

- Row-level security on every user table; `owner_id = auth.uid()`; verified by
  real cross-user tests (Update 4.0.1).
- Ask Orbit logs metadata only — never question or answer bodies.
- The language model receives only the structured plan + selected evidence: no
  raw chart dump, no tokens, no Supabase config, no account data.
- Service-role key is server-only and unset for local development (Update 4.0.2).

## Deletion behaviour — Update 5.0, Session 5

Every category of personal data below now has a defined, tested deletion path.

**Removed by cascade when the account is deleted:** profiles, people, birth
profiles and saved charts, daily fortunes and reading history, Ask Orbit
conversations and messages, journal entries and links, LLM runs, pattern
insights, sync events, tarot readings, transit events, chart calculations, chart
settings, business metrics, and vault notes, versions, and proposals.

**Removed from the browser:** `oa_birth` (birth date, time, coordinates),
`oa_detail`, every `orbit.*` preference, sessionStorage, and in-memory reading
caches. No server-side deletion can reach these, so deletion clears them
explicitly.

**Retained:** nothing. There is no soft delete, no grace period, and no
retention window. Orbit keeps no copy.

**Not user-owned, so untouched:** celestial events and tarot card reference
data, which describe the sky and a deck rather than a person.

**No file storage exists.** The project has no storage buckets and no storage
objects, so there are no uploaded files to account for.

Deletion is verified rather than assumed: after removing the identity, Orbit
counts what remains across sixteen tables and reports an incomplete deletion if
anything survived. See [[Architecture Notes — Account Deletion]].
