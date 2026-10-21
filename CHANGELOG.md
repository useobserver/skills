# Changelog

All notable changes to the Observer skills and plugin. Versions follow
semantic versioning. The version here matches `.claude-plugin/plugin.json`,
`plugin.json` and `gemini-extension.json`.

## 2.0.1

- The CLI install steps download a pinned release and check its SHA256SUMS instead of piping a script to the shell.
- The Claude plugin manifest no longer names an icon file; the directory listing sets the icon.

## [2.0.0] - 2026-10-21

The repository is now a plugin for Claude Code, an Agent Plugins 1.0 package
and a Gemini CLI extension, and the single `observer` skill is split into
task skills. Version 2.0.0 because skill boundaries and names changed: anyone
who copied `skills/observer` by hand should install the plugin or copy the
new folders.

### Where the old `observer` skill went

| Old section | Now in |
|---|---|
| Connecting (OAuth, device flow) | `observer-connect` |
| Setting Observer up | `observer-setup` |
| Agent creation, keys, claim links, restricted networks | `observer-agent` (setup keeps the short path) |
| Test each source, thresholds, units | `observer-checks`, with one generated reference per probe type |
| Check the metrics, reason codes | `observer-no-data` |
| Configuration as code, CLI, deletes, prune | `observer-config-as-code` |
| SLO reading, unknown policy | `observer-slos` |
| Page settings and access | `observer-status-page` |
| Ground rules, reading state, docs pointers | `observer` (now a short router) |
| Maintenance (from `observer-incidents`) | `observer-maintenance` |

### Added

- Skills: `observer-sla-report` (SLA Ledger statements and verification),
  `observer-heartbeats` (heartbeat checks, ping URL rotation, manual status),
  `observer-maintenance`, and the others listed above. Every MCP tool is now
  covered by at least one skill, including `createChangeEvent`,
  `deleteAgent`, `deleteIncident`, `getMetricHeartbeat`,
  `rotateMetricHeartbeatUrl`, `setManualMetricStatus`, `listSlaStatements`
  and `getSlaStatement`.
- Read-only MCP endpoint `https://mcp.use.observer/mcp/readonly` documented.
- Packaging: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  (marketplace `useobserver`), `.mcp.json`, Agent Plugins `plugin.json` and
  `mcp.json`, `gemini-extension.json` with `GEMINI.md`.
- `scripts/validate.mjs` and a CI workflow: frontmatter, size, links,
  manifests, versions, dashes, secrets, MCP tool coverage, eval specs.
- `scripts/sync-tools.ts`, `scripts/gen-probe-refs.ts` and
  `scripts/build-evals.mjs` with eval specs under `evals/specs/`.

### Changed

- `observer-incidents`: triage first, `createIncident` uses `publish`, every
  publish, message and resolve needs approval, customer targeting moved to a
  reference, maintenance moved out.
- Console paths now read Developers > API keys.
- Every skill: `license: ISC`, sibling routing in the description, numbered
  steps with a verify step, and an untrusted-content rule.

## [1.0.0]

The `observer` and `observer-incidents` skills, installed by copying folders.
