-- Orbit :: 0005 harden set_updated_at()
-- Pin search_path so the trigger function can't be hijacked by a mutable path.
-- Addresses advisor: 0011_function_search_path_mutable.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
