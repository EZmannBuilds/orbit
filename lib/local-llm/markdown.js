export function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw, parseError: "no frontmatter" };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw, parseError: "unterminated frontmatter" };
  const fmText = raw.slice(3, end).replace(/^\n/, "");
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const fm = {};
  let curKey = null;
  let parseError = null;
  for (const line of fmText.split("\n")) {
    if (!line.trim()) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && curKey) {
      if (!Array.isArray(fm[curKey])) fm[curKey] = [];
      fm[curKey].push(coerce(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (!kv) {
      parseError = `unparseable line: ${line}`;
      continue;
    }
    curKey = kv[1];
    fm[curKey] = kv[2] === "" ? null : coerce(kv[2]);
  }
  return { frontmatter: fm, body, parseError };
}

export function formatFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${String(item)}`);
    } else if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function extractHeadings(body) {
  return String(body).split("\n")
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: match[2].trim() }));
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function coerce(value) {
  const text = value.trim().replace(/^["']|["']$/g, "");
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "") return null;
  return text;
}
