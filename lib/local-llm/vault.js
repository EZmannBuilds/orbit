import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { localLlmConfig } from "./config.js";
import { extractHeadings, formatFrontmatter, parseFrontmatter } from "./markdown.js";

export const APPROVED_WRITE_PREFIXES = [
  "07 Orbit App/Product/",
  "07 Orbit App/Features/",
  "07 Orbit App/UX/",
  "07 Orbit App/Technical/",
  "07 Orbit App/Roadmap/",
  "07 Orbit App/Decisions/",
  "07 Orbit App/Updates/",
  "07 Orbit App/Release Notes/",
  "10 Business/Strategy/",
  "10 Business/Research/",
  "10 Business/Market/",
  "10 Business/Pricing/",
  "10 Business/Revenue/",
  "10 Business/Operations/",
  "10 Business/Launch/",
  "10 Business/Reports/",
  "System/Logs/",
];

export const FORBIDDEN_PREFIXES = [
  "01 Identity/",
  "02 Astrology/",
  "03 Tarot/",
  "04 Symbols/",
  "05 People/",
  "06 Journal/",
  "Attachments/",
  "Templates/",
  ".obsidian/",
  "System/Schema/",
  "System/Migrations/",
  "System/Archive/",
];

export const RETRIEVAL_PREFIXES = [
  "07 Orbit App/",
  "08 Research/",
  "09 Integrations/",
  "10 Business/",
  "System/README.md",
  "System/Schema/",
  "System/Migrations/",
];

const PROJECT_TYPES = new Set([
  "product_definition", "product_feature", "app_update", "release_note", "roadmap",
  "implementation_plan", "technical_decision", "ux_decision", "research",
  "business_strategy", "market_research", "pricing_plan", "revenue_plan",
  "operations_plan", "launch_plan", "business_report", "retrospective",
  "project",
]);

export function ensureApprovedFolders(vaultPath = localLlmConfig().vaultPath) {
  for (const prefix of APPROVED_WRITE_PREFIXES) {
    mkdirSync(resolve(vaultPath, prefix), { recursive: true });
  }
}

export function normalizeVaultRelPath(relPath) {
  const raw = String(relPath || "").replaceAll("\\", "/");
  if (raw.startsWith("/") || raw.match(/^[A-Za-z]:\//)) throw new Error("Absolute paths are not allowed.");
  const cleaned = raw.replace(/^\.\//, "");
  if (!cleaned || cleaned.includes("\0")) throw new Error("Path is empty or invalid.");
  if (cleaned.split("/").includes("..")) throw new Error("Path traversal is not allowed.");
  if (cleaned.split("/").some((part) => part.startsWith(".") && part !== ".")) throw new Error("Hidden files and folders are not allowed.");
  if (!cleaned.endsWith(".md") && !cleaned.endsWith(".jsonl")) throw new Error("Only Markdown notes and approved JSONL logs are writable.");
  return cleaned;
}

export function validateVaultWritePath(relPath, { allowLog = false } = {}) {
  const normalized = normalizeVaultRelPath(relPath);
  if (normalized.startsWith(".obsidian/")) throw new Error(".obsidian is not writable.");
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
      throw new Error(`Forbidden vault folder: ${prefix}`);
    }
  }
  if (allowLog && normalized === "System/Logs/local-llm-vault-edits.jsonl") return normalized;
  if (normalized === "10 Business/README.md") return normalized;
  if (normalized.startsWith("Templates/")) throw new Error("Templates require an explicit template-edit operation.");
  if (!APPROVED_WRITE_PREFIXES.some((prefix) => normalized.startsWith(prefix) && prefix !== "System/Logs/")) {
    throw new Error("Path is outside approved local LLM write locations.");
  }
  return normalized;
}

export function resolveVaultPath(vaultPath, relPath) {
  const normalized = normalizeVaultRelPath(relPath);
  const absolute = resolve(vaultPath, normalized);
  const root = resolve(vaultPath);
  if (absolute !== root && !absolute.startsWith(root + sep)) throw new Error("Path escapes the vault.");
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) throw new Error("Symlink notes are not writable.");
  return { relPath: normalized, absolute };
}

export function collectProjectNotes({ vaultPath = localLlmConfig().vaultPath, query = "", type = "", folder = "", limit = 20, maxContextChars = 12000 } = {}) {
  const notes = [];
  if (!existsSync(vaultPath)) throw new Error(`Vault not found: ${vaultPath}`);
  walk(vaultPath, (file) => {
    if (!file.endsWith(".md")) return;
    const relPath = relative(vaultPath, file).replaceAll("\\", "/");
    if (!isRetrievable(relPath)) return;
    const raw = readFileSync(file, "utf8");
    if (/SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|ASTRO_API_KEY|password\s*=/i.test(raw)) return;
    const { frontmatter, body, parseError } = parseFrontmatter(raw);
    if (type && frontmatter.type !== type) return;
    if (folder && !relPath.startsWith(folder.replaceAll("\\", "/"))) return;
    const haystack = `${relPath} ${frontmatter.title || ""} ${(frontmatter.tags || []).join(" ")} ${body}`.toLowerCase();
    const score = scoreQuery(query, haystack, frontmatter, relPath);
    if (query && score === 0) return;
    notes.push({
      id: frontmatter.id || null,
      path: relPath,
      title: frontmatter.title || relPath.replace(/\.md$/, "").split("/").pop(),
      type: frontmatter.type || null,
      status: frontmatter.status || null,
      tags: frontmatter.tags || [],
      updated_at: frontmatter.updated_at || null,
      headings: extractHeadings(body),
      excerpt: body.trim().slice(0, Math.max(500, Math.min(maxContextChars, 1600))),
      score,
      parseError,
      content_hash: sha256(raw),
    });
  });
  return notes
    .sort((a, b) => b.score - a.score || String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || a.path.localeCompare(b.path))
    .slice(0, Number(limit) || 20);
}

export function getProjectNoteById(id, vaultPath = localLlmConfig().vaultPath) {
  return collectProjectNotes({ vaultPath, limit: 1000 }).find((note) => note.id === id || note.path === id) || null;
}

export function buildManagedNote({ title, type = "app_update", body, tags = ["orbit"], now = new Date() }) {
  const iso = now.toISOString();
  const frontmatter = {
    id: randomUUID(),
    title,
    type,
    status: "draft",
    created_at: iso,
    updated_at: iso,
    author: "local_llm",
    source: "orbit",
    llm_managed: true,
    supabase_sync: "metadata",
    related_project: "orbit-axis",
    version: 1,
    tags,
  };
  return formatFrontmatter(frontmatter) + String(body || "").trim() + "\n";
}

export function validateManagedNoteContent(content, options = {}) {
  const existing = options?.existing || null;
  const maxChars = options?.maxChars || localLlmConfig().maxNoteChars;
  const { frontmatter, body, parseError } = parseFrontmatter(String(content || ""));
  const errors = [];
  if (!String(content || "").trim()) errors.push("note content is empty");
  if (String(content || "").length > maxChars) errors.push(`note exceeds ${maxChars} character limit`);
  if (parseError) errors.push(`frontmatter: ${parseError}`);
  for (const key of ["id", "title", "type", "status", "created_at", "updated_at", "author", "source", "llm_managed", "supabase_sync", "related_project", "version", "tags"]) {
    if (!frontmatter[key]) errors.push(`missing frontmatter ${key}`);
  }
  if (frontmatter.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(frontmatter.id)) errors.push("frontmatter id must be a UUID");
  if (frontmatter.type && !PROJECT_TYPES.has(frontmatter.type)) errors.push(`unsupported project note type: ${frontmatter.type}`);
  if (frontmatter.author && frontmatter.author !== "local_llm") errors.push("author must be local_llm");
  if (frontmatter.source && frontmatter.source !== "orbit") errors.push("source must be orbit");
  if (frontmatter.llm_managed !== true) errors.push("llm_managed must be true");
  if (frontmatter.supabase_sync && frontmatter.supabase_sync !== "metadata") errors.push("supabase_sync must be metadata");
  if (!Array.isArray(frontmatter.tags) || !frontmatter.tags.length) errors.push("tags must be a non-empty list");
  const version = Number(frontmatter.version);
  if (!Number.isInteger(version) || version < 1) errors.push("version must be a positive integer");
  if (!validIso(frontmatter.created_at)) errors.push("created_at must be an ISO timestamp");
  if (!validIso(frontmatter.updated_at)) errors.push("updated_at must be an ISO timestamp");
  if (!body.trim() || !/^#\s+\S/m.test(body)) errors.push("Markdown body must contain a level-one heading");
  if (existing?.frontmatter?.id && frontmatter.id !== existing.frontmatter.id) errors.push("stable id changed");
  if (existing?.frontmatter?.created_at && frontmatter.created_at !== existing.frontmatter.created_at) errors.push("created_at changed");
  if (existing?.frontmatter?.version && version !== Number(existing.frontmatter.version) + 1) errors.push("version must increment by exactly one");
  if (!existing && version !== 1) errors.push("new notes must start at version 1");
  return { ok: errors.length === 0, errors, frontmatter };
}

export function createProposal({ operation, path: notePath, reason = "", content = "", appendContent = "", model = "deterministic-fallback", promptVersion = "", generationDurationMs = null, sources = [], vaultPath = localLlmConfig().vaultPath }) {
  const op = String(operation || "").toLowerCase();
  if (!["create", "update", "append"].includes(op)) throw new Error("Unsupported vault operation.");
  const relPath = validateVaultWritePath(notePath);
  const { absolute } = resolveVaultPath(vaultPath, relPath);
  const exists = existsSync(absolute);
  if (op === "create" && exists) throw new Error("Cannot create: note already exists.");
  if ((op === "update" || op === "append") && !exists) throw new Error("Cannot edit: note does not exist.");

  const before = exists ? readFileSync(absolute, "utf8") : "";
  const beforeParsed = parseFrontmatter(before);
  const beforeHash = sha256(before);
  const proposed = op === "append" ? appendToNote(before, appendContent || content) : content;
  const validation = validateManagedNoteContent(proposed, { existing: exists ? beforeParsed : null });
  if (!validation.ok) {
    const error = new Error(`Proposed note failed validation: ${validation.errors.join("; ")}`);
    error.validationErrors = validation.errors;
    throw error;
  }
  const proposal = {
    id: randomUUID(),
    operation: op,
    path: relPath,
    reason,
    status: "pending_review",
    base_hash: beforeHash,
    proposed_content_hash: sha256(proposed),
    current_version: Number(beforeParsed.frontmatter.version || 0) || null,
    proposed_version: Number(parseFrontmatter(proposed).frontmatter.version || 1),
    diff_text: unifiedDiff(before, proposed, relPath),
    current_content: before,
    proposed_content: proposed,
    sources,
    model,
    prompt_version: promptVersion || null,
    generation_duration_ms: generationDurationMs,
    validation,
    created_at: new Date().toISOString(),
  };
  writeProposal(proposal);
  return proposal;
}

export function listProposals() {
  const dir = proposalDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function readProposal(id) {
  const file = join(proposalDir(), `${id}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function updateProposalStatus(id, status) {
  const proposal = readProposal(id);
  if (!proposal) throw new Error("Proposal not found.");
  const transitions = {
    pending_review: new Set(["approved", "rejected"]),
    approved: new Set(["rejected"]),
  };
  if (!transitions[proposal.status]?.has(status)) throw new Error(`Cannot change proposal from ${proposal.status} to ${status}.`);
  proposal.status = status;
  proposal.reviewed_at = new Date().toISOString();
  writeProposal(proposal);
  return proposal;
}

export function applyProposal(id, { vaultPath = localLlmConfig().vaultPath, model = "" } = {}) {
  const proposal = readProposal(id);
  if (!proposal) throw new Error("Proposal not found.");
  if (proposal.status !== "approved") throw new Error(`Proposal is not approved; current status is ${proposal.status}.`);
  if (!proposal.validation?.ok) throw new Error("Proposal validation failed.");

  const relPath = validateVaultWritePath(proposal.path);
  const { absolute } = resolveVaultPath(vaultPath, relPath);
  const exists = existsSync(absolute);
  const before = exists ? readFileSync(absolute, "utf8") : "";
  const beforeHash = sha256(before);
  if (beforeHash !== proposal.base_hash) {
    proposal.status = "stale";
    writeProposal(proposal);
    throw new Error("Proposal is stale: target note changed.");
  }

  const validation = validateManagedNoteContent(proposal.proposed_content, { existing: exists ? parseFrontmatter(before) : null });
  if (!validation.ok) throw new Error(`Proposal no longer validates: ${validation.errors.join("; ")}`);
  if (sha256(proposal.proposed_content) !== proposal.proposed_content_hash) throw new Error("Proposal content hash does not match its validated hash.");

  mkdirSync(dirname(absolute), { recursive: true });
  const backupPath = createBackup(vaultPath, relPath, before);
  const tempPath = `${absolute}.${proposal.id}.tmp`;
  writeFileSync(tempPath, proposal.proposed_content, "utf8");
  renameSync(tempPath, absolute);
  const after = readFileSync(absolute, "utf8");
  const afterHash = sha256(after);
  const logRecord = {
    timestamp: new Date().toISOString(),
    operation: proposal.operation,
    path: relPath,
    proposal_id: proposal.id,
    model: model || proposal.model,
    before_hash: beforeHash,
    after_hash: afterHash,
    backup_path: backupPath,
    status: "applied",
  };
  appendAuditLog(vaultPath, logRecord);
  proposal.status = "applied";
  proposal.applied_at = logRecord.timestamp;
  proposal.backup_path = backupPath;
  proposal.after_hash = afterHash;
  writeProposal(proposal);
  return { proposal, logRecord };
}

function validIso(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function sha256(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".obsidian" || entry === ".git" || entry === "Attachments" || entry === "Templates") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function isRetrievable(relPath) {
  return RETRIEVAL_PREFIXES.some((prefix) => relPath === prefix || relPath.startsWith(prefix));
}

function scoreQuery(query, haystack, frontmatter, relPath) {
  const tokens = String(query || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  if (!tokens.length) return 1;
  let score = 0;
  for (const token of tokens) if (haystack.includes(token)) score++;
  if (frontmatter.title && String(frontmatter.title).toLowerCase().includes(String(query).toLowerCase())) score += 5;
  if (relPath.toLowerCase().includes(String(query).toLowerCase())) score += 3;
  return score;
}

function appendToNote(before, appendContent) {
  const { frontmatter, body } = parseFrontmatter(before);
  const nextVersion = Number(frontmatter.version || 1) + 1;
  const nextFrontmatter = { ...frontmatter, updated_at: new Date().toISOString(), version: nextVersion };
  return formatFrontmatter(nextFrontmatter) + body.trimEnd() + "\n\n" + String(appendContent || "").trim() + "\n";
}

function unifiedDiff(before, after, relPath) {
  const a = before.split("\n");
  const b = after.split("\n");
  const lines = [`--- a/${relPath}`, `+++ b/${relPath}`];
  const max = Math.max(a.length, b.length);
  lines.push(`@@ -1,${a.length} +1,${b.length} @@`);
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) {
      if (a[i] !== undefined) lines.push(` ${a[i]}`);
    } else {
      if (a[i] !== undefined) lines.push(`-${a[i]}`);
      if (b[i] !== undefined) lines.push(`+${b[i]}`);
    }
  }
  return lines.join("\n");
}

function proposalDir() {
  const dir = localLlmConfig().proposalDir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeProposal(proposal) {
  const safe = { ...proposal };
  writeFileSync(join(proposalDir(), `${safe.id}.json`), JSON.stringify(safe, null, 2), "utf8");
}

function createBackup(vaultPath, relPath, before) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const archiveDir = resolve(vaultPath, "System", "Archive", "LLM Edits", yyyy, mm);
  mkdirSync(archiveDir, { recursive: true });
  const safeName = relPath.replaceAll("/", "__").replace(/\.md$/, "");
  const backupAbs = join(archiveDir, `${new Date().toISOString().replace(/[:.]/g, "-")}__${safeName}.md`);
  writeFileSync(backupAbs, before, "utf8");
  return relative(vaultPath, backupAbs).replaceAll("\\", "/");
}

function appendAuditLog(vaultPath, record) {
  const logRel = validateVaultWritePath("System/Logs/local-llm-vault-edits.jsonl", { allowLog: true });
  const { absolute } = resolveVaultPath(vaultPath, logRel);
  mkdirSync(dirname(absolute), { recursive: true });
  appendFileSync(absolute, `${JSON.stringify(record)}\n`, "utf8");
}
