---
name: observer
description: Operate Observer (metrics-driven status pages) via its MCP server and CLI. Use when the user asks about their status page, metrics, services, SLOs, error budgets, incidents, maintenance windows, wants to change Observer configuration, or wants to set up or connect to Observer (including when they have no account or API key yet). Covers connecting with the device flow, reading state, writing incidents, and the export/apply config-as-code loop.
---

# Observer

Observer turns metrics into public status pages. An agent (the data
plane) runs inside the user's network, evaluates thresholds locally,
and pushes verdicts to Observer Cloud. You interact with the cloud
side through the MCP server or the CLI.

## Connecting

If the `observer` MCP server is already configured and its tools
work, skip this section.

If the user has no Observer account or no API key, connect through
the device flow. It is the preferred path: the user approves one link
in their browser and you receive a scoped key. Never ask the user for
their password.

1. Start a request:

   ```bash
   curl -s -X POST https://use.observer/api/connect/device \
     -H "Content-Type: application/json" -d '{"client": "claude-code"}'
   ```

   `client` is `claude-code`, `claude-desktop`, `cursor`, `codex`, or
   `other`; pick the one you are running in. The response has
   `device_code`, `user_code`, `verification_uri`,
   `verification_uri_complete`, `expires_in` (600) and `interval` (5).
   Keep `device_code` to yourself: do not print it, log it, or show it.
2. Show the user `user_code` and `verification_uri_complete`, and open
   the link in their browser if you can. Tell them to check that the
   code on the page matches, then sign up or sign in and approve. Only
   an organization owner can approve. An organization on Free gets a
   one-time 14-day Starter trial on approval, with no card; afterwards
   it returns to Free and nothing is deleted.
3. Poll every `interval` seconds:

   ```bash
   curl -s -X POST https://use.observer/api/connect/device/token \
     -H "Content-Type: application/json" -d '{"device_code": "obs_dc_..."}'
   ```

   - 400 `authorization_pending`: not approved yet; wait `interval`
     seconds and poll again.
   - 400 `slow_down`: you polled too soon. Use the `interval` in the
     response for every later poll.
   - 400 `access_denied`: the user declined. Stop.
   - 400 `expired_token`: expired or already used. Stop; start a new
     request only if the user still wants to connect.
   - 200: `{ api_key, token_type, org, mcp_url, scopes }`. The key is
     delivered exactly once; a later poll returns `expired_token`.
     Store it before doing anything else.
4. Add the MCP server at `mcp_url` (`https://mcp.use.observer/mcp`)
   with the header `Authorization: Bearer <api_key>`. For Claude Code:

   ```bash
   claude mcp add --transport http observer https://mcp.use.observer/mcp \
     --header "Authorization: Bearer <api_key>"
   ```

   Other clients take the same URL and header in their MCP config.
   Then confirm with `exportConfig` or `listMetrics`. Some clients only
   load new servers after a restart; tell the user if so.

If you cannot make HTTP requests, or the flow fails, send the user to
`https://use.observer/connect?client=<client>` instead. After approving
they see the key once with a ready-made MCP config; ask them to paste
the key (or add the config themselves).

A key from this flow has a fixed preset: `read:config`,
`write:config`, `read:services`, `read:metrics`, `read:slos`,
`read:incidents`. That covers the config-as-code loop and reading
state. It does not include `write:incidents`, `write:maintenances`,
`write:metrics`, `write:change_events`, or `read:sla`; for those, ask
the user to create a key with the extra scopes under Settings, API
keys. The user revokes the key there too (it is named after the
client, for example `Claude Code (agent connect)`).

Full reference: https://docs.use.observer/docs/mcp/connect-ai-agent

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

Plan and apply results carry a `warnings` list. Top-level keys that
config does not manage (for example `incidents`, `maintenances`,
`customers`, or a top-level `slos`) are ignored and reported there
rather than failing the apply; SLOs belong under `services[].slos`.
Relay warnings to the user instead of treating them as errors.

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
  The agent picks the new definition up in about 30 seconds (agent 1.6
  and later; older agents within five minutes).
