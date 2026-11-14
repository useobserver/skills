#!/usr/bin/env node
// Validates the skills repository. No dependencies; Node 20 or later.
//
//   node .tools/validate.mjs                  run every check
//   node .tools/validate.mjs --strict-coverage    also fail when an MCP tool is
//                                             mentioned by no skill
//
// These scripts live on the `tools` branch: the plugin directory accepts only
// Markdown, text, JSON, YAML and images from the plugin's own branch. They work
// on the plugin checkout in the current directory, or the one SKILLS_ROOT names.
//
// Checks:
//   1. Skill frontmatter: name equals the folder, kebab-case, at most 64
//      characters; description at most 1024 characters and contains
//      "Use when"; license present; no unknown keys; body starts with "# ".
//   2. SKILL.md is at most MAX_SKILL_LINES lines.
//   3. Every relative link in a skill resolves, references sit one level deep
//      (references/<file>.md), and every reference file is linked.
//   4. Manifests parse as JSON, agree on name, version and MCP URL, the
//      version matches the newest CHANGELOG entry, and every skill folder is
//      listed in the marketplace entry and the README.
//   5. No em or en dashes in any text file.
//   6. No real-looking Observer keys in any file.
//   7. MCP tool coverage against evals/tools.json: unknown tool names fail;
//      tools no skill mentions are reported.
//   8. Every skill has an eval spec in evals/specs/<skill>.json whose tool
//      names exist.
//   9. Every file is one the plugin directory accepts from an organization
//      that is not Verified: Markdown, text, JSON, YAML or a PNG, JPEG, GIF,
//      WebP or ICO image (plus the license and .gitignore), UTF-8 with no NUL
//      byte, not starting with #!, an image that is what its name says, no
//      package manager file, and nothing in .claude-plugin but plugin.json,
//      marketplace.json and images. Version 2.1.0 was refused for shipping
//      the scripts that now live on the tools branch.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.env.SKILLS_ROOT ?? process.cwd());
if (!existsSync(join(ROOT, ".claude-plugin/plugin.json"))) {
  console.error(`${ROOT} is not the plugin checkout (no .claude-plugin/plugin.json). Run from it, or set SKILLS_ROOT.`);
  process.exit(2);
}
const MAX_SKILL_LINES = 300;
const MAX_DESCRIPTION = 1024;
const ALLOWED_KEYS = new Set(["name", "description", "license", "metadata", "compatibility"]);
const STRICT_COVERAGE = process.argv.includes("--strict-coverage");
const SKIP_DIRS = new Set([".git", ".tools", "node_modules", "results", "suite"]);
const TEXT_EXT = /\.(md|mjs|js|ts|json|ya?ml|txt|svg|toml)$|^LICENSE$|^\.gitignore$/;
// camelCase words that start like an operation; used to spot tool names.
const TOOL_LIKE = /`((?:list|get|create|delete|patch|update|apply|export|rotate|test|draft|publish|resolve|append|add|set|start|complete|cancel)[A-Z][A-Za-z]*)`/g;

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${relative(ROOT, file) || "."}: ${msg}`);
const warn = (file, msg) => warnings.push(`${relative(ROOT, file) || "."}: ${msg}`);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(path, `invalid JSON: ${e.message}`);
    return null;
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Minimal YAML frontmatter: `key: value`, quoted values, and `>` / `|` block
// scalars. Nested maps (metadata) are kept as raw text.
function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const lines = text.slice(4, end).split("\n");
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(lines[i]);
    if (!m) continue;
    let [, key, value] = m;
    if (value === ">" || value === "|" || value === ">-" || value === "|-" || value === "") {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = value.startsWith("|") ? block.join("\n") : block.join(" ");
    } else if (/^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: text.slice(end + 5) };
}

// ── 1-3. Skills ──────────────────────────────────────────────────────────
const skillsDir = join(ROOT, "skills");
const skillNames = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()).sort();
const skillText = new Map(); // skill -> all markdown text in the skill

for (const name of skillNames) {
  const dir = join(skillsDir, name);
  const file = join(dir, "SKILL.md");
  if (!existsSync(file)) {
    err(dir, "missing SKILL.md");
    continue;
  }
  const text = readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    err(file, "frontmatter must open with --- on line 1 and close with ---");
    continue;
  }
  const { data, body } = fm;
  for (const key of Object.keys(data)) if (!ALLOWED_KEYS.has(key)) err(file, `unknown frontmatter key "${key}"`);
  if (data.name !== name) err(file, `name "${data.name}" must equal the folder name "${name}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) err(file, "folder name must be kebab-case, at most 64 characters");
  if (!data.description) err(file, "description is required");
  else {
    if (data.description.length > MAX_DESCRIPTION) err(file, `description is ${data.description.length} characters (max ${MAX_DESCRIPTION})`);
    if (!data.description.includes("Use when")) err(file, 'description must contain "Use when"');
  }
  if (!data.license) err(file, "license is required");
  if (!body.trimStart().startsWith("# ")) err(file, 'body must start with a "# " heading');
  const lineCount = text.split("\n").length;
  if (lineCount > MAX_SKILL_LINES) err(file, `${lineCount} lines (max ${MAX_SKILL_LINES}); move detail into references/`);

  // Links.
  const linked = new Set();
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const abs = resolve(dir, target);
    if (!existsSync(abs)) err(file, `broken link: ${m[1]}`);
    const rel = relative(dir, abs);
    if (rel.startsWith("references/")) {
      if (!/^references\/[^/]+\.md$/.test(rel)) err(file, `references must be one level deep: ${m[1]}`);
      linked.add(rel);
    } else if (rel.startsWith("..")) {
      err(file, `links must stay inside the skill folder: ${m[1]}`);
    }
  }
  let all = text;
  const refDir = join(dir, "references");
  if (existsSync(refDir)) {
    for (const f of readdirSync(refDir)) {
      const p = join(refDir, f);
      if (statSync(p).isDirectory()) {
        err(p, "no nested folders under references/");
        continue;
      }
      if (!linked.has(`references/${f}`)) err(p, "reference file is not linked from SKILL.md");
      all += "\n" + readFileSync(p, "utf8");
    }
  }
  skillText.set(name, all);
}

// ── 4. Manifests ─────────────────────────────────────────────────────────
const claudePlugin = readJson(join(ROOT, ".claude-plugin/plugin.json"));
const marketplace = readJson(join(ROOT, ".claude-plugin/marketplace.json"));
const claudeMcp = readJson(join(ROOT, ".mcp.json"));
const apPlugin = readJson(join(ROOT, "plugin.json"));
const apMcp = readJson(join(ROOT, "mcp.json"));
const gemini = readJson(join(ROOT, "gemini-extension.json"));

const versions = {
  ".claude-plugin/plugin.json": claudePlugin?.version,
  "plugin.json": apPlugin?.version,
  "gemini-extension.json": gemini?.version,
};
const changelog = existsSync(join(ROOT, "CHANGELOG.md")) ? readFileSync(join(ROOT, "CHANGELOG.md"), "utf8") : "";
const clVersion = /^## \[?(\d+\.\d+\.\d+)\]?/m.exec(changelog)?.[1];
if (!clVersion) err(join(ROOT, "CHANGELOG.md"), "no release heading like `## [2.0.0]` found");
versions["CHANGELOG.md"] = clVersion;
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1) err(ROOT, `versions disagree: ${JSON.stringify(versions)}`);

if (claudePlugin && claudePlugin.name !== "observer") err(join(ROOT, ".claude-plugin/plugin.json"), 'plugin name must be "observer"');
if (apPlugin && apPlugin.name !== claudePlugin?.name) err(join(ROOT, "plugin.json"), "name differs from .claude-plugin/plugin.json");
if (gemini && gemini.name !== claudePlugin?.name) err(join(ROOT, "gemini-extension.json"), "name differs from .claude-plugin/plugin.json");
if (apPlugin && !String(apPlugin.$schema ?? "").includes("agent-plugins.org/schemas/1.0.0/")) err(join(ROOT, "plugin.json"), "$schema must be the Agent Plugins 1.0.0 plugin schema");
if (apMcp && !String(apMcp.$schema ?? "").includes("agent-plugins.org/schemas/1.0.0/")) err(join(ROOT, "mcp.json"), "$schema must be the Agent Plugins 1.0.0 mcp schema");

const urls = {
  ".mcp.json": claudeMcp?.mcpServers?.observer?.url,
  "mcp.json": apMcp?.mcpServers?.observer?.url,
  "gemini-extension.json": gemini?.mcpServers?.observer?.httpUrl,
};
if (new Set(Object.values(urls)).size !== 1 || !String(urls[".mcp.json"]).startsWith("https://")) err(ROOT, `MCP server URLs disagree or are not https: ${JSON.stringify(urls)}`);
if (claudeMcp?.mcpServers?.observer?.type !== "http") err(join(ROOT, ".mcp.json"), 'observer server needs "type": "http"');
if (apMcp?.mcpServers?.observer?.type !== "streamable-http") err(join(ROOT, "mcp.json"), 'observer server needs "type": "streamable-http"');
if (gemini?.contextFileName && !existsSync(join(ROOT, gemini.contextFileName))) err(join(ROOT, "gemini-extension.json"), `contextFileName ${gemini.contextFileName} does not exist`);

const entry = marketplace?.plugins?.find((p) => p.name === claudePlugin?.name);
if (!entry) err(join(ROOT, ".claude-plugin/marketplace.json"), "no plugin entry named like .claude-plugin/plugin.json");
else {
  if (entry.version) warn(join(ROOT, ".claude-plugin/marketplace.json"), "entry sets version; plugin.json wins, so leave it out");
  const listed = (entry.skills ?? []).map((s) => s.replace(/^\.\/skills\//, "").replace(/\/$/, "")).sort();
  for (const s of skillNames) if (!listed.includes(s)) err(join(ROOT, ".claude-plugin/marketplace.json"), `skill ${s} is not listed in the entry's skills`);
  for (const s of listed) if (!skillNames.includes(s)) err(join(ROOT, ".claude-plugin/marketplace.json"), `lists ${s}, which has no folder under skills/`);
}

const readme = existsSync(join(ROOT, "README.md")) ? readFileSync(join(ROOT, "README.md"), "utf8") : "";
for (const s of skillNames) if (!readme.includes(`skills/${s}/`)) err(join(ROOT, "README.md"), `skill ${s} is missing from the skills table`);

// ── 5-6. Every text file ─────────────────────────────────────────────────
const KEY = /obs_(?:live|pub|dc)_[A-Za-z0-9_-]{12,}/g;
for (const file of walk(ROOT)) {
  const base = file.split("/").pop();
  if (!TEXT_EXT.test(base)) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/[\u2013\u2014]/.test(line)) err(file, `line ${i + 1}: em or en dash; use a colon, comma or parentheses`);
    for (const m of line.matchAll(KEY)) {
      if (/your|example|placeholder|xxxx/i.test(m[0])) continue;
      err(file, `line ${i + 1}: looks like a real Observer key (${m[0].slice(0, 12)}...)`);
    }
  });
}

// ── 7. Tool coverage ─────────────────────────────────────────────────────
const toolsFile = readJson(join(ROOT, "evals/tools.json"));
const toolNames = new Set((toolsFile?.tools ?? []).map((t) => t.name));
if (toolNames.size === 0) err(join(ROOT, "evals/tools.json"), "no tools listed");
const mentionedBy = new Map([...toolNames].map((t) => [t, []]));
for (const [skill, text] of skillText) {
  for (const m of text.matchAll(TOOL_LIKE)) {
    const name = m[1];
    if (toolNames.has(name)) {
      const list = mentionedBy.get(name);
      if (!list.includes(skill)) list.push(skill);
    } else {
      err(join(skillsDir, skill), `mentions \`${name}\`, which is not an Observer MCP tool (renamed or removed?)`);
    }
  }
}
for (const name of toolNames) if (!readme.includes(`\`${name}\``)) err(join(ROOT, "README.md"), `tool ${name} is missing from the tools table`);
const uncovered = [...mentionedBy].filter(([, s]) => s.length === 0).map(([t]) => t);

// ── 8. Eval specs ────────────────────────────────────────────────────────
const specDir = join(ROOT, "evals/specs");
for (const s of skillNames) {
  const p = join(specDir, `${s}.json`);
  if (!existsSync(p)) {
    err(p, "missing eval spec");
    continue;
  }
  const spec = readJson(p);
  if (!spec) continue;
  if (spec.skill !== s) err(p, `"skill" must be "${s}"`);
  if (!Array.isArray(spec.should_trigger) || spec.should_trigger.length < 3) err(p, "should_trigger needs at least 3 prompts");
  if (!Array.isArray(spec.should_not_trigger) || spec.should_not_trigger.length < 2) err(p, "should_not_trigger needs at least 2 prompts");
  for (const n of spec.should_not_trigger ?? []) {
    if (!n.prompt) err(p, "should_not_trigger entries need a prompt");
    if (n.use_instead && n.use_instead !== "none" && !skillNames.includes(n.use_instead)) err(p, `use_instead names unknown skill ${n.use_instead}`);
  }
  for (const b of spec.behaviour ?? []) {
    const names = [...[].concat(b.expected_first_tool ?? []), ...(b.must_call ?? []), ...(b.forbidden_tools ?? []), ...(b.order ?? []).flat(), ...(b.forbidden_calls ?? []).map((f) => f.tool)].filter(Boolean);
    for (const t of names) if (!toolNames.has(t)) err(p, `unknown tool ${t}`);
    if (!b.prompt) err(p, "behaviour entries need a prompt");
  }
}

// ── 9. Shipped file types ────────────────────────────────────────────────
const TEXT_TYPES = /\.(md|txt|json|ya?ml)$/i;
const IMAGE_MAGIC = {
  png: (b) => b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
  jpg: (b) => b.subarray(0, 3).toString("hex") === "ffd8ff",
  jpeg: (b) => b.subarray(0, 3).toString("hex") === "ffd8ff",
  gif: (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  webp: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  ico: (b) => b.subarray(0, 4).toString("hex") === "00000100",
};
const PLAIN_NAMES = new Set(["LICENSE", ".gitignore"]);
const PACKAGE_MANAGER = /^(package(-lock)?\.json|pnpm-(workspace|lock)\.yaml|yarn\.lock|bun\.lockb?|\.npmrc|\.yarnrc(\.yml)?)$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const base = rel.split("/").pop();
  const ext = (/\.([A-Za-z0-9]+)$/.exec(base)?.[1] ?? "").toLowerCase();
  if (/[:\\]/.test(rel)) err(file, "path has a character (: or \\) that not every computer keeps");
  if (PACKAGE_MANAGER.test(base)) err(file, "package manager files are not accepted by the plugin directory");
  if (/(^|\/)\.claude\/skills\//.test(rel)) err(file, "a .claude/skills folder is not accepted; skills go in skills/");
  if (rel.startsWith(".claude-plugin/") && !/^\.claude-plugin\/(plugin\.json|marketplace\.json|[^/]+\.(png|jpe?g|gif|webp|ico))$/i.test(rel)) {
    err(file, ".claude-plugin holds only plugin.json, marketplace.json and images");
  }
  const buf = readFileSync(file);
  if (IMAGE_MAGIC[ext]) {
    if (!IMAGE_MAGIC[ext](buf)) err(file, `is not a ${ext} image`);
    continue;
  }
  if (!TEXT_TYPES.test(base) && !PLAIN_NAMES.has(base)) {
    err(file, "file type is not accepted by the plugin directory (Markdown, text, JSON, YAML or an image); scripts live on the tools branch");
    continue;
  }
  if (buf.subarray(0, 2).toString("latin1") === "#!") err(file, "starts with #!");
  if (buf.includes(0)) err(file, "holds a NUL byte");
  try {
    utf8.decode(buf);
  } catch {
    err(file, "is not UTF-8 text");
  }
}

// ── Report ───────────────────────────────────────────────────────────────
console.log(`skills: ${skillNames.length}; tools: ${toolNames.size}; covered: ${toolNames.size - uncovered.length}`);
if (uncovered.length) {
  const msg = `tools mentioned by no skill: ${uncovered.join(", ")}`;
  if (STRICT_COVERAGE) errors.push(msg);
  else warnings.push(msg);
}
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log("ok");
