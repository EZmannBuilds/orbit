-- Orbit Axis :: accounts + saved chart security hardening
-- Adds database-level ownership checks for active chart preference and daily
-- fortunes. Existing service code already scopes these writes; these guards make
-- the same invariants true at the RLS/database boundary.

create or replace function public.active_birth_profile_belongs_to_profile_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active_birth_profile_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.birth_profiles bp
    where bp.id = new.active_birth_profile_id
      and bp.owner_id = new.user_id
  ) then
    raise exception 'active_birth_profile_id must belong to profile user';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_active_birth_profile_owner_check on public.profiles;
create trigger profiles_active_birth_profile_owner_check
  before insert or update of active_birth_profile_id, user_id on public.profiles
  for each row execute function public.active_birth_profile_belongs_to_profile_user();

drop policy if exists "daily_fortunes_insert_own" on public.daily_fortunes;
drop policy if exists "daily_fortunes_update_own" on public.daily_fortunes;

create policy "daily_fortunes_insert_own" on public.daily_fortunes
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.birth_profiles bp
      where bp.id = daily_fortunes.birth_profile_id
        and bp.owner_id = (select auth.uid())
    )
  );

create policy "daily_fortunes_update_own" on public.daily_fortunes
  for update to authenticated using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.birth_profiles bp
      where bp.id = daily_fortunes.birth_profile_id
        and bp.owner_id = (select auth.uid())
    )
  ) with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.birth_profiles bp
      where bp.id = daily_fortunes.birth_profile_id
        and bp.owner_id = (select auth.uid())
    )
  );
