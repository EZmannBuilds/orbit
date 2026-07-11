#!/usr/bin/env node
import { createLocalLLMProvider } from "../lib/local-llm/provider.js";
import { generateProjectAnswer } from "../lib/local-llm/assistant.js";
import { collectProjectNotes, listProposals, readProposal, updateProposalStatus, applyProposal } from "../lib/local-llm/vault.js";
import { recordVaultVersion } from "../lib/local-llm/supabase.js";

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
  node scripts/local-llm.js propose --type app_update --title "Local LLM Integration"
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
  const prompt = flag("--prompt") || `Create a grounded Orbit project note titled ${title}.`;
  const result = await generateProjectAnswer({
    prompt,
    query: title,
    propose: { operation: "create", path, title, type, reason: prompt, tags: ["orbit", "local-llm"] },
  });
  printResult(result);
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
  const applied = applyProposal(id);
  const supabase = await recordVaultVersion(applied);
  console.log(JSON.stringify({ ...applied, supabase }, null, 2));
}

async function test() {
  const health = await createLocalLLMProvider().health();
  const notes = collectProjectNotes({ query: "Orbit Axis roadmap", limit: 1 });
  const result = await generateProjectAnswer({
    prompt: "Summarize the Orbit Axis roadmap and create a draft local LLM integration test proposal.",
    query: "Orbit Axis roadmap",
    propose: {
      operation: "create",
      path: "07 Orbit App/Updates/Local LLM Integration Test.md",
      title: "Local LLM Integration Test",
      type: "app_update",
      reason: "First automated local LLM proposal test",
      tags: ["orbit", "local-llm", "test"],
    },
  });
  console.log(JSON.stringify({
    ollama: health,
    retrieved_note: notes[0] || null,
    proposal_id: result.proposal?.id || null,
    proposal_status: result.proposal?.status || null,
    proposal_validation: result.proposal?.validation || null,
    wrote_vault_file: false,
    used_fallback: result.used_fallback,
  }, null, 2));
}

function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function printResult(result) {
  console.log(JSON.stringify({
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
