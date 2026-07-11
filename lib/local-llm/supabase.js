import { supabaseConfig } from "./config.js";

export async function supabaseInsert(table, row) {
  const { url, anonKey, accessToken } = supabaseConfig();
  if (!url || !anonKey || !accessToken) {
    return { ok: false, skipped: true, reason: "missing_supabase_user_token" };
  }
  if (Object.hasOwn(row, "owner_id") && !row.owner_id) {
    return { ok: false, skipped: true, reason: "missing_supabase_owner_id" };
  }
  const response = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) return { ok: false, status: response.status, error: await response.text() };
  return { ok: true, data: await response.json() };
}

export async function recordLlmRun(run) {
  const { ownerId } = supabaseConfig();
  return supabaseInsert("llm_runs", { owner_id: ownerId || null, ...run });
}

export async function recordVaultProposal(proposal, ownerId = null) {
  const config = supabaseConfig();
  return supabaseInsert("vault_edit_proposals", {
    owner_id: ownerId || config.ownerId || null,
    operation: proposal.operation,
    note_path: proposal.path,
    reason: proposal.reason,
    base_hash: proposal.base_hash,
    proposed_content_hash: proposal.proposed_content_hash,
    diff_text: proposal.diff_text,
    status: proposal.status,
    model: proposal.model,
    validation_errors: proposal.validation?.errors || [],
  });
}

export async function recordVaultVersion({ proposal, logRecord, ownerId = null }) {
  const config = supabaseConfig();
  return supabaseInsert("vault_note_versions", {
    owner_id: ownerId || config.ownerId || null,
    note_path: proposal.path,
    version: proposal.proposed_version,
    content_hash: logRecord.after_hash,
    backup_path: logRecord.backup_path,
    edit_source: "local_llm",
    proposal_id: proposal.id,
  });
}
