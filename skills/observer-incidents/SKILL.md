---
name: observer-incidents
description: Run the Observer incident lifecycle. Use when something is down and the user wants to open, update, or resolve an incident on their status page, read an incident's measured impact, draft a customer update, attach findings as internal notes, export signed incident evidence, or post scheduled maintenance. Requires the observer MCP server with write:incidents (and write:maintenances for maintenance windows); reading impact and exporting evidence need read:incidents.
---

# Observer incident response

Incidents are the human channel on a status page: they escalate the
headline verdict while open (they can make it worse than the metrics
say, never better) and annotate the history bars on the day they were
posted.

Keys created by the agent connect flow, and OAuth connections that
asked for no particular scopes (see the `observer` skill), carry read
scopes plus `write:config` and `write:agents` only. If an incident or
maintenance call fails for a missing write scope, do not retry. Over
OAuth, a client with step-up authorization can ask the user to
approve the missing scopes; otherwise ask the user to create a key
with `write:incidents` (and `write:maintenances`) under Settings, API
keys.

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

## Evidence, drafts and notes

These tools ground what you say about an incident in what Observer
measured. Use them instead of guessing at times, durations or impact.

- **`getIncidentImpact`** (`read:incidents`, read-only). The measured
  impact, computed by Observer from its own records, never by AI: the
  impact window from status changes, affected services, checks and
  customers, SLO error-budget burn, changes recorded around the
  window, which agents and outside-in locations observed it, and data
  coverage. Read it before writing an update or a summary. Related
  changes are listed by **timing only**: never present a deploy or
  change as the cause unless the operator has said so. Low coverage
  means the record has gaps; say so rather than filling them.
- **`draftIncidentUpdate`** (`write:incidents`). An AI draft of the
  next customer update, grounded in that evidence, returned with the
  evidence. It **never publishes**. Optional body: `status`
  (`Investigating`, `Identified`, `Information`, `Resolved`) and
  `severity`. `draft` can be null with a `reason` (for example
  `not_entitled`, `budget_exceeded`, `rate_limited`, `invalid_output`
  when the draft failed the evidence checks). Show the draft to the
  user, let them edit it, and post it with `appendIncidentMessage`
  only after they approve the wording. Never chain draft and post
  without that approval.
- **`addIncidentNote`** (`write:incidents`). Attach findings to the
  incident's internal timeline: `{ "source": "...", "body": "..." }`.
  Set `source` to the tool or agent the finding comes from (for
  example `HolmesGPT`, `AWS DevOps Agent`, or the name of the client
  you run in); it is shown as attribution, up to 80 characters. The
  body is plain text, up to 20,000 characters. Notes are **internal**:
  they never appear on status pages, in subscriber emails or in
  webhooks, and adding one never changes the incident. Use notes for
  investigation findings and `appendIncidentMessage` only for what
  customers should read. An incident holds at most 500 notes;
  `listIncidentNotes` (`read:incidents`) reads them back, oldest
  first.
- **`exportIncidentEvidence`** (`read:incidents`, **Business plan and
  up**). A hashed and signed record of the incident (detection,
  classification, impact window, affected services, customers and
  locations, the public timeline, notification receipts with masked
  recipients, related changes, postmortem link). Use `format=json`
  (the default); `pdf` is for a person downloading the document. The
  envelope carries `sha256`, `signature`, `signing_key_id` and a
  `verify_url` where anyone can check it. Every export is recorded in
  the audit log. A 403 `feature_locked` is the plan: tell the user
  and do not retry. The export maps onto DORA and NIS2 report
  sections, but never tell the user it makes them compliant; see
  https://docs.use.observer/docs/guides/incident-evidence

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
