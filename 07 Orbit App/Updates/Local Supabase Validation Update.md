# Local Supabase Validation (Update 3.2.3)

Branch: `feat/orbit-axis-active-chart-history`
Date: 2026-07-14

This update validates the active-chart history migration against the local
Supabase stack after Docker became available. It also fixes one real local
PostgREST permission gap found during validation.

## What was validated

- Local Supabase was running with the API, database, auth, realtime, storage,
  and Studio services available.
- `20260714103000_active_chart_history.sql` was already applied locally.
- `birth_profiles.last_active_at` exists as nullable `timestamptz`.
- `public.activate_birth_profile(p_birth_profile_id uuid)` is
  `SECURITY INVOKER`, uses the caller auth context, and only has execute access
  for authenticated callers plus database owner maintenance access.
- RLS is enabled on `birth_profiles` and `profiles`.
- Supabase lint, schema diff, and database advisors were clean locally.

## Permission repair

The first authenticated PostgREST probe failed with `permission denied for table
birth_profiles`. RLS policies were present, but `authenticated` did not have the
table privileges needed for PostgREST and the `SECURITY INVOKER` RPC path to
exercise those policies.

Added migration:

- `20260714123000_authenticated_table_grants.sql`

The migration grants authenticated users table privileges required by the
existing owner-scoped RLS policies, keeps public reference tables read-only, and
does not open anonymous writes.

## Integration behavior

Validated locally with synthetic users and charts only:

- Creating the first chart activates it and records activity.
- Creating additional charts preserves the current active chart.
- Switching active charts persists across reload and later sign-in.
- Renaming a chart does not change `last_active_at`.
- Editing birth information does not change `last_active_at`.
- A stale active-chart selection rolls back cleanly when the target no longer
  exists.
- Deleting the active chart promotes a remaining chart as active.
- Anonymous RPC use is denied.
- Cross-user activation and direct `last_active_at` updates are denied.

## Browser validation

A real local app session against the local Supabase stack restored the active
chart without reopening onboarding. After deleting the active synthetic chart
through the app API, the browser restored the promoted chart on Home at 375px,
768px, and 1280px widths. Current Sky rendered and no browser dev logs were
reported.

The in-app browser automation opened the delete confirmation modal, but one
modal confirm click path stalled in that tool session. The server/API deletion
path passed and the unit tests cover the same deletion fallback.

## Automated checks

- `supabase migration up`
- `supabase db lint --local --level error`
- `supabase db diff --local --schema public`
- `supabase db advisors --local --type all --level warn --fail-on none`
- `npm run lint`
- `npm run build`
- `npm run orbit:vault:validate`
- `npm run orbit:vault:status`
- `npm test`

## Migration-history mismatch

`supabase migration list` still reports eight remote-only migration versions:

- `20260711210800`
- `20260711210816`
- `20260711210836`
- `20260711210911`
- `20260711210943`
- `20260711230843`
- `20260712033216`
- `20260712042700`

Those filenames were not found in the local migration directory or local git
history. No repair, reset, pull, or push was run. Treat this as hosted migration
metadata from earlier or alternate migration filenames until the exact remote
history is reconciled intentionally.
