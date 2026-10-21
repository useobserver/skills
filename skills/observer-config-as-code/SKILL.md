---
name: observer-config-as-code
description: Manages Observer configuration as a YAML document in version control. Exports current state with exportConfig, edits metrics, services, SLOs and status pages, references existing metrics without redefining them, plans with applyConfig dryRun, applies, deletes single objects, and handles prune with care. Also covers the observer CLI (export, apply --dry-run), the useobserver/cli GitHub Action for plan-on-PR and apply-on-merge, and posting deploy markers with createChangeEvent. Use when the user says "export my Observer config", "put our status page config in git", "apply observer.yaml", "set up CI for Observer", "why did apply delete this", "remove this metric", "mark deploys in Observer", or mentions drift between the console and the file. For designing one check use observer-checks; for first-time setup use observer-setup; for page look and settings only use observer-status-page.
license: ISC
---

# Configuration as code

One document describes metrics, services (with their SLOs) and status pages.
`applyConfig` upserts every object it names by `key` and marks it
config-managed. Objects it does not name are left alone. Incidents,
maintenance, customers and agents are not part of the document.

Needs: `read:config` to export, `write:config` to apply and delete.
Document schema: [references/document.md](references/document.md).

## The loop

1. **Export.** `exportConfig` with `format: yaml`. Add `all: true` to include
   objects made in the console (needed whenever you edit a service's member
   list or a page's metrics, so you keep the existing entries).
2. **Edit.** Change only what the user asked for. Keep keys stable: a new key
   is a new object. Rename with `title`, not `key`.
3. **Plan.** `applyConfig` with `dryRun: true`. The MCP tool returns only the
   entries that change (`verbose: false`); ask for `verbose: true` only if you
   need every entry.
4. **Show the plan.** Summarise `summary`, each create and update, page
   metrics added, removed and changed, settings that change, `referenced`,
   and every item in `warnings`.
5. **Apply** after approval, with the same document and no `dryRun`.
6. **Verify.** Compare the result with the plan, then read back with
   `exportConfig` (or `getMetric`, `getService`, `getPage`). Report any
   difference.

If the apply fails: 422 `config_invalid` carries `errors` with a `path` and
`message` each (for example `metrics[0].thresholds.healthy_value`). Fix those
and plan again. A plan limit is a 403 with an upgrade link; do not retry.

## Rules that catch people out

- **New metrics need all four threshold fields** (heartbeat, manual and
  alert metrics excepted). On update, omitted threshold fields keep their
  stored values.
- **Intervals are whole minutes.** `interval` 1 to 60; `interval_agent_push`
  5 to 60 with a plan floor of 10 on Free and Starter. 300 is rejected with a
  hint that it looks like seconds.
- **`agent` is an exact agent name.** A name matching no agent, or two, fails
  the whole document. A metric that needs an agent but names none is accepted
  with a warning and gets no data. Heartbeat metrics must not name one.
- **`services[].metrics` is the exact member set** when present (`[]`
  removes all members); omit it to leave members alone. A service's metrics
  are its members plus the metrics its SLOs measure.
- **References.** An SLO's `metric` and the `metrics` of a service or page
  may name an existing metric the document does not define: by its config
  key, or for a console metric by the key `exportConfig` with `all: true`
  gives it (`<slugified title>-<first 6 characters of its id>`). Referenced
  metrics are listed under `referenced` and are never created, changed or
  pruned. A reference matching nothing fails validation.
- **SLOs live under `services[].slos`.** A top-level `slos`, `incidents` or
  `maintenances` key is ignored and reported in `warnings`, which never block
  an apply. Relay warnings to the user.
- **Pages** keep per-metric console settings (public label, uptime bar). The
  document controls which metrics show, their group and order, and any page
  settings it names. See `observer-status-page`.
- **Drift.** Editing a config-managed object in the console is undone by the
  next apply: the document wins for the keys it owns.
- **Adoption.** Applying a document that names a console object (after
  `exportConfig` with `all: true`) makes it config-managed.

## Deleting

**One object.** `deleteMetric`, `deleteService`, `deleteSlo` or `deletePage`
with the id or the config key. Confirm with the user first; it cannot be
undone.

- 409 `not_config_managed`: made in the console; delete it there.
- 409 `in_use`: show `referenced_by` to the user and repeat with
  `cascade: true` only after they agree to lose or detach those too.
- 409 `custom_domain_attached` (pages): remove the domain in the console
  first.
- Then remove the object from the document, or the next apply re-creates it.

**Prune.** `applyConfig` with `prune: true` deletes every config-managed
object the document no longer names. Use it only when the user asks for
prune in this conversation. Always run it with `dryRun: true` first, list
every `prune` entry by name, and get an explicit yes. Prefer a single delete
when the user wants one thing gone.

## CLI and CI

The same loop from a terminal or a pipeline:

```bash
export OBSERVER_API_KEY=...          # write:config (read:config for export)
observer export --all --format yaml -o observer.yaml
observer apply -f observer.yaml --dry-run
observer apply -f observer.yaml
```

`--prune` exists on the CLI too; the same rule applies. Exit codes: 0 success,
1 validation failure or error, 2 usage error. Install and the GitHub Action
(plan on pull requests, apply on merge):
[references/github-action.md](references/github-action.md).

Never write an API key into the repository, the workflow file or a log; use
the CI secret store.

## Deploy markers

`createChangeEvent` (`write:change_events`, not in the default preset)
records a deploy, commit or release so incident impact lists changes around
an incident's window. Changes are matched by timing only; they never prove a
cause. Fields and a CI step: [references/change-events.md](references/change-events.md).

## Example requests

- "Export our Observer setup to observer.yaml."
- "Add the new search service to the config and apply it."
- "Set up a GitHub workflow that plans Observer changes on PRs."
- "Delete the old staging-latency metric."
- "Record each production deploy in Observer."

CLI reference: https://docs.use.observer/cli/overview
