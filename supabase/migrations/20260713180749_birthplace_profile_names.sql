-- Orbit Axis :: birthplace search + profile names
-- Additive only. Runtime chart data stays in Supabase; provider keys and raw
-- Geoapify payloads are never stored.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.birth_profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birthplace_city text,
  add column if not exists birthplace_region text,
  add column if not exists birthplace_country text,
  add column if not exists birthplace_country_code text,
  add column if not exists geo_provider text,
  add column if not exists geo_place_id text,
  add column if not exists geo_resolved_at timestamptz;

create index if not exists birth_profiles_geo_place_id_idx
  on public.birth_profiles (geo_provider, geo_place_id);
