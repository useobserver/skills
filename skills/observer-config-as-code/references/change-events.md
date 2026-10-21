# Change events (deploy markers)

`createChangeEvent` records that something changed. Incident impact
(`getIncidentImpact`) and the signed evidence export list the changes recorded
around an incident's window. They are matched by timing only and never shown
as a cause.

Scope: `write:change_events`. It is not in the default connect preset; the
user creates a key with it under Developers > API keys.

## Fields

| Field | Notes |
|---|---|
| `kind` | `deploy` (default), `commit`, `release`, `k8s_event`, `other` |
| `source` | Where it came from, for example `ci` |
| `ref` | Commit SHA, tag or version |
| `title` | Short description |
| `url` | Link to the run or release; http or https only |
| `service` | Service name to scope the change to |
| `service_id` | Service id; wins over `service`. An unknown id or name is ignored |
| `occurred_at` | ISO 8601 time; defaults to now |
| `dedupe_key` | Idempotency key: a retry with the same key is recorded once |

## From an agent

Confirm the service with `listServices`, then call `createChangeEvent`, for
example `{ "kind": "deploy", "source": "manual", "ref": "v2.4.1",
"service": "Checkout", "title": "Checkout v2.4.1" }`.

## From CI

```yaml
- name: Record deploy in Observer
  if: success()
  env:
    OBSERVER_API_KEY: ${{ secrets.OBSERVER_CHANGE_EVENTS_KEY }}
  run: |
    curl -fsS -X POST https://use.observer/api/v1/change-events \
      -H "Authorization: Bearer $OBSERVER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"kind\":\"deploy\",\"source\":\"github-actions\",\"ref\":\"$GITHUB_SHA\",\"service\":\"Checkout\",\"url\":\"$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID\",\"dedupe_key\":\"$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT\"}"
```

Use a key that holds only `write:change_events` for this step.
