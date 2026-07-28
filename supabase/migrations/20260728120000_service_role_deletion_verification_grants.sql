-- Orbit Axis :: service-role read grants for post-deletion verification
-- (Dev Update 1.2)
--
-- WHY THIS IS NEEDED
--
-- Account deletion removes the auth identity and lets Postgres cascade the
-- owned rows. It then VERIFIES the cascade by counting anything still carrying
-- the deleted user's id, because "the schema says it cascades" is a claim, and
-- an account that reports itself deleted while its data remains is the worst
-- possible outcome for this operation.
--
-- That verification runs with the service-role key. `service_role` bypasses
-- row-level security — but it does NOT bypass table-level GRANTs, and it was
-- never granted anything: 20260714123000_authenticated_table_grants.sql grants
-- to `anon` and `authenticated` only.
--
-- So every verification query returned:
--
--   42501  permission denied for table profiles
--
-- findSurvivingRows() treats a query it cannot run as `count: "unknown"` rather
-- than as zero — deliberately, because treating "I could not check" as "it is
-- clean" is how a verification step becomes decoration. The consequence was
-- that a COMPLETELY SUCCESSFUL deletion reported DELETION_INCOMPLETE and told
-- the person to contact support.
--
-- Reproduced locally on 2026-07-28: the identity was gone, no orphan rows
-- existed, the other user's data was untouched, and the API still returned 500
-- DELETION_INCOMPLETE for all 16 verified tables.
--
-- WHY ONLY SELECT
--
-- The verification counts rows. It never reads their contents (it uses HEAD
-- with an exact count, so no personal data crosses the wire) and it never
-- writes. Deletion itself is performed by the Auth Admin API and the database's
-- own cascade, neither of which needs a REST grant. SELECT is therefore the
-- complete requirement, and anything more would be granting privileges for a
-- use that does not exist.

grant usage on schema public to service_role;

-- Exactly the tables in USER_OWNED_TABLES (lib/account/deletion.js). If a table
-- is added there without being added here, the verification degrades to
-- "unknown" for that table and deletion reports incomplete — loudly, which is
-- the correct direction for this to fail.
grant select on
  public.profiles,
  public.people,
  public.birth_profiles,
  public.daily_fortunes,
  public.ask_conversations,
  public.ask_messages,
  public.journal_entries,
  public.llm_runs,
  public.pattern_insights,
  public.sync_events,
  public.tarot_readings,
  public.transit_events,
  public.business_metrics,
  public.vault_notes,
  public.vault_note_versions,
  public.vault_edit_proposals
to service_role;
