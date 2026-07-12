-- Orbit :: saved charts foundation
-- Extends existing tables (no duplicates). RLS already covers these tables;
-- new columns inherit the existing owner-scoped policies.

-- ── birth_profiles: saved-chart fields ───────────────────────────────────────
alter table public.birth_profiles
  add column if not exists nickname          text,
  add column if not exists relationship_type text,
  add column if not exists is_primary        boolean not null default false,
  add column if not exists zodiac_system     text not null default 'tropical',
  add column if not exists house_system      text not null default 'placidus',
  add column if not exists notes             text;

-- Exactly one primary "My Chart" per owner.
create unique index if not exists birth_profiles_one_primary_per_owner
  on public.birth_profiles (owner_id)
  where is_primary;

-- ── chart_calculations: caching + status fields ──────────────────────────────
alter table public.chart_calculations
  add column if not exists ephemeris_version  text,
  add column if not exists input_hash         text,
  add column if not exists calculation_status text not null default 'complete',
  add column if not exists warnings           jsonb not null default '[]'::jsonb;

-- Cache key: don't recompute an unchanged chart for the same engine version.
create unique index if not exists chart_calculations_cache_key
  on public.chart_calculations (birth_profile_id, calculation_version, input_hash);

-- ── profiles: active-chart preference ────────────────────────────────────────
alter table public.profiles
  add column if not exists active_birth_profile_id uuid
    references public.birth_profiles (id) on delete set null;
