-- Orbit :: 0004 Row Level Security
-- Enable RLS on EVERY table. User-owned tables are scoped to auth.uid().
-- Child tables inherit ownership via EXISTS on their parent.
-- Reference tables (tarot_cards, celestial_events) are read-only to everyone.
-- No policy grants writes to reference tables => only the service role (which
-- bypasses RLS) can seed them.

-- ── enable RLS everywhere ────────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.people              enable row level security;
alter table public.birth_profiles      enable row level security;
alter table public.chart_settings      enable row level security;
alter table public.chart_calculations  enable row level security;
alter table public.transit_events      enable row level security;
alter table public.celestial_events    enable row level security;
alter table public.tarot_cards         enable row level security;
alter table public.tarot_readings      enable row level security;
alter table public.journal_entries     enable row level security;
alter table public.journal_links       enable row level security;
alter table public.pattern_insights    enable row level security;
alter table public.vault_notes         enable row level security;
alter table public.sync_events         enable row level security;

-- ── profiles (keyed on user_id) ──────────────────────────────────────────────
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── helper: generate the four owner_id policies via a template ───────────────
-- (written out explicitly per table for clarity/auditability)

-- people
create policy "people_select_own" on public.people
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "people_insert_own" on public.people
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "people_update_own" on public.people
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "people_delete_own" on public.people
  for delete to authenticated using (owner_id = (select auth.uid()));

-- birth_profiles
create policy "birth_profiles_select_own" on public.birth_profiles
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "birth_profiles_insert_own" on public.birth_profiles
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "birth_profiles_update_own" on public.birth_profiles
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "birth_profiles_delete_own" on public.birth_profiles
  for delete to authenticated using (owner_id = (select auth.uid()));

-- chart_settings (owner via parent birth_profiles)
create policy "chart_settings_select_own" on public.chart_settings
  for select to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_settings.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_settings_insert_own" on public.chart_settings
  for insert to authenticated with check (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_settings.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_settings_update_own" on public.chart_settings
  for update to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_settings.birth_profile_id and bp.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_settings.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_settings_delete_own" on public.chart_settings
  for delete to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_settings.birth_profile_id and bp.owner_id = (select auth.uid())));

-- chart_calculations (owner via parent birth_profiles)
create policy "chart_calculations_select_own" on public.chart_calculations
  for select to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_calculations.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_calculations_insert_own" on public.chart_calculations
  for insert to authenticated with check (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_calculations.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_calculations_update_own" on public.chart_calculations
  for update to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_calculations.birth_profile_id and bp.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_calculations.birth_profile_id and bp.owner_id = (select auth.uid())));
create policy "chart_calculations_delete_own" on public.chart_calculations
  for delete to authenticated using (exists (
    select 1 from public.birth_profiles bp
    where bp.id = chart_calculations.birth_profile_id and bp.owner_id = (select auth.uid())));

-- transit_events
create policy "transit_events_select_own" on public.transit_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "transit_events_insert_own" on public.transit_events
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "transit_events_update_own" on public.transit_events
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "transit_events_delete_own" on public.transit_events
  for delete to authenticated using (owner_id = (select auth.uid()));

-- tarot_readings
create policy "tarot_readings_select_own" on public.tarot_readings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "tarot_readings_insert_own" on public.tarot_readings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "tarot_readings_update_own" on public.tarot_readings
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "tarot_readings_delete_own" on public.tarot_readings
  for delete to authenticated using (owner_id = (select auth.uid()));

-- journal_entries
create policy "journal_entries_select_own" on public.journal_entries
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "journal_entries_insert_own" on public.journal_entries
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "journal_entries_update_own" on public.journal_entries
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "journal_entries_delete_own" on public.journal_entries
  for delete to authenticated using (owner_id = (select auth.uid()));

-- journal_links (owner via parent journal_entries)
create policy "journal_links_select_own" on public.journal_links
  for select to authenticated using (exists (
    select 1 from public.journal_entries je
    where je.id = journal_links.journal_entry_id and je.owner_id = (select auth.uid())));
create policy "journal_links_insert_own" on public.journal_links
  for insert to authenticated with check (exists (
    select 1 from public.journal_entries je
    where je.id = journal_links.journal_entry_id and je.owner_id = (select auth.uid())));
create policy "journal_links_update_own" on public.journal_links
  for update to authenticated using (exists (
    select 1 from public.journal_entries je
    where je.id = journal_links.journal_entry_id and je.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.journal_entries je
    where je.id = journal_links.journal_entry_id and je.owner_id = (select auth.uid())));
create policy "journal_links_delete_own" on public.journal_links
  for delete to authenticated using (exists (
    select 1 from public.journal_entries je
    where je.id = journal_links.journal_entry_id and je.owner_id = (select auth.uid())));

-- pattern_insights
create policy "pattern_insights_select_own" on public.pattern_insights
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "pattern_insights_insert_own" on public.pattern_insights
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "pattern_insights_update_own" on public.pattern_insights
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pattern_insights_delete_own" on public.pattern_insights
  for delete to authenticated using (owner_id = (select auth.uid()));

-- vault_notes
create policy "vault_notes_select_own" on public.vault_notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "vault_notes_insert_own" on public.vault_notes
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "vault_notes_update_own" on public.vault_notes
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "vault_notes_delete_own" on public.vault_notes
  for delete to authenticated using (owner_id = (select auth.uid()));

-- sync_events (append-only from the client's perspective: select + insert)
create policy "sync_events_select_own" on public.sync_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "sync_events_insert_own" on public.sync_events
  for insert to authenticated with check (owner_id = (select auth.uid()));

-- ── public reference data :: read-only to anon + authenticated ───────────────
create policy "tarot_cards_public_read" on public.tarot_cards
  for select to anon, authenticated using (true);
create policy "celestial_events_public_read" on public.celestial_events
  for select to anon, authenticated using (true);
