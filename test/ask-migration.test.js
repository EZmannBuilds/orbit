// Orbit Axis :: Ask Orbit migration + route-guard validation (Update 4.0).
// Static validation of the conversation-history migration (RLS, ownership,
// grants, reversibility) plus a route-level auth-required check. This is the
// "migration validation" the update calls for; it never touches a live database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { handleAskRoute } from "../lib/ask-orbit/api.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(ROOT, "supabase", "migrations", "20260717120000_ask_orbit_conversations.sql"), "utf8");

test("migration creates both owner-scoped tables", () => {
  assert.match(sql, /create table if not exists public\.ask_conversations/);
  assert.match(sql, /create table if not exists public\.ask_messages/);
  // owner_id → auth.users on both, cascading delete.
  assert.equal((sql.match(/owner_id\s+uuid not null references auth\.users \(id\) on delete cascade/g) || []).length, 2);
});

test("migration enables RLS and defines all four owner policies per table", () => {
  assert.equal((sql.match(/enable row level security/g) || []).length, 2, "RLS enabled on both tables");
  for (const table of ["ask_conversations", "ask_messages"]) {
    for (const action of ["select", "insert", "update", "delete"]) {
      assert.match(sql, new RegExp(`create policy "${table}_${action}_own"`), `${table} ${action} policy present`);
    }
  }
  // Ownership predicate uses auth.uid() and never trusts a client value.
  // 5 predicates per table (select+insert+delete = 1 each, update = using+check),
  // across both tables = 10.
  assert.ok((sql.match(/owner_id = \(select auth\.uid\(\)\)/g) || []).length >= 10, "every policy scopes to auth.uid()");
});

test("migration grants only to authenticated (no anon writes) and constrains status", () => {
  assert.match(sql, /grant select, insert, update, delete\s+on public\.ask_conversations, public\.ask_messages\s+to authenticated/);
  assert.ok(!/to anon/.test(sql), "no grants to anon");
  assert.match(sql, /status in \('ok', 'failed', 'partial', 'cancelled'\)/, "message status is constrained");
});

test("migration stores reproducibility columns (evidence, engine version, chart id)", () => {
  for (const col of ["evidence", "question_type", "engine_version", "active_chart_id", "birth_time_reliability", "detail_mode"]) {
    assert.match(sql, new RegExp(`\\b${col}\\b`), `${col} column present for reproducibility`);
  }
});

test("migration documents a manual rollback and is not auto-applied", () => {
  assert.match(sql, /Rollback/i);
  assert.match(sql, /drop table if exists public\.ask_messages/);
  assert.match(sql, /drop table if exists public\.ask_conversations/);
  assert.match(sql, /NOT APPLIED TO PRODUCTION/i);
});

// ── Route-level auth guard (no live Supabase needed) ─────────────────────────
test("Ask routes require authentication (401 when no owner/auth)", async () => {
  const params = new URLSearchParams();
  for (const [method, route] of [["GET", "/api/ask/suggestions"], ["GET", "/api/ask/conversations"], ["POST", "/api/ask"]]) {
    const res = await handleAskRoute(method, route, params, { question: "hi" }, null);
    assert.equal(res.status, 401, `${method} ${route} requires auth`);
    assert.equal(res.body.ok, false);
  }
});

test("handleAskRoute ignores routes it does not own", async () => {
  const res = await handleAskRoute("GET", "/api/fortune/today", new URLSearchParams(), {}, null);
  assert.equal(res, null, "non-ask routes pass through");
});
