import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OllamaProvider } from "../lib/local-llm/ollama.js";
import { buildManagedNote, createProposal, validateVaultWritePath, applyProposal, updateProposalStatus } from "../lib/local-llm/vault.js";

test("Ollama unavailable returns health failure instead of throwing", async () => {
  const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", timeoutMs: 50 });
  const health = await provider.health();
  assert.equal(health.ok, false);
  assert.equal(health.error, "ollama_unavailable");
});

test("vault path security accepts approved project paths", () => {
  assert.equal(validateVaultWritePath("07 Orbit App/Updates/Test.md"), "07 Orbit App/Updates/Test.md");
});

test("vault path security rejects traversal", () => {
  assert.throws(() => validateVaultWritePath("../Orbit vault/07 Orbit App/Updates/Test.md"), /traversal/i);
});

test("vault path security rejects personal folders", () => {
  assert.throws(() => validateVaultWritePath("06 Journal/Daily/Test.md"), /Forbidden/);
});

test("vault path security rejects hidden folders", () => {
  assert.throws(() => validateVaultWritePath(".obsidian/app.json"), /Hidden/);
});

test("create proposal does not write target note", () => {
  const vault = mkdtempSync(join(tmpdir(), "orbit-vault-"));
  process.env.ORBIT_PROPOSAL_DIR = mkdtempSync(join(tmpdir(), "orbit-proposals-"));
  const content = buildManagedNote({ title: "Proposal Test", type: "app_update", body: "# Proposal Test\n" });
  const proposal = createProposal({
    operation: "create",
    path: "07 Orbit App/Updates/Proposal Test.md",
    reason: "test",
    content,
    vaultPath: vault,
  });
  assert.equal(proposal.validation.ok, true);
  assert.throws(() => readFileSync(join(vault, "07 Orbit App/Updates/Proposal Test.md"), "utf8"));
});

test("apply proposal writes note and creates backup log", () => {
  const vault = mkdtempSync(join(tmpdir(), "orbit-vault-"));
  process.env.ORBIT_PROPOSAL_DIR = mkdtempSync(join(tmpdir(), "orbit-proposals-"));
  const content = buildManagedNote({ title: "Apply Test", type: "app_update", body: "# Apply Test\n" });
  const proposal = createProposal({
    operation: "create",
    path: "07 Orbit App/Updates/Apply Test.md",
    reason: "test",
    content,
    vaultPath: vault,
  });
  updateProposalStatus(proposal.id, "approved");
  const result = applyProposal(proposal.id, { vaultPath: vault });
  assert.equal(result.proposal.status, "applied");
  assert.match(readFileSync(join(vault, "07 Orbit App/Updates/Apply Test.md"), "utf8"), /# Apply Test/);
  assert.match(readFileSync(join(vault, "System/Logs/local-llm-vault-edits.jsonl"), "utf8"), /"status":"applied"/);
});
