-- Orbit Axis :: authenticated REST table grants
-- RLS policies define row ownership; these grants let local/hosted PostgREST
-- exercise those policies for authenticated users without opening anon writes.

grant usage on schema public to anon, authenticated;

grant select on public.tarot_cards, public.celestial_events to anon, authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.people,
  public.birth_profiles,
  public.chart_settings,
  public.chart_calculations,
  public.transit_events,
  public.tarot_readings,
  public.journal_entries,
  public.journal_links,
  public.pattern_insights,
  public.vault_notes,
  public.daily_fortunes,
  public.business_metrics
to authenticated;

grant select, insert on
  public.sync_events,
  public.llm_runs,
  public.vault_note_versions
to authenticated;

grant select, insert, update on public.vault_edit_proposals to authenticated;
