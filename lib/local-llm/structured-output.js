const TOP_LEVEL_KEYS = ["answer", "sources", "proposed_vault_changes", "warnings", "confidence"];

export const ORBIT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: TOP_LEVEL_KEYS,
  properties: {
    answer: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "title"],
        properties: { path: { type: "string" }, title: { type: "string" } },
      },
    },
    proposed_vault_changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "path", "reason", "content"],
        properties: {
          operation: { type: "string", enum: ["create", "update", "append"] },
          path: { type: "string" },
          reason: { type: "string" },
          content: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

export function parseStructuredOutput(text) {
  const raw = String(text || "").trim();
  try {
    return { value: JSON.parse(raw), extracted: false, errors: [] };
  } catch {
    const fencedBlocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
    if (fencedBlocks.length === 1) {
      try {
        return { value: JSON.parse(fencedBlocks[0][1]), extracted: true, errors: [] };
      } catch {}
    }
    return { value: null, extracted: false, errors: ["response is not valid JSON"] };
  }
}

export function validateStructuredOutput(value, { allowedSources = [], expectedChange = null } = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["response must be a JSON object"] };
  for (const key of TOP_LEVEL_KEYS) if (!Object.hasOwn(value, key)) errors.push(`missing required field: ${key}`);
  for (const key of Object.keys(value)) if (!TOP_LEVEL_KEYS.includes(key)) errors.push(`unknown top-level field: ${key}`);
  if (typeof value.answer !== "string") errors.push("answer must be a string");
  if (!Array.isArray(value.sources)) errors.push("sources must be an array");
  if (!Array.isArray(value.proposed_vault_changes)) errors.push("proposed_vault_changes must be an array");
  if (!Array.isArray(value.warnings) || value.warnings.some((item) => typeof item !== "string")) errors.push("warnings must be an array of strings");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) errors.push("confidence must be between 0 and 1");

  const sourcePaths = new Set(allowedSources.map((source) => source.path));
  if (Array.isArray(value.sources)) {
    for (const [index, source] of value.sources.entries()) {
      if (!source || typeof source.path !== "string" || typeof source.title !== "string") errors.push(`sources[${index}] must contain path and title strings`);
      else if (!sourcePaths.has(source.path)) errors.push(`sources[${index}] was not supplied to the model: ${source.path}`);
    }
  }

  const changes = Array.isArray(value.proposed_vault_changes) ? value.proposed_vault_changes : [];
  if (!expectedChange && changes.length) errors.push("vault changes were not requested");
  if (expectedChange && changes.length !== 1) errors.push("exactly one requested vault change is required");
  for (const [index, change] of changes.entries()) {
    if (!change || typeof change !== "object") { errors.push(`proposed_vault_changes[${index}] must be an object`); continue; }
    if (!["create", "update", "append"].includes(change.operation)) errors.push(`unsupported operation at proposed_vault_changes[${index}]`);
    for (const key of ["path", "reason", "content"]) if (typeof change[key] !== "string" || !change[key].trim()) errors.push(`proposed_vault_changes[${index}].${key} must be a non-empty string`);
    if (expectedChange && change.operation !== expectedChange.operation) errors.push(`model operation does not match requested operation: ${change.operation}`);
    if (expectedChange && change.path !== expectedChange.path) errors.push(`model path does not match requested path: ${change.path}`);
  }
  return { ok: errors.length === 0, errors };
}
