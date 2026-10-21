# Config document

`apiVersion: observer/v1` with three lists: `metrics`, `services`, `pages`.
Keys match `^[a-z0-9][a-z0-9-]{0,62}$` and identify an object across applies.

## metrics[]

| Field | Required | Notes |
|---|---|---|
| `key` | yes | Stable id. Apply matches existing metrics by it |
| `title` | yes | Free text, safe to rename |
| `description` | no | |
| `source_type` | yes | See the observer-checks skill for every type |
| `source_config` | yes | Shape depends on `source_type`. Secrets are env var names (`*_ref`) |
| `thresholds` | on create | `healthy_operation`, `healthy_value`, `unhealthy_operation`, `unhealthy_value`. Operators `over` (>), `under` (<), `equal` (=). Not required for heartbeat, manual and alert metrics; heartbeat and alert metrics derive their own |
| `agent` | most types | Exact name of an Observer Agent. Not allowed on heartbeat or alert metrics |
| `interval` | no | Minutes, 1 to 60, default 1 |
| `interval_agent_push` | no | Minutes, 5 to 60, default 15; at least 10 on Free and Starter |
| `dwell_seconds_to_breach` | no | Seconds, 0 to 3600, default 180 (0 for new heartbeat and alert metrics) |
| `dwell_seconds_to_recover` | no | Seconds, 0 to 3600, default 300 (0 for new heartbeat and alert metrics) |

## services[]

| Field | Required | Notes |
|---|---|---|
| `key`, `name` | yes | |
| `description` | no | |
| `metrics` | no | Metric references, or `{ metric }`. Exact member set when present |
| `slos` | no | List of SLOs, below |

### services[].slos[]

| Field | Required | Notes |
|---|---|---|
| `key` | yes | |
| `metric` | yes | Metric reference |
| `target_pct` | yes | Between 0 and 100, exclusive |
| `window_days` | yes | 1 to 365 |
| `name` | no | |
| `public` | no | Shows the SLO publicly; confirm with the user |
| `unknown_policy` | no | `down` (default), `exclude`, `up` |
| `maintenance_policy` | no | `exclude` (default), `count` |

## pages[]

| Field | Required | Notes |
|---|---|---|
| `key` | yes | |
| `subdomain` | yes | `^[a-z0-9-]{3,32}$`, globally unique: `<subdomain>.use.observer` |
| `metrics` | no | References in display order, or `{ metric, group, order }`. The exact list of the page's metrics: leaving it out removes every metric from the page |
| settings | no | `title`, `layout`, `timezone`, `locale`, `allow_subscriptions`, `show_auto_refresh`, `hide_branding`, `footer_links`, `metric_group_order`, `metric_group_summary`, `seo_description`, `seo_noindex`, `theme: { preset }`, and `access_mode: public` only. See the observer-status-page skill |

Settings left out of a page entry keep their current value.

## Metric references

A reference names a metric defined in the same document, or an existing
metric of the organization by its config key, or for a console metric by the
key `exportConfig` with `all: true` gives it: its title slugified, a dash, and
the first six characters of its id (for example `checkout-latency-3f9a1c`).

## Result

`applyConfig` returns `dry_run`, `pruned`, `verbose`, `summary` (counts),
`diff` per bucket (metrics, services, SLOs, pages) with an `action`
of `create`, `update`, `unchanged` or `prune` per entry (metric entries show
the resolved `agent`; service entries show member metrics `added` and
`removed`; page entries show metrics `added`, `removed`, `changed` and the
`settings` that change), `referenced`, and `warnings`.

## Heartbeat metrics in a document

```yaml
metrics:
  - key: nightly-backup
    title: Nightly backup
    source_type: heartbeat
    source_config:
      period_seconds: 86400
      grace_seconds: 1800
```

No `agent`, no `thresholds`. The ping URL is never in the document or the
export.
