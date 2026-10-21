---
name: observer-checks
description: Designs, tests and changes individual Observer checks (metrics). Picks the source_type (http, tcp, dns, icmp, tls_cert, grpc, websocket, database, prometheus, otlp, cloudwatch, loki, elasticsearch, host, custom, heartbeat, manual, alert), fills source_config from the per-type reference, keeps secrets as env var references on the agent host, runs testProbe, and sets thresholds in the reported unit with strict operators. Use when the user says "add a check for", "monitor this URL", "watch our Postgres queue depth", "alert when the cert expires in 14 days", "what thresholds should I use", "make this check less noisy", or "change the interval". For first-time setup use observer-setup; for a metric that shows no data use observer-no-data; for cron job pings use observer-heartbeats; for managing a whole config file in git use observer-config-as-code.
license: ISC
---

# Design and change checks

A check is a metric: a `source_type`, its `source_config`, four threshold
fields, intervals, and (for most types) the Observer Agent that runs it.
Metrics are created and changed with `applyConfig` (`write:config`) and tested
with `testProbe` (`write:metrics` or `write:config`).

## 1. Choose the source type

| What to watch | source_type | Value |
|---|---|---|
| A URL answering (latency) or a number in a JSON response | [http](references/http.md) | ms, or the JSON number |
| A port accepting connections | [tcp](references/tcp.md) | ms |
| A name resolving, or resolving to a value | [dns](references/dns.md) | ms |
| Reachability, latency or packet loss of a host | [icmp](references/icmp.md) | ms, %, or 1/0 |
| Days until a TLS certificate expires | [tls_cert](references/tls_cert.md) | days |
| A gRPC service's health | [grpc](references/grpc.md) | 1/0 or ms |
| A WebSocket endpoint | [websocket](references/websocket.md) | ms or 1/0 |
| A number from a SQL, Redis or MongoDB query | [database](references/database.md) | as queried |
| A PromQL expression | [prometheus](references/prometheus.md) | as queried |
| OpenTelemetry metrics pushed to the agent | [otlp](references/otlp.md) | as sent |
| An AWS CloudWatch metric | [cloudwatch](references/cloudwatch.md) | CloudWatch unit |
| A count or rate from Loki logs | [loki](references/loki.md) | as queried |
| An aggregation over Elasticsearch or OpenSearch | [elasticsearch](references/elasticsearch.md) | as queried |
| CPU, memory, disk, network or load of the agent host | [host](references/host.md) | %, B/s or ratio |
| A probe function in the agent's own code | [custom](references/custom.md) | its own |
| A cron job or scheduled task checking in | [heartbeat](references/heartbeat.md) | s since last ping |
| A status someone sets by hand | [manual](references/manual.md) | none |
| Alerts from Alertmanager, Grafana, Datadog and others | [alert](references/alert.md) | 0, 1 or 2 |

Read the reference for the chosen type before writing `source_config`. The
references are generated from the same schemas Observer validates with.

## 2. Keep secrets on the agent host

`source_config` is stored by Observer, so it never holds a secret. Every
credential is the NAME of an environment variable on the agent host:
`connection_string_ref`, `header_refs`, `metadata_refs`, `client_cert_ref`,
`client_key_ref`, `ca_cert_ref`, `token_ref`, `password_ref`, `api_key_ref`.
Tell the user which variable to set on the host and never ask them to paste
the secret to you. A URL with `user:pass@` and a credential-looking inline
header are rejected.

## 3. Test before you create

1. Find an online agent: `listAgents`, pick `status: online`.
2. `testProbe` with `agent_id`, `source_type`, `source_config`.
3. Read `value`, `unit` and `value_description`. A `reason` (with
   `reason_label` and `reason_hint`) means the source failed: fix it before
   going on.
4. 202: poll `getProbeTest` with `job_id` every 3 to 5 seconds. 409
   `agent_unavailable`: the agent is offline, not connected, revoked or older
   than 1.7.0.
5. Without `agent_id`, only a public http check can be tested, from Observer's
   cloud; `header_refs` are not sent then, and the result may differ from what
   the agent sees.

`otlp`, `custom`, `manual`, `heartbeat` and `alert` cannot be tested.

## 4. Set thresholds

- Thresholds are in the unit `testProbe` reported. For http that is
  milliseconds, for tls_cert days, for a query result whatever the query
  returns.
- Operators are strict: `over` is `>`, `under` is `<`, `equal` is `=`.
- Evaluation per sample: healthy rule matches, then healthy; else unhealthy
  rule matches, then unhealthy; else degraded. The band between the two
  values is degraded, and so is a value exactly on either threshold.
- Start from the measured value with headroom. Example: http measured 140 ms;
  healthy `under` 500, unhealthy `over` 2000. Lower is better, so healthy is
  `under`; for "higher is better" values (days to expiry, 1 for SERVING)
  healthy is `over`.
- For 1/0 values: healthy `over` 0.5, unhealthy `under` 0.5, so 1 is healthy
  and 0 unhealthy.
- All four fields are required when a metric is created through config. On
  update, omitted fields keep their stored values.
- `dwell_seconds_to_breach` (default 180) and `dwell_seconds_to_recover`
  (default 300), 0 to 3600 seconds, hold a status change until it has lasted
  that long. Raise them to stop flapping rather than widening thresholds.

## 5. Intervals

Whole minutes, never seconds. `interval` (how often the agent samples) 1 to
60, default 1. `interval_agent_push` (how often it sends samples; a status
change is sent at once) 5 to 60, default 15, plan floor 10 on Free and
Starter, 5 on Pro and up. A value like 300 is rejected as seconds.

## 6. Create or change the metric

1. Read first. For a change: `exportConfig` with `all: true` and find the
   metric's entry (its key). For a new metric: check `getMe` quota.
2. Classify the change:
   - Cosmetic (title, description): apply after a dry run.
   - Behavioural (thresholds, intervals, source, agent, dwell): show the old
     and new values side by side and get approval first. They change what the
     status page shows. When unsure, treat a change as behavioural.
3. Build a document with just the entries you touch. Reference the service by
   adding the metric key to `services[].metrics`, and remember that list is
   the exact member set: copy the service's existing members from the export.
4. `applyConfig` with `dryRun: true`, show the diff, then apply.

An existing metric cannot switch to or from `heartbeat`; create a new key.

Verify: `getMetric` (or `listMetrics`) shows the new definition and thresholds.
The agent picks the change up in about 30 seconds (agent 1.6 and later; older
agents within five minutes). Check the first value after the next interval.
If it fails: a 422 lists each field path; a source error after creation is
`observer-no-data`.

## Example requests

- "Add a check that our checkout API answers in under 300 ms."
- "Alert when the certificate on api.example.com has less than 14 days left."
- "Watch the number of failed jobs in Postgres."
- "This check flaps every night; calm it down."

Concepts: https://docs.use.observer/docs/concepts/thresholds-and-dwell and
https://docs.use.observer/docs/reference/threshold-operators
