---
name: observer-incidents
description: Run the Observer incident lifecycle. Use when something is down and the user wants to open, update, or resolve an incident on their status page, or post scheduled maintenance. Requires the observer MCP server with write:incidents (and write:maintenances for maintenance windows).
---

# Observer incident response

Incidents are the human channel on a status page: they escalate the
headline verdict while open (they can make it worse than the metrics
say, never better) and annotate the history bars on the day they were
posted.

## Lifecycle

1. **Draft.** `draftIncidentFromMetric` pre-fills title, severity, and
   affected services from a failing metric's current state, and is
   idempotent for 30 minutes (safe to call twice during a noisy page).
   For non-metric events use `createIncident` with `published: false`.
2. **Review with the operator.** Title and severity are what
   subscribers read; confirm the wording before publishing.
3. **Publish.** `publishIncident`. Subscribers are notified through
   the page's channels; the headline escalates immediately.
4. **Update.** `appendIncidentMessage` for each meaningful change.
   Short, factual messages beat silence; a message whose status is
   Resolved auto-resolves the parent incident.
5. **Resolve.** `resolveIncident` with an optional final message. The
   incident leaves the headline and stays in history permanently.

## Judgment calls

- Severity: critical means the product is unusable, major means a core
  flow is broken for many users, minor is everything else. When in
  doubt, pick lower and update; escalating reads better than walking
  back.
- Do not open an incident for a metric that is merely `no_data` or
  Delayed: that usually means the monitoring pipeline is blind, not
  that the service is down. Check `listMetrics` for unhealthy status
  and real values first.
- Customer-scoped pages: incidents can be limited to specific
  customers via `patchIncident` visibility. Public embeds and feeds
  never show customer-scoped incidents.

## Maintenance

Planned work uses maintenance windows, not incidents:
`createMaintenance` (scheduled window), `startMaintenance`,
`completeMaintenance`, `cancelMaintenance`. A running window shows as
maintenance on the page, distinct from an outage, and suppresses
neither metrics nor other incidents.
