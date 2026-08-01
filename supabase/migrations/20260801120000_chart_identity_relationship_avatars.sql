-- Orbit Axis :: saved-chart identity — relationship constraint and private
-- avatars (Dev Update 1.10)
--
-- WHAT THE AUDIT FOUND, AND WHY THIS MIGRATION IS SMALLER THAN EXPECTED
--
-- Three of the columns Dev Update 1.10 was scoped to add already exist on
-- birth_profiles and are already in use:
--
--   nickname           the chart's display name
--   is_primary         the explicit "this is the account owner's chart" marker
--   relationship_type  a nullable text column, already carrying real values
--
-- So no display_name column, no second self-marker, and no duplicate
-- relationship column are added here. Adding them would have created two
-- sources of truth for the same fact, which is how a schema starts lying.
--
-- WHY THE CONSTRAINT PERMITS SIX VALUES AND NOT FOUR
--
-- Dev Update 1.10's product model is four relationship types: self, family,
-- friend, partner. The database constraint below deliberately permits two more.
--
-- The application currently deployed in Production at a9c1a1c ships a
-- six-value relationship selector (public/index.html) and writes 'other' by
-- default for every additional chart (public/app.js). Production data confirms
-- the values are real, not hypothetical.
--
-- A four-value CHECK would therefore reject writes from the live application
-- the moment this migration landed — and migrations are expected to be safe to
-- apply BEFORE the new application deploys. A constraint that breaks the
-- running site is not additive, whatever else it is.
--
-- So the boundary is split:
--
--   the DATABASE  rejects arbitrary values, and tolerates the two legacy ones
--   the 1.10 API  rejects 'other' and 'public_figure' on new writes
--
-- The database protects against corruption. The application enforces the
-- product model. Tightening the constraint to four values is a LATER
-- migration, and only once nothing writes a legacy value any more — see
-- "Future cleanup" at the foot of this file.

-- ── Relationship constraint ─────────────────────────────────────────────────
--
-- NOT VALID first, then VALIDATE, so the table is not fully locked while it is
-- scanned. Existing rows are checked by the VALIDATE step rather than skipped:
-- if a value outside this set exists, this migration should fail loudly here
-- rather than leave an unenforced constraint that reads as protection.

alter table public.birth_profiles
  drop constraint if exists birth_profiles_relationship_type_check;

alter table public.birth_profiles
  add constraint birth_profiles_relationship_type_check
  check (
    relationship_type is null
    or relationship_type in (
      -- The four the Dev Update 1.10 interface offers.
      'self', 'family', 'friend', 'partner',
      -- Legacy, readable and writable by the deployed application. Not
      -- offered as new choices. See the header.
      'other', 'public_figure'
    )
  ) not valid;

alter table public.birth_profiles
  validate constraint birth_profiles_relationship_type_check;

-- ── Avatar metadata ─────────────────────────────────────────────────────────
--
-- Metadata only. The image bytes live in Storage: Postgres is not an image
-- host, and base64 in a row would be copied into every chart list response
-- that selects *.
--
-- avatar_version exists so the delivery endpoint can be cached privately and
-- still invalidate on replacement. A timestamp alone is a weaker cache key
-- because two replacements inside the same clock tick collide.

alter table public.birth_profiles
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_version bigint not null default 0,
  add column if not exists avatar_updated_at timestamptz;

comment on column public.birth_profiles.avatar_storage_path is
  'Owner-scoped object path in the private chart-avatars bucket. Never returned by ordinary chart API responses.';
comment on column public.birth_profiles.avatar_version is
  'Increments on every successful avatar write. Used as the private cache validator.';
comment on column public.birth_profiles.relationship_type is
  'Dev Update 1.10 writes only self/family/friend/partner. other and public_figure are legacy values from the pre-1.10 application, tolerated for backward compatibility and never written by 1.10.';

-- ── Deterministic backfill, and only the deterministic part ─────────────────
--
-- A chart explicitly marked is_primary IS the account owner's own chart —
-- that is what the column has always meant — so NULL there can become 'self'
-- without guessing.
--
-- Everything else is left exactly as it is. An existing 'other' stays 'other';
-- a NULL on a non-primary chart stays NULL. Both surface as "Relationship not
-- set" in the interface with an action to classify them. Inferring family or
-- partner from a nickname would be inventing a fact about someone's life.

update public.birth_profiles
   set relationship_type = 'self'
 where is_primary = true
   and relationship_type is null;

-- ── Private avatar bucket ───────────────────────────────────────────────────
--
-- public = false. A public bucket would make every chart avatar readable by
-- anyone holding the URL, and these are pictures of people the account owner
-- knows, attached to their birth data.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chart-avatars',
  'chart-avatars',
  false,
  1048576,                                    -- 1 MB, the normalized ceiling
  array['image/webp', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Owner-scoped storage policies ───────────────────────────────────────────
--
-- Paths are <owner-id>/<chart-id>/avatar.webp, so the first path segment is
-- the authenticated user's id and every policy compares against it. That makes
-- ownership a property of the path itself rather than of a lookup that could
-- drift from the object it authorises.
--
-- There is deliberately no SELECT policy for `anon`: an anonymous request
-- matches no policy and is refused. Absence is the refusal.

drop policy if exists "chart avatars are readable by their owner" on storage.objects;
create policy "chart avatars are readable by their owner"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chart-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chart avatars are writable by their owner" on storage.objects;
create policy "chart avatars are writable by their owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chart-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chart avatars are replaceable by their owner" on storage.objects;
create policy "chart avatars are replaceable by their owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chart-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'chart-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chart avatars are removable by their owner" on storage.objects;
create policy "chart avatars are removable by their owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chart-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Future cleanup, deliberately NOT done here ──────────────────────────────
--
-- The constraint may be narrowed to the four product values only after ALL of:
--
--   1. the Dev Update 1.10 application is live in Production
--   2. no deployed build still writes 'other' (the current one does)
--   3. every 'other' row has been intentionally classified, or set to NULL
--   4. every 'public_figure' row has been intentionally resolved
--   5. export and recovery implications are written down
--
-- That cleanup is not assigned to Dev Update 1.11, which is Relationship-Aware
-- Compatibility. It needs its own decision.
--
-- RECOVERY, not rollback. Reversing this migration would drop
-- avatar_storage_path and orphan every uploaded image in the bucket, and drop
-- the constraint that keeps arbitrary relationship values out. Dropping the
-- columns is data loss, not a rollback, and presenting it as harmless would be
-- untrue. To recover: restore from backup, or leave the additive columns in
-- place — the pre-1.10 application ignores them entirely.
