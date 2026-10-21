#!/usr/bin/env node
// Turns the compact specs in evals/specs/*.json into a `claude plugin eval`
// suite under evals/suite/ (git-ignored), with a mocked Observer MCP server so
// no real organization is touched.
//
//   node scripts/build-evals.mjs [--tool-prefix mcp__plugin_observer_observer__]
//   claude plugin eval . --eval-dir evals/suite
//
// Each spec becomes:
//   trigger-<skill>-<n>    should-trigger prompt; passes when the skill loads
//   avoid-<skill>-<n>      should-not-trigger prompt; passes when it does not
//                          (and, with-arm only, when the named sibling loads)
//   behave-<skill>-<n>     workflow prompt; graded on the first tool, required
//                          tools, call order and forbidden calls
//
// The tool prefix is how Claude Code names a plugin's MCP tools
// (mcp__plugin_<plugin>_<server>__<tool>). Override it if your client differs.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prefixArg = process.argv.indexOf("--tool-prefix");
const PREFIX = prefixArg > -1 ? process.argv[prefixArg + 1] : "mcp__plugin_observer_observer__";
const SPECS = join(ROOT, "evals/specs");
const OUT = join(ROOT, "evals/suite");

const tools = JSON.parse(readFileSync(join(ROOT, "scripts/tools.json"), "utf8")).tools.map((t) => t.name);
const yamlList = (xs) => `[${xs.map((x) => JSON.stringify(x)).join(", ")}]`;
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const skillMatch = (skill) => `"skill"\\s*:\\s*"(?:[\\w-]+:)?${skill}"`;

function writeCase(name, { prompt, tags, graders }) {
  const dir = join(OUT, name);
  mkdirSync(join(dir, "graders"), { recursive: true });
  writeFileSync(
    join(dir, "prompt.md"),
    `---\nmax_turns: 15\nallowed_tools: [Skill, Read, Glob, Grep]\ntags: ${yamlList(tags)}\n---\n\n${prompt}\n`,
  );
  for (const [g, fm] of Object.entries(graders)) {
    const lines = Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === "string" ? quote(v) : v}`);
    writeFileSync(join(dir, "graders", `${g}.md`), `---\n${lines.join("\n")}\n---\n`);
  }
}

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const file of readdirSync(SPECS).filter((f) => f.endsWith(".json")).sort()) {
  const spec = JSON.parse(readFileSync(join(SPECS, file), "utf8"));
  const s = spec.skill;

  spec.should_trigger.forEach((prompt, i) => {
    writeCase(`trigger-${s}-${i + 1}`, {
      prompt,
      tags: ["trigger", s],
      graders: { "skill-fired": { type: "tool_used", tool: "Skill", input_match: skillMatch(s) } },
    });
    count++;
  });

  spec.should_not_trigger.forEach((n, i) => {
    const graders = { "skill-not-fired": { type: "tool_used", tool: "Skill", input_match: skillMatch(s), min: 0, max: 0, arm: "both" } };
    if (n.use_instead && n.use_instead !== "none") {
      graders["sibling-fired"] = { type: "tool_used", tool: "Skill", input_match: skillMatch(n.use_instead) };
    }
    writeCase(`avoid-${s}-${i + 1}`, { prompt: n.prompt, tags: ["avoid", s], graders });
    count++;
  });

  (spec.behaviour ?? []).forEach((b, i) => {
    const graders = {};
    const first = [].concat(b.expected_first_tool ?? []);
    if (first.length === 1) graders["first-tool"] = { type: "tool_used", tool: PREFIX + first[0] };
    else if (first.length > 1) graders["first-tool"] = { type: "regex", target: "trace", pattern: `${PREFIX}(?:${first.join("|")})` };
    // "First" is approximated: the expected tool must run before every write
    // the case allows, and before any forbidden write (which must not run).
    for (const t of b.must_call ?? []) graders[`calls-${t}`] = { type: "tool_used", tool: PREFIX + t };
    (b.order ?? []).forEach(([before, after], k) => {
      graders[`order-${k + 1}-${before}-before-${after}`] = { type: "tool_order", before: PREFIX + before, after: PREFIX + after };
    });
    for (const t of b.forbidden_tools ?? []) {
      graders[`never-${t}`] = { type: "tool_used", tool: PREFIX + t, min: 0, max: 0, arm: "both" };
    }
    (b.forbidden_calls ?? []).forEach((f, k) => {
      graders[`never-${f.tool}-${k + 1}`] = { type: "tool_used", tool: PREFIX + f.tool, input_match: f.input_match, min: 0, max: 0, arm: "both" };
    });
    writeCase(`behave-${s}-${i + 1}`, { prompt: b.prompt, tags: ["behaviour", s], graders });
    count++;
  });
}

// One agent mock answers every Observer tool for a fictional organization.
const mockDir = join(OUT, "mocks", "observer");
mkdirSync(mockDir, { recursive: true });
writeFileSync(
  join(mockDir, "_server.md"),
  `---
type: agent
tools: ${yamlList(tools)}
abort_when: Never abort. Answer every call.
---

You are the Observer public API for a fictional organization named "acme"
(id org_eval_acme) on the Pro plan. Answer each tool call with plausible JSON
in the shape of the Observer REST API, consistent with earlier answers in this
run. Never return a real key: agent keys look like obs_live_mock and ping URLs
like https://use.observer/api/heartbeat/mock.

State of the organization:
- getMe: every scope granted, plan pro, quotas well below limits.
- Agents: prod-eu (online, connected_ever true, version 1.7.1), staging
  (offline, connected_ever true). No agent named edge-1.
- Services: API, Checkout, Data.
- Metrics: api-health (http, current_status no_data, reason ECONNREFUSED,
  agent prod-eu, stale false), checkout-latency (http, unhealthy, 2400 ms,
  agent prod-eu), db-connections (database, healthy), nightly-backup
  (heartbeat, healthy, last success 7 hours ago), staging-latency (http,
  config-managed, healthy).
- SLOs: checkout-availability (99.9 over 30 days, budget 41.2), api-availability
  (99.5 over 30 days, collecting).
- Pages: acme-status (access_mode password, public_url
  https://acme-status.use.observer, layout blueprint, locale en).
- Incidents: one open, published incident "Checkout errors" (major).
- Maintenances: none open.
- SLA statements: Acme, period 2026-09, delivered, attainment_min 99.912,
  credit_pct 0, credit_state none.
- applyConfig with dryRun true returns a diff and changes nothing; without it,
  the same diff as applied.
- testProbe on prod-eu returns value 140, unit ms, status healthy when
  thresholds are given.
`,
);
console.log(`wrote ${count} cases and a mocked observer server to ${OUT}`);
