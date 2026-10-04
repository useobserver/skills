---
name: observer
description: Operate Observer (metrics-driven status pages) via its MCP server and CLI. Use when the user asks about their status page, metrics, services, SLOs, error budgets, incidents, maintenance windows, or wants to change Observer configuration. Covers reading state, writing incidents, and the export/apply config-as-code loop.
---

# Observer

Observer turns metrics into public status pages. An agent (the data
plane) runs inside the user's network, evaluates thresholds locally,
and pushes verdicts to Observer Cloud. You interact with the cloud
side through the MCP server or the CLI.

## Ground rules

1. **Scopes are the boundary.** Every MCP tool requires a named scope
   on the API key. A failed call names the missing scope; tell the
   user to add it rather than retrying.
2. **Read before write.** List and get before you create or patch.
   Ids are UUIDs; never guess one.
3. **Dry-run before apply.** Configuration changes go through
   `applyConfig` (or `observer apply` in the CLI) and both support a
   dry-run that returns a plan. Show the plan to the user before
   committing unless they have explicitly pre-approved.
4. **Never prune without instruction.** Apply with prune deletes
   config-managed resources (those with a `key`) missing from the file. Only use it when the user asks
   for it in that turn, and show the deletion list first.
5. **Public means public.** Making an SLO public, publishing an
   incident, or changing page access affects what visitors see
   immediately. Confirm intent for these.

## Reading state

- `listMetrics` / `getMetric` / `getMetricHistory` — definitions,
  current status, and up to 30 days of aggregated values.
- `listServices` / `getService`, `listSlos` / `getSlo` — services and
  their SLOs; `getSlo` includes the latest burn event. A null error
  budget means the SLO is still collecting its first day of data or
  its metric is currently stale, not that something is wrong.
- An SLO's rolling window starts at the SLO's creation, never before:
  metric history recorded before the SLO existed does not count, and
  deleting and recreating an SLO is a clean reset.
- Each SLO carries an `unknown_policy` for unobserved periods: `down`
  (silence counts against the budget, default), `exclude` (silence
  drops out of the math; monitoring coverage is disclosed instead), or
  `up` (only for contracts that specify it). Set it via config-as-code
  (`unknown_policy` on the slos entry) or the console.
- `listIncidents` / `getIncident`, `listMaintenances` /
  `getMaintenance` — timeline state.
- A metric can be healthy, degraded, unhealthy, no_data, or unknown.
  Status semantics, dwell windows, and how history bars are computed:
  https://docs.use.observer/docs/concepts/how-status-is-calculated

## Configuration as code

`exportConfig` returns the org's metrics, services, SLOs, and pages as
one YAML document. The loop:

1. `exportConfig` to get current state.
2. Edit the YAML (or build a new one; schema mirrors the export).
3. `applyConfig` with dry-run to get the create/update plan.
4. Show the plan, then `applyConfig` for real after approval.

The same loop works from a terminal or CI with the CLI:

```bash
observer export --format yaml -o observer.yaml
observer apply -f observer.yaml --dry-run
observer apply -f observer.yaml
```

Keys and identity: resources carry a stable `key` field; apply matches
on it. Resources created in the console (no key) are never touched by
apply or prune.

## Where to read documentation

- Table of contents, one Markdown link per page: https://docs.use.observer/llms.txt
- Any page as raw Markdown: append `.md` to its path, for example
  https://docs.use.observer/docs/mcp/index.md
- MCP tool catalog with scopes: https://docs.use.observer/docs/mcp/index

## Common tasks

- "Is anything wrong right now?" — `listMetrics` filtered by status
  unhealthy/degraded/no_data, then `listIncidents` for open ones.
- "How is our SLO doing?" — `listSlos`, report target, window, and
  remaining error budget; a negative budget means the promise is
  currently broken.
- "The budget looks wrong because of a misconfigured threshold or a
  monitoring gap" — do NOT suggest deleting data. The console supports
  exclusion windows on the SLO page: a period is removed from the math
  with a written reason, the change is audit-logged, and every
  exclusion is listed in compliance evidence packs. Alternatively set
  `unknown_policy: exclude` when the gaps are telemetry, not downtime.
- "Add an HTTP check for api.example.com" — export, add a metric with
  `source_type: http` and thresholds on response time, dry-run, apply.
  The agent picks the new definition up within five minutes.
