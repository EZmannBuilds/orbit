-- Orbit Axis :: active chart history
-- Tracks the saved chart a user actually selected most recently, without
-- confusing activity with edits to birth/profile data.

alter table public.birth_profiles
  add column if not exists last_active_at timestamptz;

create index if not exists birth_profiles_owner_last_active_idx
  on public.birth_profiles (owner_id, last_active_at desc)
  where last_active_at is not null;

-- The shared updated_at trigger is used by several tables. For birth_profiles,
-- keep updated_at focused on chart/profile edits: changing only last_active_at
-- must not make an activity write look like a birth-data edit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'birth_profiles'
     and (to_jsonb(new) - 'updated_at' - 'last_active_at') = (to_jsonb(old) - 'updated_at' - 'last_active_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- Existing accounts: only the current valid active chart gets a history marker.
-- Historical charts stay null unless/until the user actually selects them.
update public.birth_profiles bp
set last_active_at = now()
from public.profiles p
where p.user_id = bp.owner_id
  and p.active_birth_profile_id = bp.id
  and bp.last_active_at is null;

-- Atomic owner-scoped activation helper used by the API. It updates the profile
-- preference and activity timestamp together, with RLS and the active-chart
-- ownership trigger preserving user boundaries.
create or replace function public.activate_birth_profile(p_birth_profile_id uuid)
returns public.birth_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_birth_profile public.birth_profiles;
begin
  if v_owner_id is null then
    raise exception 'sign-in required';
  end if;

  update public.birth_profiles
  set last_active_at = now()
  where id = p_birth_profile_id
    and owner_id = v_owner_id
  returning * into v_birth_profile;

  if not found then
    raise exception 'chart not found';
  end if;

  insert into public.profiles (user_id, active_birth_profile_id)
  values (v_owner_id, p_birth_profile_id)
  on conflict (user_id) do update
    set active_birth_profile_id = excluded.active_birth_profile_id;

  return v_birth_profile;
end;
$$;

revoke all on function public.activate_birth_profile(uuid) from public;
grant execute on function public.activate_birth_profile(uuid) to authenticated;
