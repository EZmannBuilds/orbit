import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OllamaProvider, selectModel } from "../lib/local-llm/ollama.js";
import { buildActiveChartContext } from "../lib/local-llm/context.js";
import { buildManagedNote, createProposal, validateManagedNoteContent, validateVaultWritePath, applyProposal, updateProposalStatus } from "../lib/local-llm/vault.js";
import { parseFrontmatter, formatFrontmatter } from "../lib/local-llm/markdown.js";
import { parseStructuredOutput, validateStructuredOutput } from "../lib/local-llm/structured-output.js";

test("Ollama unavailable returns health failure instead of throwing", async () => {
  const provider = new OllamaProvider({ baseUrl: "http://127.0.0.1:9", timeoutMs: 50 });
  const health = await provider.health();
  assert.equal(health.ok, false);
  assert.equal(health.error, "ollama_unavailable");
});

test("configured Ollama model must be installed", () => {
  assert.equal(selectModel([{ name: "other:latest" }], "qwen3:14b"), null);
});

test("Ask context includes active chart, current sky, and detail level only", () => {
  const context = buildActiveChartContext({
    activeChart: {
      nickname: "Active Validation",
      summary: { sun: "Aries", moon: "Cancer", rising: "Libra" },
    },
    currentSky: "Sun in Cancer, waxing moon, Mercury direct.",
    detailLevel: "Simple",
  });
  assert.match(context, /Active chart: Active Validation/);
  assert.match(context, /Sun Aries, Moon Cancer, Rising Libra/);
  assert.match(context, /Current sky: Sun in Cancer/);
  assert.match(context, /Astrology detail level: Simple/);
  assert.doesNotMatch(context, /Other Saved Chart/);
});

test("vault path security accepts approved project paths", () => {
  assert.equal(validateVaultWritePath("07 Orbit App/Updates/Test.md"), "07 Orbit App/Updates/Test.md");
});

test("vault path security rejects traversal", () => {
  assert.throws(() => validateVaultWritePath("../Orbit vault/07 Orbit App/Updates/Test.md"), /traversal/i);
});

test("vault path security rejects absolute paths", () => {
  assert.throws(() => validateVaultWritePath("/Users/example/Orbit vault/07 Orbit App/Updates/Test.md"), /Absolute/);
});

test("vault path security rejects personal folders", () => {
  assert.throws(() => validateVaultWritePath("06 Journal/Daily/Test.md"), /Forbidden/);
});

test("vault path security rejects hidden folders", () => {
  assert.throws(() => validateVaultWritePath(".obsidian/app.json"), /Hidden/);
});

test("vault path security rejects unsupported delete operations", () => {
  const vault = mkdtempSync(join(tmpdir(), "orbit-vault-"));
  assert.throws(() => createProposal({ operation: "delete", path: "07 Orbit App/Updates/Test.md", vaultPath: vault }), /Unsupported/);
});

test("structured JSON safely extracts one Markdown fence", () => {
  const parsed = parseStructuredOutput("Response:\n```json\n{\"answer\":\"ok\",\"sources\":[],\"proposed_vault_changes\":[],\"warnings\":[],\"confidence\":0.8}\n```\nEnd.");
  assert.equal(parsed.extracted, true);
  assert.equal(parsed.value.answer, "ok");
});

test("structured output rejects missing required fields", () => {
  const validation = validateStructuredOutput({ answer: "incomplete" });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /missing required field/);
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

test("invalid note output creates no proposal or vault note", () => {
  const vault = mkdtempSync(join(tmpdir(), "orbit-vault-"));
  const proposals = mkdtempSync(join(tmpdir(), "orbit-proposals-"));
  process.env.ORBIT_PROPOSAL_DIR = proposals;
  assert.throws(() => createProposal({
    operation: "create",
    path: "07 Orbit App/Updates/Missing Frontmatter.md",
    content: "# Missing Frontmatter\n",
    vaultPath: vault,
  }), /failed validation/i);
  assert.equal(readdirSync(proposals).length, 0);
  assert.equal(existsSync(join(vault, "07 Orbit App/Updates/Missing Frontmatter.md")), false);
});

test("managed note validation rejects unknown type and oversized content", () => {
  const unknown = buildManagedNote({ title: "Unknown", type: "secret_type", body: "# Unknown\n" });
  assert.match(validateManagedNoteContent(unknown).errors.join(" "), /unsupported project note type/);
  const oversized = buildManagedNote({ title: "Large", body: `# Large\n${"x".repeat(200)}` });
  assert.match(validateManagedNoteContent(oversized, { maxChars: 100 }).errors.join(" "), /exceeds/);
});

test("managed note update rejects removed stable id and version decrement", () => {
  const current = buildManagedNote({ title: "Stable", body: "# Stable\n" });
  const existing = parseFrontmatter(current);
  const changed = {
    ...existing.frontmatter,
    id: "11111111-1111-4111-8111-111111111111",
    updated_at: new Date(Date.now() + 1000).toISOString(),
    version: 1,
  };
  const proposed = formatFrontmatter(changed) + existing.body;
  const validation = validateManagedNoteContent(proposed, { existing });
  assert.match(validation.errors.join(" "), /stable id changed/);
  assert.match(validation.errors.join(" "), /version must increment/);
});

test("proposal validation rejects .obsidian and journal targets without writes", () => {
  const vault = mkdtempSync(join(tmpdir(), "orbit-vault-"));
  const content = buildManagedNote({ title: "Blocked", body: "# Blocked\n" });
  for (const path of [".obsidian/Blocked.md", "06 Journal/Blocked.md", "../Blocked.md"]) {
    assert.throws(() => createProposal({ operation: "create", path, content, vaultPath: vault }));
  }
  assert.equal(readdirSync(vault).length, 0);
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
