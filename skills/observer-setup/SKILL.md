---
name: observer-setup
description: Sets Observer up end to end for a new user or a new project. Confirms the organization and plan with getMe, gets an Observer Agent installed (reusing one only if it never connected), tests every source with testProbe, builds one config document with metrics, services (including services[].metrics) and a status page, applies it with a dry run first, shares the page URL and checks the first readings. Use when the user says "set up Observer", "set up a status page for our API", "start monitoring our services", "onboard us to Observer", "I just signed up, what now", or pastes the llms.txt setup prompt. For one extra check on an existing setup use observer-checks; to connect a client first use observer-connect; for an existing config file in git use observer-config-as-code.
license: ISC
---

# Set Observer up

Run these steps in order and skip any whose result you already have. Each
step ends with a check; do not move on until it passes or the user decides
otherwise.

Needs: `read:config`, `write:config`, `read:agents`, `write:agents`,
`read:metrics`, `read:services` (the default connect preset). If the tools
are missing, use `observer-connect` first.

## 1. Confirm the organization and the plan

1. `getMe`. Note `org.name`, the plan, `trial_ends_at`, and quotas (`used`
   and `limit` for agents, metrics, services, SLOs, status pages).
2. Tell the user the organization name and ask them to confirm it before the
   first write.
3. Plan around the quotas `getMe` returned (a Starter trial, for example,
   allows 1 status page, 10 services, 50 metrics, 3 agents and 3 SLOs). Do
   not discover limits through failed writes.

Verify: the user confirmed the organization.
If it fails: a 401 means the connection is gone (`observer-connect`).

## 2. Ask what to monitor

Collect, and ask when unknown, rather than guessing:

- The endpoints or systems (URLs, hosts and ports, databases, Prometheus
  queries) and which service each belongs to.
- Where an agent can run inside their network: `docker`, `compose`,
  `kubernetes`, `systemd` (Linux), `launchd` (macOS) or `binary` (Linux or
  macOS, in the foreground).
- Whether that host reaches the internet through a proxy, a TLS-intercepting
  proxy or a private CA, or has restricted egress.
- The status page subdomain they want (`<subdomain>.use.observer`).

Use `observer-checks` to choose each `source_type` and its fields. Heartbeat
and manual metrics need no agent; everything else does.

## 3. Get an Observer Agent

1. `listAgents` with `name` set to the intended agent name.
2. If one exists with `connected_ever: false`, nothing has ever run with its
   key: reuse it with `rotateAgentKey` and
   `{ "invalidate_immediately": true }`, plus `target=<their target>`.
3. If it exists with `connected_ever: true`, an install somewhere uses it.
   Create a new agent with a distinct name, unless the user says to take that
   one over.
4. Otherwise `createAgent` with `{ "name": "..." }` and `target=<their
   target>`. Add `prometheus_url` only if it will run PromQL.
5. Hand over the key:
   - Default: give the user `install.<target>.content`, which has the key
     filled in. Tell them the key is secret and shown once. Do not repeat it,
     store it or write it to a file.
   - If the user does not want the key in the chat: call with
     `delivery=claim` and give them `claim_url` (single use, 15 minutes, opens
     in the console for a signed-in member). A 503 `claim_unavailable` means
     the option is off and nothing was created; fall back to the default.
6. For a proxy, private CA or restricted egress, add `HTTPS_PROXY`,
   `HTTP_PROXY`, `NO_PROXY` and `NODE_EXTRA_CA_CERTS` as described in
   https://docs.use.observer/agent/guides/restricted-networks . Never disable
   TLS verification as a workaround. The agent only needs outbound HTTPS.

Verify: `getAgent` (no `target`, small response) every 15 to 30 seconds until
`status` is `online` and `connected_ever` is `true`, usually about a minute
after the agent starts.
If it fails: still `never_connected` after about 3 minutes, ask for the logs.
`getAgent` with `target=<their target>` returns
`install.<target>.logs_command` (the `binary` target logs to its terminal).
A 403 `quota_exceeded` is the plan's agent limit: reuse or delete an agent,
or upgrade. If the key was lost before use, do not recreate the agent:
confirm `connected_ever: false` and rotate with `invalidate_immediately`.
More in `observer-agent`.

## 4. Test every source before creating its metric

For each check, `testProbe` with `agent_id`, `source_type`, `source_config`
and, once you have them, the four threshold fields.

- Read `value` and `unit` (`ms`, `%`, `days`, `s`, `B/s`, or none for a bare
  number) and pick thresholds in that unit from the measured value.
- A `reason` instead of a value means the source is wrong or unreachable from
  the agent: fix it now (see `observer-no-data` for the codes).
- 202: poll `getProbeTest` with `job_id` every 3 to 5 seconds.
- 409 `agent_unavailable`: the agent is offline, not connected yet, revoked
  or older than 1.7.0.

Verify: every check returned a value, and with thresholds the expected
`status`.

## 5. Build the document, dry run, apply

Build one document. Every new metric needs `thresholds` with all four fields
(heartbeat, manual and alert metrics excepted). Intervals are whole minutes.

```yaml
apiVersion: observer/v1
metrics:
  - key: api-health
    title: API health
    agent: prod-eu
    source_type: http
    source_config: { url: "https://api.example.com/health" }
    thresholds:
      healthy_operation: under
      healthy_value: 400
      unhealthy_operation: over
      unhealthy_value: 1500
    interval: 1
    interval_agent_push: 10
services:
  - key: api
    name: API
    metrics: [api-health]
pages:
  - key: status
    subdomain: acme-status
    title: Acme status
    metrics:
      - { metric: api-health, group: API }
```

Notes:

- Put each metric in its service with `services[].metrics`; a service has no
  metrics otherwise (apart from those its SLOs measure).
- `agent` is the exact agent name. An unknown or duplicated name fails the
  whole document with 422 `config_invalid`.
- With a value exactly on a threshold, neither rule matches and the metric
  is degraded. Leave no gap you did not intend.

1. `applyConfig` with `dryRun: true`. Show the user the diff (`summary`,
   created and updated entries, the agent each metric resolved to,
   `warnings`).
2. After approval, `applyConfig` without `dryRun`. Never set `prune` during
   setup.

Verify: the apply result matches the dry run. Then `listMetrics` shows each
new metric with its `agent_id`.
If it fails: 422 `config_invalid` lists each `path` and `message`; fix and
dry run again. A plan limit is a 403 with an upgrade link.

## 6. Share the page and check the first readings

1. `listPages` and give the user `public_url`.
2. After a few minutes, `listMetrics`. The agent picks up new definitions in
   about 30 seconds (agent 1.6 and later). For any metric in `no_data`, use
   `observer-no-data`.

## Output

```text
Observer is set up for <org>
Status page: <public_url>
Agent: <name> (<status>)
Metrics: <n> created; <list any in no_data with the reason>
Next: <SLOs, alerts in the console, incidents scopes, as relevant>
```

## Rules

- Confirm the organization before the first write.
- `testProbe` before every new metric; dry run before every apply.
- No `prune`, no deletes during setup.
- Pages are public by default. Say so before you apply the first page.
- Do not restart the client between creating an agent and the user saving
  its install command.

## Example requests

- "Set up Observer for me. Instructions: https://use.observer/llms.txt"
- "Put a status page in front of api.example.com and our Postgres."
- "We run everything on Kubernetes; get Observer monitoring checkout."
