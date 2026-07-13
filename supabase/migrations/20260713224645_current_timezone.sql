-- Orbit Axis :: current-timezone context (Home / Current Sky redesign)
-- Additive only. This is the user's *current* (browsing) timezone, distinct
-- from birth_profiles.timezone_name (birth timezone, tied to birthplace and
-- never changed automatically). Drives which local calendar day is "today"
-- for the daily fortune and the Current Sky local-time display.

alter table public.profiles
  add column if not exists current_timezone_name text,
  add column if not exists current_timezone_source text,
  add column if not exists current_timezone_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_current_timezone_source_chk') then
    alter table public.profiles
      add constraint profiles_current_timezone_source_chk
      check (current_timezone_source is null or current_timezone_source in ('device', 'geolocation'));
  end if;
end $$;
