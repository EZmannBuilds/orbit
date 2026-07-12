-- Orbit :: 0003 tarot, journal/memory, and vault sync

-- ── tarot_cards :: PUBLIC reference deck (not user-owned) ─────────────────────
create table if not exists public.tarot_cards (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  arcana          text not null,          -- 'major' | 'minor'
  suit            text,                    -- wands | cups | swords | pentacles | null
  number          integer,
  upright_meaning text,
  reversed_meaning text,
  symbolism       text
);
create index if not exists tarot_cards_arcana_idx on public.tarot_cards (arcana);

-- ── tarot_readings :: user-owned ─────────────────────────────────────────────
create table if not exists public.tarot_readings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  question         text,
  spread_type      text,
  reading_data     jsonb not null default '{}'::jsonb,
  source_note_path text,
  created_at       timestamptz not null default now()
);
create index if not exists tarot_readings_owner_id_idx on public.tarot_readings (owner_id);

-- ── journal_entries :: daily / dream / event / reflection ────────────────────
create table if not exists public.journal_entries (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  entry_type       text not null default 'journal_entry',  -- journal_entry | dream | event
  title            text,
  content          text,
  entry_at         timestamptz,
  source_note_path text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists journal_entries_owner_id_idx on public.journal_entries (owner_id);
create index if not exists journal_entries_owner_entry_at_idx on public.journal_entries (owner_id, entry_at);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- ── journal_links :: connect a journal entry to any other entity ─────────────
create table if not exists public.journal_links (
  id               uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  linked_type      text not null,         -- transit | tarot_reading | person | ...
  linked_id        uuid,
  relationship     text
);
create index if not exists journal_links_entry_idx on public.journal_links (journal_entry_id);

-- ── pattern_insights :: derived patterns over a user's data ──────────────────
create table if not exists public.pattern_insights (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  pattern_type text not null,
  summary      text,
  evidence     jsonb not null default '{}'::jsonb,
  confidence   numeric(4,3),              -- 0.000 .. 1.000
  status       text not null default 'proposed',  -- proposed | confirmed | dismissed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pattern_insights_owner_id_idx on public.pattern_insights (owner_id);

create trigger pattern_insights_set_updated_at
  before update on public.pattern_insights
  for each row execute function public.set_updated_at();

-- ── vault_notes :: the vault<->supabase sync index ───────────────────────────
create table if not exists public.vault_notes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  note_id        uuid not null,           -- the stable id from the note's frontmatter
  note_path      text not null,
  title          text,
  note_type      text,
  content_hash   text,
  frontmatter    jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  sync_status    text not null default 'pending', -- pending | synced | conflict | error
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, note_id)
);
create index if not exists vault_notes_owner_id_idx on public.vault_notes (owner_id);
create index if not exists vault_notes_note_type_idx on public.vault_notes (note_type);

create trigger vault_notes_set_updated_at
  before update on public.vault_notes
  for each row execute function public.set_updated_at();

-- ── sync_events :: append-only log of every sync attempt ─────────────────────
create table if not exists public.sync_events (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  direction     text not null,            -- vault_to_db | db_to_vault
  entity_type   text,
  entity_id     uuid,
  note_path     text,
  status        text not null,            -- ok | skipped | conflict | error
  error_message text,
  created_at    timestamptz not null default now()
);
create index if not exists sync_events_owner_id_idx on public.sync_events (owner_id);
create index if not exists sync_events_created_at_idx on public.sync_events (created_at);
