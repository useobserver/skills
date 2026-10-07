---
name: observer-incidents
description: Run the Observer incident lifecycle. Use when something is down and the user wants to open, update, or resolve an incident on their status page, or post scheduled maintenance. Requires the observer MCP server with write:incidents (and write:maintenances for maintenance windows).
---

# Observer incident response

Incidents are the human channel on a status page: they escalate the
headline verdict while open (they can make it worse than the metrics
say, never better) and annotate the history bars on the day they were
posted.

Keys created by the agent connect flow (see the `observer` skill)
carry read scopes plus `write:config` only. If an incident or
maintenance call fails for a missing write scope, ask the user to
create a key with `write:incidents` (and `write:maintenances`) under
Settings, API keys; do not retry.

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

## Customer targeting

`createIncident`, `patchIncident`, `createMaintenance`, and
`patchMaintenance` accept an optional `customer_targeting` object that
records which customers an update affects:

```json
{
  "customer_targeting": {
    "mode": "selected",
    "customers": ["acme", "6f1c2a9e-4b7d-4e2a-9c1f-2d3b4a5c6d7e"],
    "notify_customer_subscribers": true
  }
}
```

- `mode`: `none` (public subscribers only), `selected` (the listed
  customers), or `all` (every customer).
- `customers`: customer ids or `external_id` values, resolved within
  the organization. Required and non-empty for `selected`; not allowed
  for `none` or `all`.
- `notify_customer_subscribers`: whether the targeted customers'
  linked subscribers are emailed about a public update. Defaults to
  `true`.
- Omit the field to leave targeting as it is. A new incident or
  maintenance starts at `none`.

Errors:

- 400 `invalid_customer_targeting`: unknown mode, `customers` missing
  for `selected`, or present for `none` or `all`.
- 422 `unknown_customers`: a value matches no customer in the
  organization; the response lists the unmatched values. Ask the user
  for the correct id or external_id; never guess one.
- 422 `customer_targeting_conflict`: the update is customer-scoped
  (`visible_to_customer_ids` is set) and targeting is not `selected`
  with exactly those customers. Omit `customer_targeting` to keep the
  two in sync automatically.

## Maintenance

Planned work uses maintenance windows, not incidents:
`createMaintenance` (scheduled window), `startMaintenance`,
`completeMaintenance`, `cancelMaintenance`. A running window shows as
maintenance on the page, distinct from an outage, and suppresses
neither metrics nor other incidents.
