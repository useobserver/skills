---
name: observer
description: Operate Observer (metrics-driven status pages) via its MCP server and CLI. Use when the user asks about their status page, metrics, services, SLOs, error budgets, incidents, maintenance windows, Observer Agents, wants to change Observer configuration, or wants to set up or connect to Observer (including when they have no account or API key yet). Covers connecting with the device flow, the setup sequence (account check, creating and installing the Observer Agent, config apply, sharing the page), diagnosing metrics with no data, reading state, and the export/apply config-as-code loop.
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
   Most clients only load a new MCP server after a restart, and a
   restart ends the session (anything shown once, such as an agent
   key, is lost). Before going further, ask the user which they
   prefer: continue now over the REST API
   (`https://use.observer/api/v1`, same key and operations), or
   restart their client and continue with the MCP tools. Do not
   create an Observer Agent and then restart. Confirm with `getMe`
   either way.

If you cannot make HTTP requests, or the flow fails, send the user to
`https://use.observer/connect?client=<client>` instead. After approving
they see the key once with a ready-made MCP config; ask them to paste
the key (or add the config themselves).

A key from this flow has a fixed preset: `read:config`,
`write:config`, `read:agents`, `write:agents`, `read:services`,
`read:metrics`, `read:slos`, `read:incidents`. That covers the
config-as-code loop, per-object delete, status page reads, creating
and checking Observer Agents, and reading state. Keys from before
agents were added to the preset lack `read:agents` and `write:agents`;
if an agent tool fails with a scope error, ask the user to run the
connect flow again. It does not include `write:incidents`, `write:maintenances`,
`write:metrics`, `write:change_events`, or `read:sla`; for those, ask
the user to create a key with the extra scopes under Settings, API
keys. The user revokes the key there too (it is named after the
client, for example `Claude Code (agent connect)`).

Full reference: https://docs.use.observer/docs/mcp/connect-ai-agent

## Setting Observer up

Follow this order when the user asks you to set Observer up or add
monitoring. Skip steps whose result you already have.

1. **`getMe` first.** It needs no scope and returns the key's scopes,
   the plan (and `trial_ends_at` during a Starter trial), quotas as
   `used` and `limit` for agents, metrics, services, SLOs and status
   pages, and the rate limits. Plan around the limits instead of
   finding them through failed calls.
2. **Get an Observer Agent, if the metrics need one.** Every metric
   except `source_type: heartbeat` and `manual` runs on an Observer
   Agent inside the user's network.
   - `listAgents` with `name` to reuse an existing agent. Names are
     not unique in Observer, so reuse instead of creating duplicates.
   - Otherwise `createAgent` with `{ "name": "..." }` (add
     `prometheus_url` only when it will read PromQL). Each agent
     counts toward the plan; a 403 `quota_exceeded` or
     `feature_locked` is a plan limit, so tell the user and pass on
     the upgrade link rather than retrying.
   - The response carries `agent_key` exactly once, plus `install`
     (`docker`, `compose`, `kubernetes`, `systemd`, `binary`, each
     with the key already filled in and a `logs_command`) and `env`.
     Ask which environment the user runs, give them that one snippet
     to run, and do not store or repeat the key anywhere else. If it
     is lost before it was used, do not delete and recreate the agent:
     confirm with `getAgent` that it has never connected (`status`
     `never_connected`, `last_heartbeat_at` null), then call
     `rotateAgentKey`. Never rotate the key of an agent that has
     connected without asking the user, since its running install
     still uses the old key (which keeps working for 24 hours unless
     `invalidate_immediately` is set).
   - Before handing over the snippet, ask whether the agent host
     reaches the internet through a proxy, a TLS-intercepting proxy
     or a private CA, or has restricted egress or no access to public
     registries. If so, read
     https://docs.use.observer/agent/guides/restricted-networks and
     add what it needs to the snippet: `HTTPS_PROXY`, `HTTP_PROXY`
     and `NO_PROXY` (internal probe targets and Prometheus belong in
     `NO_PROXY`), and `NODE_EXTRA_CA_CERTS` with the CA file mounted
     into the container or present on the host. Never disable TLS
     verification (`SKIP_SSL_VERIFICATION`,
     `NODE_TLS_REJECT_UNAUTHORIZED=0`) as a workaround. The agent
     only dials out to Observer Cloud on port 443; no inbound access
     is needed.
   - Poll `getAgent` until `status` changes from `never_connected` to
     `online` (about a minute after the agent starts). If it stays
     `never_connected`, ask the user to run the `logs_command`.
3. **Dry-run, then apply.** Build the config document with each
   metric's `agent` set to the agent's name. Run `applyConfig` with
   dry-run, show the user the diff, then apply.
4. **Share the page.** `listPages` returns each page's `public_url`
   (the custom domain when one is active, else the subdomain URL)
   and its `access_mode`. Give the user that URL.
5. **Check the metrics.** Read them back with `listMetrics` or
   `getMetric`. A metric in `no_data` carries `reason` (a stable code
   such as `ECONNREFUSED` or `mtls_ref_missing`), `reason_label`, and
   `reason_hint`. Use them to tell the user what to fix on the agent
   host: usually an environment variable that a `*_ref` field in
   `source_config` points at (connection strings, tokens, client
   certificates are resolved on the host and never sent to Observer),
   or network access from that host to the target. `agent_id` null
   means no agent is assigned. `stale: true` means the agent has gone
   quiet.

## Ground rules

1. **Scopes are the boundary.** Every MCP tool except `getMe`
   requires a named scope on the API key. A failed call names the
   missing scope; tell the user to add it rather than retrying. A 403
   that is a plan limit (`quota_exceeded`, `feature_locked`,
   `plan_does_not_permit_api`) is fixed by the plan, not by a key;
   the error includes the upgrade link to pass on.
2. **Read before write.** List and get before you create or patch.
   Ids are UUIDs; never guess one.
3. **Dry-run before apply.** Configuration changes go through
   `applyConfig` (or `observer apply` in the CLI) and both support a
   dry-run that returns a plan. Show the plan to the user before
   committing unless they have explicitly pre-approved.
4. **Never prune without instruction.** Apply with prune deletes
   config-managed resources (those with a `key`) missing from the file. Only use it when the user asks
   for it in that turn, and show the deletion list first.
5. **Agent keys are secrets.** `createAgent` and `rotateAgentKey`
   return an `obs_live_` key once. Hand it to the user inside the
   install command; never write it to files, logs, or memory.
6. **Public means public.** Making an SLO public, publishing an
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
- `listPages` / `getPage` — status pages with `public_url`,
  `access_mode`, custom domain state, and (on `getPage`) their metrics
  in display order.
- `listAgents` / `getAgent` — Observer Agents, whether each is online,
  last heartbeat, version, and how many metrics each runs.
- Metric, service, SLO and page reads carry `config_key` and
  `managed_by` (`config` or `console`); metric reads also carry
  `agent_id` and the `reason` fields described above.
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

Agents: a metric's `agent` must be the exact name of an Observer Agent
in the organization. Apply rejects the whole document (422
`config_invalid`, with `errors` listing each `path` and `message`)
when a name matches no agent or matches two. Create the agent first
with `createAgent`, or fix the name. A metric whose source needs an
agent but names none is accepted with a warning and gets no data.
Heartbeat metrics must not name an agent. The diff shows the agent
each metric resolved to.

Pages: the document controls which metrics a page shows, their group
and order. Per-metric settings edited in the console (public label,
uptime bar) survive an apply. The diff lists page metrics `added`,
`removed`, and `changed`.

Deleting one object: `deleteMetric`, `deleteService`, `deleteSlo`, and
`deletePage` take the object's id or its config key and need
`write:config`. Only config-managed objects can be deleted (409
`not_config_managed` otherwise). If others depend on it, the call
returns 409 `in_use` with `referenced_by`; show the user what would
go and only then repeat with `cascade=true`. A page with a custom
domain returns 409 `custom_domain_attached` (remove the domain in the
console first). Also remove the object from the config document, or
the next apply re-creates it. Prefer this over prune when the user
wants one thing gone.

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
  `source_type: http`, thresholds on response time, and `agent` set to
  an existing agent's name (`listAgents`), dry-run, apply. The agent
  picks the new definition up in about 30 seconds (agent 1.6 and
  later; older agents within five minutes).
- "Why does this metric show no data?" — `getMetric`, then explain
  `reason_label` and `reason_hint`, name the environment variable or
  network path to fix on the agent host, and check the agent with
  `getAgent`.
- "What is my status page URL?" — `listPages` and give `public_url`.
