-- Orbit :: 0001 core identity
-- Shared helpers, profiles, and people.
-- UUID PKs (gen_random_uuid is built into Postgres 13+), timestamptz everywhere.

-- ── shared updated_at trigger ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles :: one row per authenticated user ───────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists profiles_user_id_idx on public.profiles (user_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── people :: relationships owned by a user ──────────────────────────────────
create table if not exists public.people (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  display_name      text not null,
  relationship_type text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists people_owner_id_idx on public.people (owner_id);

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();
