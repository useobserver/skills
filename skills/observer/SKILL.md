---
name: observer
description: Operate Observer (metrics-driven status pages) via its MCP server and CLI. Use when the user asks about their status page, metrics, services, SLOs, error budgets, incidents, maintenance windows, Observer Agents, the audit log, wants to change Observer configuration, or wants to set up or connect to Observer (including when they have no account or API key yet). Covers connecting with OAuth or the device flow, the setup sequence (account and organization check, creating and installing the Observer Agent, testing sources, config apply, sharing the page), diagnosing metrics with no data, reading state, and the export/apply config-as-code loop.
---

# Observer

Observer turns metrics into public status pages. An agent (the data
plane) runs inside the user's network, evaluates thresholds locally,
and pushes verdicts to Observer Cloud. You interact with the cloud
side through the MCP server or the CLI.

## Connecting

If the `observer` MCP server is already configured and its tools
work, skip this section. Never ask the user for their password.

### Prefer OAuth when the MCP client supports it

If you run in an MCP client that supports MCP authorization (OAuth),
add the server with **no header**. The client handles sign-in; no
key passes through you. For Claude Code:

```bash
claude mcp add --transport http observer https://mcp.use.observer/mcp
```

Other clients take the same URL with no `headers` in their MCP
config. Then:

1. The first call gets a 401, and the client opens a browser on
   Observer's authorization page (in Claude Code, the user runs
   `/mcp` and picks `observer`). Tell the user what to expect: sign up
   or sign in, choose the organization, review the listed scopes,
   select Approve. Only an organization owner can approve. An
   organization on Free gets the same one-time 14-day Starter trial
   as the device flow.
2. Confirm with `getMe`.

What to know:

- With no specific scopes requested, the connection gets the same
  preset as the device flow (see below). When a tool needs a scope
  the connection lacks, the server answers 403 `insufficient_scope`
  naming every missing scope. Clients with step-up authorization
  reopen the approval page for those scopes; otherwise tell the user
  which scopes are missing and fall back to an API key with them.
- Access tokens last an hour and the client refreshes them itself;
  refresh tokens rotate on every use. Never copy, print or store the
  tokens.
- Each approval appears as an API key named after the client (for
  example `Claude Code (MCP OAuth)`) under Settings, API keys. Revoking
  it there disconnects the client.
- Adding a server usually needs a client restart, and a restart ends
  the session. The same caution as in step 4 below applies.

Reference: https://docs.use.observer/docs/mcp/oauth

### Otherwise, the device flow

If the client does not support OAuth, or you need a key for the REST
API (`https://use.observer/api/v1`), connect through the device flow:
the user approves one link in their browser and you receive a scoped
API key.

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

1. **`getMe` first, then confirm the organization.** It needs no
   scope and returns the organization (`org.name`, `org.id`), the
   key's scopes, the plan (and `trial_ends_at` during a Starter
   trial), quotas as `used` and `limit` for agents, metrics, services,
   SLOs and status pages, and the rate limits. Tell the user which
   organization the key belongs to and get their confirmation before
   the first write (creating an agent, applying config, changing a
   page). A user in several organizations may have approved the wrong
   one. Plan around the limits instead of finding them through failed
   calls.
2. **Get an Observer Agent, if the metrics need one.** Every metric
   except `source_type: heartbeat` and `manual` runs on an Observer
   Agent inside the user's network.
   - Ask where the agent will run: `docker`, `compose`, `kubernetes`,
     `systemd` (Linux service), `launchd` (macOS service) or `binary`
     (foreground, Linux or macOS).
   - `listAgents` with `name` to find an agent of that name. Reuse it
     only if `connected_ever` is `false` (nothing has ever run with its
     key): call `rotateAgentKey` on it with
     `{ "invalidate_immediately": true }` (no install depends on the
     old key) to get a key. If `connected_ever` is `true`, some install
     uses it, possibly one you cannot see: create a new agent instead
     (a distinct name helps), unless the user tells you to take that
     one over.
   - Otherwise `createAgent` with `{ "name": "..." }` (add
     `prometheus_url` only when it will read PromQL) and the query
     parameter `target=<their target>`. Each agent counts toward the
     plan; a 403 `quota_exceeded` or `feature_locked` is a plan limit,
     so tell the user and pass on the upgrade link rather than
     retrying.
   - The response carries `agent_key` exactly once, `env`, and, with
     `target`, `install.<target>` with the key already filled in. Give
     the user `install.<target>.content` to run, and do not store or
     repeat the key anywhere else. Ask for one target rather than
     `include=install`: every snippet is large and only one is used.
     The `systemd`, `launchd` and `binary` commands pick the right
     binary on the host and clear the macOS quarantine flag
     themselves.
   - Key delivery: by default the key reaches the user through the
     chat, inside the install command. If the user would rather the
     key never pass through the conversation, call `createAgent` (or
     `rotateAgentKey`) with `delivery=claim` instead: the response
     holds no key, only `claim_url`, a single-use console link valid
     for 15 minutes where a signed-in member of the organization
     reveals the key and the install command once. Give the user that
     link. A 503 `claim_unavailable` means the option is off; nothing
     was created, so fall back to the default.
   - If a key is lost before it was used, do not delete and recreate
     the agent: confirm with `getAgent` that `connected_ever` is
     `false`, then `rotateAgentKey` with `invalidate_immediately`.
     Never rotate the key of an agent that has connected without
     asking the user, since its running install still uses the old
     key (which keeps working for 24 hours unless
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
   - Call `getAgent` without `target` or `include` (the small
     response) every 15 to 30 seconds until `status` changes from
     `never_connected` to `online` (about a minute after the agent
     starts); `connected_ever` turns `true` at the same time. If it is
     still `never_connected` after about 3 minutes, ask the user for
     the agent's logs. `getAgent` with `target=<their target>` returns
     `install.<target>.logs_command` where one exists: `docker logs`,
     `kubectl logs`, `journalctl` for systemd, `tail -f
     ~/Library/Logs/observer-agent.log` for launchd. The `binary`
     target has none: it runs in the foreground, so its logs print in
     the terminal that started it.
3. **Test each source before you create its metric.** `testProbe`
   (`write:metrics` or `write:config`) runs a draft `source_type` and
   `source_config` once on the agent (`agent_id`) and stores nothing.
   It returns `value` and its `unit` (`ms`, `%`, `days`, `s`, `B/s`,
   or null for a bare number such as a query result), and with all
   four threshold fields the `status` they would give. Pick
   thresholds in that unit from the measured value. A `reason` means
   the source is wrong or unreachable: fix it before applying. On 202,
   call `getProbeTest` with `job_id` every 3 to 5 seconds. On 409
   `agent_unavailable`, the agent is offline, outdated (it needs
   1.7.0 or later) or not connected yet.
4. **Dry-run, then apply.** Build the config document with each
   metric's `agent` set to the agent's name. `interval` and
   `interval_agent_push` are whole MINUTES, not seconds: `interval`
   1 to 60, `interval_agent_push` 5 to 60 with a plan floor of 10 on
   Free and Starter (5 on Pro and up). Put each metric in its service
   with `services[].metrics` (or through an SLO's `metric`); a service
   has no metrics otherwise. Run `applyConfig` with dry-run, show the
   user the diff, then apply.
5. **Share the page.** `listPages` returns each page's `public_url`
   (the custom domain when one is active, else the subdomain URL)
   and its `access_mode`. Give the user that URL.
6. **Check the metrics.** Read them back with `listMetrics` or
   `getMetric`. A metric in `no_data` has `current_value` null and
   carries `reason` (a stable code such as `ECONNREFUSED`, `ENOTFOUND`
   or `mtls_ref_missing`), `reason_label`, and `reason_hint`. Use them
   to tell the user what to fix on the agent host: usually an
   environment variable that a `*_ref` field in `source_config` points
   at (connection strings, tokens, client certificates are resolved on
   the host and never sent to Observer), or network access from that
   host to the target. `ECONNREFUSED` means the host resolved but
   refused the connection (port closed, service down, firewall);
   `ENOTFOUND` means the name did not resolve. Older agents report both
   as `ConnectionRefused` ("Could not connect"), so check the host, the
   port and DNS. `pending_status` (with `pending_since`) shows a status
   change waiting out its dwell window: `no_data` with
   `pending_status: healthy` is a recovering metric, not a broken one.
   `agent_id` null means no agent is assigned. `stale: true` means the
   agent has gone quiet. Every code:
   https://docs.use.observer/agent/reference/reason-codes

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
   install command; never write it to files, logs, or memory. When the
   user prefers that the key never enter the chat, use
   `delivery=claim` and hand over `claim_url` instead.
6. **Public means public.** Making an SLO public, publishing an
   incident, or changing page access (`updatePage` or a page entry
   with `access_mode: public`, which removes a password, allow-list or
   SSO) affects what visitors see immediately. Confirm intent for
   these.

## Reading state

- `listMetrics` / `getMetric` / `getMetricHistory` — definitions,
  current status, and up to 30 days of aggregated values.
- `listServices` / `getService`, `listSlos` / `getSlo` — services and
  their SLOs; `getSlo` includes the latest burn event. A service's
  `metrics` lists each metric with its `key` and `via`: `member`
  (set with `services[].metrics` or in the console) or `slo` (an SLO
  measures it). A null error
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
  `access_mode`, settings, custom domain state, and (on `getPage`)
  their metrics in display order. `updatePage` changes settings
  (title, layout, timezone, locale, subscriptions, branding, footer
  links, group order and summary, SEO, `theme.preset`, or
  `access_mode: public`); fields not sent keep their value. Read the
  page with `getPage` first.
- `listAgents` / `getAgent` — Observer Agents, whether each is online,
  `connected_ever`, first and last heartbeat, version, and how many
  metrics each runs. Both are small by default; `target` or
  `include=install` add install snippets (with the `${AGENT_KEY}`
  placeholder, never the key).
- Metric reads carry `unit` and `value_description`: `current_value`
  and history values are in that unit.
- `listAuditLog` (`read:audit`, Business plan and up) — the
  organization's audit trail, newest first. Filter with `since`,
  `until` and `action` (exact, or a prefix ending in `.` such as
  `page.`); page with `cursor` set to the previous `next_cursor`
  until it is null. A 403 `feature_locked` is the plan, not the key.
- Incident evidence, AI drafts and internal notes are covered by the
  `observer-incidents` skill.
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
apply or prune unless the document defines them (after
`exportConfig` with `all=true`), which adopts them.

References to existing metrics: an SLO's `metric` and the `metrics` of
a page or a service may name a metric the document does not define,
by its config key or, for a console metric, by the key a full export
gives it (`<slugified title>-<first 6 characters of its id>`). You do
not need to re-send existing metrics to build a page, service or SLO
on them. The result lists them under `referenced`; apply never
creates, changes or prunes them. A reference that matches nothing
fails validation.

Services: `services[].metrics` (metric keys, or `{ metric }`) sets a
service's member metrics. When present it is the exact set (`[]`
removes all); omitted leaves the members as they are. A service's
metrics are its members plus the metrics its SLOs measure.

Intervals: `interval` and `interval_agent_push` are whole minutes
(1 to 60, and 5 to 60 with a plan floor of 10 on Free and Starter).
A value like 300 is rejected with a hint that it looks like seconds.

Diff size: the MCP `applyConfig` tool asks for `verbose=false` by
default, so the diff lists only entries that change (`summary` still
counts unchanged objects). Ask for `verbose=true` only when you need
every entry.

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
`removed`, and `changed`. A page entry may also carry page settings
(`title`, `layout`, `timezone`, `locale`, `allow_subscriptions`,
`show_auto_refresh`, `hide_branding`, `footer_links`,
`metric_group_order`, `metric_group_summary`, `seo_description`,
`seo_noindex`, `theme: { preset }`, and `access_mode: public` only);
settings it leaves out keep their current value, and the diff names
the settings that change. Password, allow-list, JWT, customer-scoped
and SSO access, custom CSS and custom domains stay in the console.

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
- "Add an HTTP check for api.example.com" — `testProbe` with
  `source_type: http` on an online agent to see the response time (in
  `ms`), then add a metric with that source, thresholds in ms, `agent`
  set to the agent's name (`listAgents`), and its key added to the
  `metrics` of the service it belongs to (export with `all=true` first
  so the service entry keeps its other members), dry-run, apply. The
  agent picks the new definition up in about 30 seconds (agent 1.6
  and later; older agents within five minutes).
- "Why does this metric show no data?" — `getMetric`, then explain
  `reason_label` and `reason_hint`, name the environment variable or
  network path to fix on the agent host, and check the agent with
  `getAgent`.
- "What is my status page URL?" — `listPages` and give `public_url`.
- "Send our Alertmanager / Grafana / Datadog / CloudWatch alerts to
  Observer" — inbound alert sources are set up in the console (Alerts,
  Inbound; Starter plan and up), not through the API. Point the user
  there and at
  https://docs.use.observer/docs/guides/inbound-alerts.
