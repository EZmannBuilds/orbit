-- Orbit :: 0006 local LLM run metadata, vault edit proposals, versions, metrics

create table if not exists public.llm_runs (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users (id) on delete cascade,
  provider              text not null default 'ollama',
  model                 text,
  task_type             text not null,
  prompt_hash           text,
  context_note_ids      uuid[] not null default '{}',
  status                text not null,
  duration_ms           integer,
  input_token_estimate  integer,
  output_token_estimate integer,
  error_code            text,
  prompt_version        text,
  created_at            timestamptz not null default now()
);
create index if not exists llm_runs_owner_id_idx on public.llm_runs (owner_id);
create index if not exists llm_runs_created_at_idx on public.llm_runs (created_at);

create table if not exists public.vault_edit_proposals (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users (id) on delete cascade,
  operation             text not null check (operation in ('create', 'update', 'append')),
  note_id               uuid,
  note_path             text not null,
  reason                text,
  base_hash             text,
  proposed_content_hash text,
  diff_text             text,
  status                text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'stale', 'applied', 'failed')),
  model                 text,
  validation_errors     text[] not null default '{}',
  created_at            timestamptz not null default now(),
  reviewed_at           timestamptz,
  applied_at            timestamptz
);
create index if not exists vault_edit_proposals_owner_id_idx on public.vault_edit_proposals (owner_id);
create index if not exists vault_edit_proposals_status_idx on public.vault_edit_proposals (status);
create index if not exists vault_edit_proposals_note_path_idx on public.vault_edit_proposals (note_path);

create table if not exists public.vault_note_versions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users (id) on delete cascade,
  note_id      uuid,
  note_path    text not null,
  version      integer,
  content_hash text not null,
  backup_path  text,
  edit_source  text not null default 'local_llm',
  proposal_id  uuid,
  created_at   timestamptz not null default now()
);
create index if not exists vault_note_versions_owner_id_idx on public.vault_note_versions (owner_id);
create index if not exists vault_note_versions_note_path_idx on public.vault_note_versions (note_path);

create table if not exists public.business_metrics (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  metric_name  text not null,
  metric_value numeric not null,
  metric_unit  text,
  period_start date,
  period_end   date,
  source       text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists business_metrics_owner_id_idx on public.business_metrics (owner_id);
create index if not exists business_metrics_name_period_idx on public.business_metrics (metric_name, period_start, period_end);

alter table public.llm_runs            enable row level security;
alter table public.vault_edit_proposals enable row level security;
alter table public.vault_note_versions enable row level security;
alter table public.business_metrics    enable row level security;

create policy "llm_runs_select_own" on public.llm_runs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "llm_runs_insert_own" on public.llm_runs
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "vault_edit_proposals_select_own" on public.vault_edit_proposals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "vault_edit_proposals_insert_own" on public.vault_edit_proposals
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "vault_edit_proposals_update_own" on public.vault_edit_proposals
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "vault_note_versions_select_own" on public.vault_note_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "vault_note_versions_insert_own" on public.vault_note_versions
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "business_metrics_select_own" on public.business_metrics
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "business_metrics_insert_own" on public.business_metrics
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "business_metrics_update_own" on public.business_metrics
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "business_metrics_delete_own" on public.business_metrics
  for delete to authenticated using (owner_id = (select auth.uid()));
