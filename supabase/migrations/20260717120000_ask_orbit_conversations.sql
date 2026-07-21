-- Orbit Axis :: Ask Orbit conversation history (Update 4.0)
--
-- Owner-scoped conversation + message storage for the Ask Orbit experience.
-- RLS scoped to the authenticated owner, consistent with existing user-owned
-- tables (daily_fortunes, birth_profiles). Each message stores the astrology
-- evidence, question type, and engine version behind an answer so a past reading
-- stays reproducible ("Why Orbit Said This") after later engine updates.
--
-- NOT APPLIED TO PRODUCTION by this change. Apply locally / in a preview branch
-- with the Supabase CLI (`supabase db reset` or `supabase migration up`). A
-- rollback block is provided at the bottom.

-- ── ask_conversations ────────────────────────────────────────────────────────
create table if not exists public.ask_conversations (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  birth_profile_id uuid references public.birth_profiles (id) on delete set null,
  title            text not null default 'New conversation',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ask_conversations_owner_idx
  on public.ask_conversations (owner_id);
create index if not exists ask_conversations_owner_updated_idx
  on public.ask_conversations (owner_id, updated_at desc);

-- Dropped first because Postgres has no `create trigger if not exists`. Without
-- this, a retry after a partial failure aborts here instead of completing.
drop trigger if exists ask_conversations_set_updated_at on public.ask_conversations;
create trigger ask_conversations_set_updated_at
  before update on public.ask_conversations
  for each row execute function public.set_updated_at();

-- ── ask_messages ─────────────────────────────────────────────────────────────
create table if not exists public.ask_messages (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users (id) on delete cascade,
  conversation_id        uuid not null references public.ask_conversations (id) on delete cascade,
  question               text not null,
  answer                 text,
  answer_parts           jsonb not null default '{}'::jsonb,
  evidence               jsonb not null default '[]'::jsonb,
  themes                 jsonb not null default '[]'::jsonb,
  question_type          jsonb not null default '[]'::jsonb,
  birth_time_reliability text,
  detail_mode            text,
  active_chart_id        uuid,
  provider               text,
  engine_version         text not null,
  status                 text not null default 'ok',
  created_at             timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ask_messages_status_chk') then
    alter table public.ask_messages
      add constraint ask_messages_status_chk
      check (status in ('ok', 'failed', 'partial', 'cancelled'));
  end if;
end $$;

create index if not exists ask_messages_owner_idx
  on public.ask_messages (owner_id);
create index if not exists ask_messages_conversation_idx
  on public.ask_messages (conversation_id, created_at asc);

-- Every statement below is written to be re-runnable. A migration that cannot
-- be retried turns a transient failure into a manual repair job.

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.ask_conversations enable row level security;
alter table public.ask_messages enable row level security;

drop policy if exists "ask_conversations_select_own" on public.ask_conversations;
create policy "ask_conversations_select_own" on public.ask_conversations
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "ask_conversations_insert_own" on public.ask_conversations;
create policy "ask_conversations_insert_own" on public.ask_conversations
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "ask_conversations_update_own" on public.ask_conversations;
create policy "ask_conversations_update_own" on public.ask_conversations
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "ask_conversations_delete_own" on public.ask_conversations;
create policy "ask_conversations_delete_own" on public.ask_conversations
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "ask_messages_select_own" on public.ask_messages;
create policy "ask_messages_select_own" on public.ask_messages
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "ask_messages_insert_own" on public.ask_messages;
create policy "ask_messages_insert_own" on public.ask_messages
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "ask_messages_update_own" on public.ask_messages;
create policy "ask_messages_update_own" on public.ask_messages
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "ask_messages_delete_own" on public.ask_messages;
create policy "ask_messages_delete_own" on public.ask_messages
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ── Grants (RLS still enforces per-row ownership) ────────────────────────────
grant select, insert, update, delete
  on public.ask_conversations, public.ask_messages
  to authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- To reverse this migration locally:
--   drop table if exists public.ask_messages;
--   drop table if exists public.ask_conversations;
-- (Policies, indexes, and triggers are dropped with the tables.)
