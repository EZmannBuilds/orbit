-- Orbit :: 0002 astrology
-- Birth data, chart settings/calculations, transits, and public celestial events.

-- ── birth_profiles ───────────────────────────────────────────────────────────
create table if not exists public.birth_profiles (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  person_id           uuid references public.people (id) on delete set null,
  birth_date          date,
  birth_time          time,
  time_accuracy       text,               -- e.g. 'exact' | 'approximate' | 'unknown'
  birthplace_name     text,
  latitude            numeric(9,6),
  longitude           numeric(9,6),
  timezone_name       text,               -- IANA, e.g. 'America/Chicago'
  utc_offset_at_birth text,               -- e.g. '-05:00'
  source_note_path    text,               -- provenance back to the vault note
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists birth_profiles_owner_id_idx on public.birth_profiles (owner_id);
create index if not exists birth_profiles_person_id_idx on public.birth_profiles (person_id);

create trigger birth_profiles_set_updated_at
  before update on public.birth_profiles
  for each row execute function public.set_updated_at();

-- ── chart_settings :: how to compute a given birth profile's chart ───────────
create table if not exists public.chart_settings (
  id                   uuid primary key default gen_random_uuid(),
  birth_profile_id     uuid not null references public.birth_profiles (id) on delete cascade,
  zodiac_system        text not null default 'tropical',   -- tropical | sidereal
  ayanamsa             text,                                -- only for sidereal
  house_system         text not null default 'placidus',
  include_minor_aspects boolean not null default false,
  orb_profile          text not null default 'standard',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists chart_settings_birth_profile_id_idx on public.chart_settings (birth_profile_id);

create trigger chart_settings_set_updated_at
  before update on public.chart_settings
  for each row execute function public.set_updated_at();

-- ── chart_calculations :: deterministic computed output (jsonb) ──────────────
create table if not exists public.chart_calculations (
  id                uuid primary key default gen_random_uuid(),
  birth_profile_id  uuid not null references public.birth_profiles (id) on delete cascade,
  calculation_version text not null,
  calculated_at     timestamptz not null default now(),
  chart_data        jsonb not null,
  source_hash       text                  -- hash of inputs; skip recompute if unchanged
);
create index if not exists chart_calculations_birth_profile_id_idx on public.chart_calculations (birth_profile_id);
create index if not exists chart_calculations_source_hash_idx on public.chart_calculations (source_hash);

-- ── transit_events :: transiting body vs natal body, user-owned ──────────────
create table if not exists public.transit_events (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  birth_profile_id   uuid references public.birth_profiles (id) on delete cascade,
  transiting_body    text not null,
  natal_body         text not null,
  aspect_type        text not null,
  orb                numeric(6,3),
  applying           boolean,
  starts_at          timestamptz,
  exact_at           timestamptz,
  ends_at            timestamptz,
  calculation_version text
);
create index if not exists transit_events_owner_id_idx on public.transit_events (owner_id);
create index if not exists transit_events_owner_exact_idx on public.transit_events (owner_id, exact_at);
create index if not exists transit_events_birth_profile_id_idx on public.transit_events (birth_profile_id);

-- ── celestial_events :: PUBLIC reference sky events (not user-owned) ──────────
create table if not exists public.celestial_events (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,           -- ingress | lunation | retrograde | ...
  primary_body   text not null,
  secondary_body text,
  sign           text,
  degree         numeric(6,3),
  starts_at      timestamptz,
  exact_at       timestamptz,
  ends_at        timestamptz,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists celestial_events_exact_at_idx on public.celestial_events (exact_at);
create index if not exists celestial_events_type_idx on public.celestial_events (event_type);
