-- Orbit Axis :: daily fortunes + astrology detail-level preference
-- Extends existing structures (no duplicate settings system). RLS scoped to the
-- authenticated owner. Deterministic fortunes are cached one-per
-- (chart, date, engine version).

-- ── detail-level preference on the existing profiles table ───────────────────
alter table public.profiles
  add column if not exists astrology_detail_level text not null default 'Simple';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_detail_level_chk') then
    alter table public.profiles
      add constraint profiles_detail_level_chk
      check (astrology_detail_level in ('Simple', 'Balanced', 'Advanced'));
  end if;
end $$;

-- ── daily_fortunes ───────────────────────────────────────────────────────────
create table if not exists public.daily_fortunes (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users (id) on delete cascade,
  birth_profile_id       uuid not null references public.birth_profiles (id) on delete cascade,
  fortune_date           date not null,
  timezone_name          text not null,
  fortune_engine_version text not null,
  seed_hash              text not null,
  sky_snapshot           jsonb not null default '{}'::jsonb,
  mood                   text,
  love_reading           text,
  luck_reading           text,
  watch_out              text,
  lucky_number           integer,
  lucky_color_name       text,
  lucky_color_value      text,
  factors                jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- one fortune per chart, per local date, per engine version
  unique (birth_profile_id, fortune_date, fortune_engine_version)
);

create index if not exists daily_fortunes_owner_idx on public.daily_fortunes (owner_id);
create index if not exists daily_fortunes_chart_idx on public.daily_fortunes (birth_profile_id);
create index if not exists daily_fortunes_owner_date_idx on public.daily_fortunes (owner_id, fortune_date desc);

create trigger daily_fortunes_set_updated_at
  before update on public.daily_fortunes
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.daily_fortunes enable row level security;

create policy "daily_fortunes_select_own" on public.daily_fortunes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "daily_fortunes_insert_own" on public.daily_fortunes
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "daily_fortunes_update_own" on public.daily_fortunes
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "daily_fortunes_delete_own" on public.daily_fortunes
  for delete to authenticated using (owner_id = (select auth.uid()));
