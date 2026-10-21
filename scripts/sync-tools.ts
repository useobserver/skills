// Regenerates scripts/tools.json, the list of Observer MCP tools that the
// validator checks the skills against.
//
// Usage: bun scripts/sync-tools.ts <path to the Observer monorepo>
//
// Reads apps/observer-mcp/generated/tools.ts from the monorepo. Only names,
// scopes, HTTP method, path and summary are kept; descriptions and input
// schemas stay in the server.

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: bun scripts/sync-tools.ts <observer-monorepo-path>");
  process.exit(2);
}

const toolsPath = resolve(root, "apps/observer-mcp/generated/tools.ts");
const mod = await import(toolsPath);
const list = (mod.TOOLS ?? mod.default) as Array<Record<string, any>>;
if (!Array.isArray(list) || list.length === 0) {
  console.error(`no TOOLS export found in ${toolsPath}`);
  process.exit(1);
}

const tools = list
  .map((t) => {
    const out: Record<string, unknown> = {
      name: t.name,
      method: String(t.method).toUpperCase(),
      path: t.path,
      scopes: t.scopes ?? (t.scope ? [t.scope] : []),
      summary: t.summary,
    };
    // Tool annotations, when the server publishes them.
    if (t.annotations && typeof t.annotations === "object") out.annotations = t.annotations;
    return out;
  })
  .sort((a, b) => String(a.name).localeCompare(String(b.name)));

const out = join(import.meta.dir, "tools.json");
writeFileSync(out, JSON.stringify({ source: "apps/observer-mcp/generated/tools.ts", count: tools.length, tools }, null, 2) + "\n");
console.log(`wrote ${tools.length} tools to ${out}`);
