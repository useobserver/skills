---
name: observer-heartbeats
description: Monitors cron jobs, backups, batch exports and queue workers with Observer heartbeat checks, and handles manual metrics. Creates a heartbeat metric (period and grace in seconds, optional max run time) through a config document, reads its ping URL, state and recent pings with getMetricHeartbeat, gives the user ping snippets (success, /start, /fail, exit codes), rotates a leaked ping URL with rotateMetricHeartbeatUrl, and sets the status of manual metrics with setManualMetricStatus. Use when the user says "alert me if the nightly backup doesn't run", "monitor this cron job", "dead man's switch", "is the backup job checking in", "the ping URL leaked", "show the last pings", or "mark the vendor status as degraded". For probed checks (HTTP, database and others) use observer-checks; for a heartbeat that stopped arriving through an agent relay use observer-no-data.
license: ISC
---

# Heartbeats and manual metrics

A heartbeat check expects a job to call a private ping URL. Observer marks it
late when the next successful ping does not arrive within the period plus the
grace. No agent is involved: any host that can make an outbound HTTPS request
can ping. Jobs without internet access can ping through an agent's heartbeat
relay (agent 1.6.0 or later).

Needs: `write:config` to create it; `read:metrics` to read it. The ping URL is
only returned to keys that also hold `write:metrics` or `write:config`.
Rotating needs `write:metrics`, which is not in the default preset.

## The ping URL is a credential

Anyone with it can mark the job as succeeded or failed. Give it to the user in
the chat for their CI secret store, Kubernetes Secret or environment
variable. Never write it into a repository, a workflow file, a config
document or a log. It never appears in exports or on status pages.

## Create a heartbeat

1. Ask how often the job should succeed and how late it may be. The schedule
   is an interval in seconds, not a cron expression: a daily 02:00 job is
   `period_seconds: 86400`.
2. Choose `grace_seconds` (0 to 7 days, default 300) to cover normal start
   jitter and run time; for example a nightly backup that takes up to 40
   minutes: period 1 day, grace 1 hour. Add `max_runtime_seconds` only if the
   job will ping `/start`.
3. Add it with a dry run first (see `observer-config-as-code`):

   ```yaml
   metrics:
     - key: nightly-backup
       title: Nightly backup
       source_type: heartbeat
       source_config:
         period_seconds: 86400
         grace_seconds: 3600
   ```

   No `agent` (a heartbeat naming one fails validation) and no `thresholds`
   (derived from period and grace). Put it in a service with
   `services[].metrics` if it should appear under one.
4. Find the metric id with `listMetrics`, then `getMetricHeartbeat` for the
   `ping_url`.
5. Give the user the snippet for their scheduler. Pings accept GET, POST or
   HEAD:

   | URL | Meaning |
   |---|---|
   | `<ping URL>` | Run succeeded |
   | `<ping URL>/start` | Run started (enables run time and max run time) |
   | `<ping URL>/fail` | Run failed |
   | `<ping URL>/<0-255>` | Finished with that exit code; 0 is success |

   ```bash
   /usr/local/bin/backup.sh && curl -fsS -m 10 --retry 3 -o /dev/null "$OBSERVER_PING_URL" \
     || curl -fsS -m 10 --retry 3 -o /dev/null "$OBSERVER_PING_URL/fail"
   ```

   A POST body (first 10 KB kept) is stored with the ping, for example the
   tail of the job log. More snippets (cron, GitHub Actions, Kubernetes
   CronJob, via agent): https://docs.use.observer/docs/guides/heartbeat-monitoring

Verify: after the job's next run, `getMetricHeartbeat` shows the ping in its
last 20 pings and the metric leaves `no_data`.
If it fails: no ping recorded means the job cannot reach
`use.observer` or used the wrong URL (an unknown token returns 404); 429
means over 60 pings a minute.

## Read state

`getMetricHeartbeat` returns the schedule, evaluator state and the last 20
pings, newest first. Status: healthy while the time since the last success is
under period plus grace, degraded exactly at it, unhealthy past it (late),
unhealthy after a failure ping until the next success, and unhealthy while a
started run exceeds its max run time. The metric value is seconds since the
last successful ping. 404 means the metric is not a heartbeat.

## Rotate a leaked URL

`rotateMetricHeartbeatUrl` issues a new URL and the old one stops working at
once, so the check goes late until every job uses the new one. Confirm with
the user and make sure they can update the jobs right away. Then
`getMetricHeartbeat` for the new `ping_url`.

## Manual metrics

`source_type: manual` metrics have no probe and no thresholds. Their status
is set by hand, or follows an open incident on their service.
`setManualMetricStatus` (`write:metrics`) with `status` (`healthy`,
`degraded`, `unhealthy`, `no_data`) and an optional `note`. This changes the
public page at once: confirm first, then verify with `getMetric`. Every
change is audit-logged.

## Example requests

- "Alert me if the nightly Postgres backup doesn't finish by 3am."
- "Give me the ping command for our hourly sync job."
- "Did the backup job check in last night?"
- "Someone posted our heartbeat URL in Slack, replace it."
- "Set the payments provider status to degraded."
