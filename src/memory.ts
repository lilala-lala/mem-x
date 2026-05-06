/**
 * Memory file I/O: read/write markdown files with frontmatter.
 */
import fs from "node:fs/promises";
import path from "node:path";

export type MemoryEntry = {
  id: string;
  type: string;
  relativePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

export function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const lines = text.split("\n");
  const first = lines[0]?.trim();
  const delims = ["---", "==="];
  if (!delims.includes(first)) {
    return { frontmatter: {}, body: text };
  }
  const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
  if (endIdx === -1) {
    return { frontmatter: {}, body: text };
  }
  const fmText = lines.slice(1, endIdx).join("\n");
  const body = lines.slice(endIdx + 1).join("\n").trimStart();
  try {
    // Simple YAML-ish parser for flat key:value pairs
    const fm: Record<string, unknown> = {};
    for (const line of fmText.split("\n")) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, val] = match;
        if (val.startsWith("[") && val.endsWith("]")) {
          try {
            fm[key] = JSON.parse(val);
          } catch {
            fm[key] = val;
          }
        } else if (val === "true" || val === "false") {
          fm[key] = val === "true";
        } else if (/^-?\d+(\.\d+)?$/.test(val)) {
          fm[key] = parseFloat(val);
        } else {
          fm[key] = val;
        }
      }
    }
    return { frontmatter: fm, body };
  } catch {
    return { frontmatter: {}, body: text };
  }
}

export async function readMemoryDir(dir: string): Promise<MemoryEntry[]> {
  const entries: MemoryEntry[] = [];
  const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
  for (const f of files) {
    if (typeof f !== "string") continue;
    if (!f.endsWith(".md")) continue;
    const abs = path.join(dir, f);
    const text = await fs.readFile(abs, "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    const id = (frontmatter.id as string) ?? path.basename(f, ".md");
    entries.push({ id, type: (frontmatter.type as string) ?? "unknown", relativePath: f, frontmatter, body });
  }
  return entries;
}

export function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else if (typeof val === "boolean") {
      lines.push(`${key}: ${val}`);
    } else if (typeof val === "number") {
      lines.push(`${key}: ${val}`);
    } else {
      // Use JSON.stringify for strings to safely escape special chars
      lines.push(`${key}: ${JSON.stringify(String(val))}`);
    }
  }
  return lines.join("\n");
}

export async function writeMemoryFile(
  dir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const abs = path.join(dir, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

export async function updateMemoryFile(
  dir: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  const entries = await readMemoryDir(dir);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return false;

  const newFm = { ...entry.frontmatter, ...updates };
  const fmText = serializeFrontmatter(newFm);
  const newContent = `---\n${fmText}\n---\n\n${entry.body}`;
  await writeMemoryFile(dir, entry.relativePath, newContent);
  return true;
}

export async function ensureIndex(dir: string): Promise<void> {
  const entries = await readMemoryDir(dir);
  const active = entries.filter((e) => e.frontmatter.status === "active");
  const lines = [
    "# Feishu Context Memory Index",
    "",
    `Total: ${entries.length} entries | Active: ${active.length}`,
    "",
    ...active.map(
      (e) =>
        `- [${e.id}] ${e.type} | ${e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? ""} | importance:${e.frontmatter.importance ?? "?"}`,
    ),
  ];
  await fs.writeFile(path.join(dir, "INDEX.md"), lines.join("\n"), "utf-8");
}
