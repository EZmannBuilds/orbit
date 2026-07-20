# Hosted Supabase migration checklist

**Nothing in this document has been executed.** Update 4.0.3 did not contact the
hosted Supabase project, did not run `supabase db push`, `db reset`, or
`migration repair`, and did not create remote users or seed remote data.

This is the plan for the owner to follow later, with explicit approval, when the
time comes.

---

## 1. Current state

| | Status | How it was determined |
|---|---|---|
| Local migrations | 16 files in `supabase/migrations/` | Directory listing |
| Local Ask Orbit tables | **Applied.** `ask_conversations` exists and correctly denies `anon` | Read-only REST probe against local Supabase on `55321`, which returned `42501 permission denied` (a missing table returns `42P01`) |
| Hosted migrations | **UNVERIFIED — never contacted** | Deliberate. Verifying would require connecting to production. |
| Hosted Ask Orbit tables | **Believed missing** | Update 4.0.2 recorded that the Ask Orbit migration was applied locally only |

`npm run deploy:check` reports the Ask Orbit migration as a BLOCKER for exactly
this reason, and will keep doing so until the owner confirms otherwise.

**Until the migration is applied, Ask Orbit answers will generate correctly but
will not save.** Orbit says so plainly in the response (`persisted: false`, and
the user sees *"This answer couldn't be saved to your history."*). It does not
fake a save.

---

## 2. The pending migration

`supabase/migrations/20260717120000_ask_orbit_conversations.sql`

### Tables

**`public.ask_conversations`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key, `gen_random_uuid()` |
| `owner_id` | `uuid` | not null → `auth.users(id)` on delete cascade |
| `birth_profile_id` | `uuid` | → `public.birth_profiles(id)` on delete set null |
| `title` | `text` | not null, default `'New conversation'` |
| `created_at` | `timestamptz` | not null, `now()` |
| `updated_at` | `timestamptz` | not null, `now()`, maintained by trigger |

**`public.ask_messages`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key |
| `owner_id` | `uuid` | not null → `auth.users(id)` cascade |
| `conversation_id` | `uuid` | not null → `ask_conversations(id)` cascade |
| `question` | `text` | not null |
| `answer` | `text` | nullable — a failed turn keeps the question |
| `answer_parts`, `evidence`, `themes`, `question_type` | `jsonb` | not null, defaults |
| `birth_time_reliability`, `detail_mode`, `provider` | `text` | |
| `active_chart_id` | `uuid` | |
| `engine_version` | `text` | not null — keeps a past answer reproducible |
| `status` | `text` | not null, default `'ok'` |
| `created_at` | `timestamptz` | not null, `now()` |

### Indexes

- `ask_conversations_owner_idx (owner_id)`
- `ask_conversations_owner_updated_idx (owner_id, updated_at desc)`
- `ask_messages_owner_idx (owner_id)`
- `ask_messages_conversation_idx (conversation_id, created_at asc)`

### Constraints

- `ask_messages_status_chk` — `status in ('ok','failed','partial','cancelled')`

### Trigger

- `ask_conversations_set_updated_at` → `public.set_updated_at()`
  **Prerequisite:** this function must already exist in the hosted project. It
  was introduced by an earlier migration. Verify before applying.

### RLS

Both tables: `enable row level security`, with four policies each
(`select` / `insert` / `update` / `delete`) scoped to
`owner_id = (select auth.uid())` for the `authenticated` role.

### Grants

`select, insert, update, delete` on both tables to `authenticated` only.
**Not** to `anon`. Verified locally: an `anon` read returns `42501`.

---

## 3. Application procedure — owner only

> Requires explicit approval. Do not run any of this on the strength of this
> document alone.

**Step 0 — approval checkpoint.** Confirm in writing that the hosted project
should receive this migration now. Ask Orbit is the only feature affected.

**Step 1 — back up.** Supabase dashboard → Database → Backups. Take or confirm a
recent backup. This migration only creates objects, but a backup is the
difference between an inconvenience and an incident.

**Step 2 — verify the prerequisite.**

```sql
select 1 from pg_proc where proname = 'set_updated_at';
```

If this returns nothing, stop. The trigger will fail.

**Step 3 — confirm the tables are genuinely absent.**

```sql
select tablename from pg_tables
where schemaname = 'public' and tablename in ('ask_conversations', 'ask_messages');
```

Expect zero rows. If they already exist, stop and re-plan — the migration is
idempotent (`create table if not exists`) but the policies are not.

**Step 4 — review what will run.**

```bash
supabase migration list --linked
```

Read the diff. Confirm only the Ask Orbit migration is pending.

**Step 5 — apply.**

```bash
supabase db push --linked
```

Prefer the Supabase dashboard SQL editor if you want to apply exactly one file
and nothing else.

---

## 4. Post-migration verification

```sql
-- tables
select tablename from pg_tables
where schemaname = 'public' and tablename like 'ask%';
-- expect: ask_conversations, ask_messages

-- RLS is on
select relname, relrowsecurity from pg_class
where relname in ('ask_conversations', 'ask_messages');
-- expect: both true

-- eight policies
select tablename, policyname from pg_policies
where tablename in ('ask_conversations', 'ask_messages') order by 1, 2;

-- indexes
select indexname from pg_indexes
where tablename in ('ask_conversations', 'ask_messages') order by 1;

-- anon must NOT be able to read
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'ask_conversations';
-- expect: authenticated only
```

Then, in the app:

1. Sign in on the deployment.
2. Ask a question. Confirm the answer appears **and** `persisted` is not false
   (no "couldn't be saved" note).
3. Reload. Confirm the conversation is in history.
4. Sign in as a *different* user. Confirm the first user's conversation is not
   visible — this is the RLS ownership check.
5. Re-run `npm run deploy:check` and confirm the migration blocker is resolved.

---

## 5. Rollback

The migration file carries its own rollback block:

```sql
drop table if exists public.ask_messages;
drop table if exists public.ask_conversations;
```

Policies, indexes, and triggers drop with the tables. **This destroys all Ask
Orbit conversation history.** Only acceptable immediately after a failed apply,
before any real user data exists.

---

## 6. Authentication redirect configuration

Independent of the migration, and required before sign-in works on any
deployment. See [auth-redirects.md](auth-redirects.md).
