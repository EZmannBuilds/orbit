import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localLlmConfig, REPO_ROOT } from "./config.js";
import { createLocalLLMProvider } from "./provider.js";
import { buildManagedNote, collectProjectNotes, createProposal } from "./vault.js";
import { recordLlmRun, recordVaultProposal } from "./supabase.js";
import { sha256 } from "./vault.js";

export function localLlmOutputSchemaExample() {
  return {
    answer: "Human-readable response",
    sources: [{ path: "07 Orbit App/Product/Orbit Axis Product Definition.md", title: "Orbit Axis Product Definition" }],
    proposed_vault_changes: [],
    warnings: [],
    confidence: 0.8,
  };
}

export async function generateProjectAnswer({ prompt, query = "", propose = null } = {}) {
  const config = localLlmConfig();
  const provider = createLocalLLMProvider(config);
  const sources = collectProjectNotes({ vaultPath: config.vaultPath, query: query || prompt || "Orbit Axis", limit: 6 });
  const system = readFileSync(join(REPO_ROOT, "prompts", "local-llm", "orbit-project-assistant.md"), "utf8");
  const userPrompt = [
    `Prompt version: ${config.promptVersion}`,
    "Use only this supplied project context:",
    JSON.stringify(sources.map(({ path, title, type, headings, excerpt }) => ({ path, title, type, headings, excerpt })), null, 2),
    "",
    "User request:",
    prompt || "Summarize the current Orbit project context.",
    "",
    "Return only valid JSON matching this shape:",
    JSON.stringify(localLlmOutputSchemaExample(), null, 2),
  ].join("\n");
  const started = Date.now();
  const result = await provider.generate({ system, prompt: userPrompt, format: "json" });
  let parsed = null;
  const warnings = [];
  if (result.ok) {
    try {
      parsed = JSON.parse(result.text);
    } catch {
      warnings.push("Local model returned invalid JSON; deterministic fallback was used.");
    }
  } else {
    warnings.push(result.message || result.status || "Local model unavailable; deterministic fallback was used.");
  }
  if (!parsed) parsed = deterministicAnswer(prompt, sources, warnings);

  let proposal = null;
  if (propose) {
    const noteContent = propose.content || buildManagedNote({
      title: propose.title,
      type: propose.type || "app_update",
      tags: propose.tags || ["orbit", "local-llm"],
      body: proposedBodyFromAnswer(propose.title, parsed, sources),
    });
    proposal = createProposal({
      operation: propose.operation || "create",
      path: propose.path,
      reason: propose.reason || prompt,
      content: noteContent,
      appendContent: propose.appendContent,
      model: result.model || "deterministic-fallback",
      sources: sources.map(({ path, title }) => ({ path, title })),
      vaultPath: config.vaultPath,
    });
    await recordVaultProposal(proposal);
    parsed.proposed_vault_changes = [{
      operation: proposal.operation,
      path: proposal.path,
      reason: proposal.reason,
      proposal_id: proposal.id,
      validation: proposal.validation,
    }];
  }

  await recordLlmRun({
    provider: "ollama",
    model: result.model || null,
    task_type: propose ? "vault_proposal" : "project_answer",
    prompt_hash: sha256(prompt || ""),
    context_note_ids: sources.map((source) => source.id).filter(Boolean),
    status: result.ok ? "ok" : "fallback",
    duration_ms: result.duration_ms || Date.now() - started,
    input_token_estimate: Math.ceil(userPrompt.length / 4),
    output_token_estimate: Math.ceil(JSON.stringify(parsed).length / 4),
    error_code: result.ok ? null : result.status,
    prompt_version: config.promptVersion,
  });

  return {
    ok: true,
    provider: "ollama",
    model: result.model || null,
    used_fallback: !result.ok || warnings.length > 0,
    response: parsed,
    sources,
    proposal,
    raw_status: result.status,
  };
}

function deterministicAnswer(prompt, sources, warnings) {
  return {
    answer: [
      "Local Ollama generation was unavailable or invalid, so Orbit used deterministic project retrieval.",
      `Retrieved ${sources.length} approved project source(s).`,
      prompt ? `Request: ${prompt}` : "Request: summarize Orbit project context.",
    ].join(" "),
    sources: sources.map(({ path, title }) => ({ path, title })),
    proposed_vault_changes: [],
    warnings,
    confidence: sources.length ? 0.55 : 0.2,
  };
}

function proposedBodyFromAnswer(title, parsed, sources) {
  return [
    `# ${title}`,
    "",
    "## Purpose",
    parsed.answer || "Document the local LLM and vault intelligence workflow.",
    "",
    "## Architecture",
    "Orbit keeps deterministic chart calculations in code, live application data in Supabase, and narrative project knowledge in the Obsidian vault.",
    "",
    "## Confirmed Implementation",
    ...sources.map((source) => `- Retrieved source: ${source.path}`),
    "",
    "## Remaining Work",
    "- Review this proposal.",
    "- Apply it only through the approved proposal workflow.",
    "",
    "## Test Results",
    "- Proposal validation ran before this note was written.",
    "",
    "## Risks",
    "- Local model output must remain grounded in supplied context.",
    "",
    "## Next Recommended Step",
    "- Approve and apply this proposal if the diff matches the intended documentation update.",
  ].join("\n");
}
