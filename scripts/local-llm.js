#!/usr/bin/env node
import { createLocalLLMProvider } from "../lib/local-llm/provider.js";
import { generateProjectAnswer } from "../lib/local-llm/assistant.js";
import { collectProjectNotes, listProposals, readProposal, updateProposalStatus, applyProposal } from "../lib/local-llm/vault.js";
import { recordVaultProposalStatus, recordVaultVersion } from "../lib/local-llm/supabase.js";

const args = process.argv.slice(2);
const command = args[0];

const commands = {
  status,
  models,
  test,
  search,
  propose,
  proposals,
  apply,
};

if (!commands[command]) {
  console.log(`Orbit local LLM

Usage:
  node scripts/local-llm.js status
  node scripts/local-llm.js models
  node scripts/local-llm.js test
  node scripts/local-llm.js search "Orbit Axis roadmap"
  node scripts/local-llm.js propose --operation create --type app_update --title "Local LLM Integration"
  node scripts/local-llm.js proposals
  node scripts/local-llm.js apply <proposal-id>
`);
  process.exit(command ? 1 : 0);
}

commands[command]().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});

async function status() {
  console.log(JSON.stringify(await createLocalLLMProvider().health(), null, 2));
}

async function models() {
  console.log(JSON.stringify(await createLocalLLMProvider().listModels(), null, 2));
}

async function search() {
  const query = args.slice(1).join(" ");
  const notes = collectProjectNotes({ query, limit: 12 });
  console.log(JSON.stringify(notes.map(({ id, path, title, type, score }) => ({ id, path, title, type, score })), null, 2));
}

async function propose() {
  const title = flag("--title") || "Local LLM Integration";
  const type = flag("--type") || "app_update";
  const path = flag("--path") || `07 Orbit App/Updates/${title}.md`;
  const operation = flag("--operation") || "create";
  const prompt = flag("--prompt") || `Create a grounded Orbit project note titled ${title}.`;
  const result = await generateProjectAnswer({
    prompt,
    query: flag("--query") || title,
    retrievalQueries: ["Orbit Axis roadmap", "Local LLM Architecture"],
    propose: { operation, path, title, type, reason: prompt, tags: ["orbit", "local-llm", "ollama", "validation"] },
  });
  printResult(result);
  if (!result.ok || !result.proposal) throw new Error(`Proposal generation failed: ${(result.validation?.errors || [result.raw_status]).join("; ")}`);
}

async function proposals() {
  console.log(JSON.stringify(listProposals().map(({ id, operation, path, status, created_at, validation }) => ({
    id, operation, path, status, created_at, validation,
  })), null, 2));
}

async function apply() {
  const id = args[1];
  if (!id) throw new Error("Pass a proposal id.");
  const proposal = readProposal(id);
  if (!proposal) throw new Error("Proposal not found.");
  if (proposal.status === "pending_review") updateProposalStatus(id, "approved");
  let applied;
  try {
    applied = applyProposal(id);
  } catch (error) {
    const stale = readProposal(id);
    if (stale?.status === "stale") await recordVaultProposalStatus(stale);
    throw error;
  }
  const [versionRecord, proposalRecord] = await Promise.all([
    recordVaultVersion(applied),
    recordVaultProposalStatus(applied.proposal),
  ]);
  console.log(JSON.stringify({ ...applied, supabase: { version: versionRecord, proposal: proposalRecord } }, null, 2));
}

async function test() {
  const health = await createLocalLLMProvider().health();
  const result = await generateProjectAnswer({
    prompt: "Summarize the current Orbit Axis roadmap using only the supplied vault sources. Do not propose any vault changes. Return valid structured JSON.",
    query: "Orbit Axis roadmap",
    retrievalQueries: ["Orbit Axis roadmap", "Local LLM Architecture"],
    allowFallback: false,
  });
  console.log(JSON.stringify({
    ollama: health,
    generation: result.generation_label,
    sources: result.sources.map(({ path, title }) => ({ path, title })),
    validation: result.validation,
    used_fallback: result.used_fallback,
    duration_ms: result.duration_ms,
    response: result.response,
    supabase_run: result.supabase_run,
  }, null, 2));
  if (!result.ok || result.used_fallback) throw new Error("Genuine Ollama validation failed; deterministic fallback does not count as success.");
}

function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function printResult(result) {
  console.log(JSON.stringify({
    ok: result.ok,
    generation: result.generation_label,
    model: result.model,
    used_fallback: result.used_fallback,
    duration_ms: result.duration_ms,
    validation: result.validation,
    response: result.response,
    sources: result.sources.map(({ path, title }) => ({ path, title })),
    proposal: result.proposal ? {
      id: result.proposal.id,
      path: result.proposal.path,
      status: result.proposal.status,
      validation: result.proposal.validation,
      diff_text: result.proposal.diff_text,
    } : null,
  }, null, 2));
}
