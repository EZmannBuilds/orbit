-- Orbit Axis :: Update Two — remove the "Balanced" astrology detail level.
-- Additive and idempotent. Only Simple and Advanced remain; Simple is the
-- default. Existing "Balanced" rows (in any casing) migrate to Simple — never
-- to Advanced, which would expose degrees/coordinates/aspects the user never
-- chose to see. Any other non-conforming value is also coerced to Simple so the
-- tightened check constraint can be added cleanly.

-- 1. Migrate data first, before tightening the constraint.
update public.profiles
  set astrology_detail_level = 'Simple'
  where astrology_detail_level is null
     or astrology_detail_level not in ('Simple', 'Advanced');

-- 2. Replace the detail-level check constraint (drop the old three-value one,
--    add the two-value one). Guarded so re-running is safe.
alter table public.profiles
  drop constraint if exists profiles_detail_level_chk;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_detail_level_chk') then
    alter table public.profiles
      add constraint profiles_detail_level_chk
      check (astrology_detail_level in ('Simple', 'Advanced'));
  end if;
end $$;

-- 3. Ensure the column default is Simple (unchanged from before, restated so the
--    intent is explicit and the migration is self-contained).
alter table public.profiles
  alter column astrology_detail_level set default 'Simple';
