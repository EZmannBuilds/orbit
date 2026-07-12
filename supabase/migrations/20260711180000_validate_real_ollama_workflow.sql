-- Orbit :: record genuine Ollama validation metadata without storing prompts or note bodies

alter table public.llm_runs
  add column if not exists source_paths text[] not null default '{}',
  add column if not exists fallback_used boolean not null default false,
  add column if not exists error_metadata jsonb not null default '{}'::jsonb;

alter table public.vault_edit_proposals
  add column if not exists prompt_version text,
  add column if not exists source_paths text[] not null default '{}',
  add column if not exists generation_duration_ms integer,
  add column if not exists validation_result jsonb not null default '{}'::jsonb;

create index if not exists llm_runs_status_created_at_idx
  on public.llm_runs (status, created_at desc);

create index if not exists vault_edit_proposals_model_created_at_idx
  on public.vault_edit_proposals (model, created_at desc);
