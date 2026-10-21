---
name: observer-slos
description: Reads and designs Observer SLOs and error budgets. Reports target, window, remaining budget and burn events, explains "collecting" and negative budgets, picks a realistic target from measured history, chooses unknown_policy and maintenance_policy, and creates or changes SLOs through services[].slos in a config document with a dry run first. Use when the user asks "how is our SLO doing", "how much error budget is left", "why does the budget say collecting", "set a 99.9% SLO on checkout", "is 99.99 realistic", "should missing data count as downtime", "reset this SLO", or "make the SLO public". For contractual SLA statements and credits use observer-sla-report; for planned downtime use observer-maintenance; for the metric behind an SLO showing no data use observer-no-data.
license: ISC
---

# SLOs and error budgets

An SLO says a metric stays healthy for a share of a rolling window. The error
budget is what is left of the allowed non-healthy time. SLOs belong to a
service and measure one metric.

Needs: `read:slos` to read. Creating and changing SLOs uses `applyConfig`
(`write:config`). Plans: none on Free, 3 on Starter, unlimited on Pro and up;
check `getMe` quotas before creating.

## Read an SLO

1. `listSlos`, then `getSlo` for detail. Fields: `target_pct`, `window_days`,
   `error_budget_remaining_pct`, `unknown_policy`, `maintenance_policy`,
   `public`, `last_evaluated_at`, and `latest_burn_event` (`started_at`,
   `ended_at`, `error_budget_burned_pct`).
2. Interpret:
   - Null budget: the SLO is still collecting (first 24 hours of
     observation), or its metric is stale. Not a failure.
   - Below zero: more non-healthy time than allowed; the promise is broken
     right now. It recovers as old bad samples roll out of the window.
   - A burn event opens only when the budget goes negative, the SLO is at
     least one hour old and the window holds at least 10 samples. It closes
     when the budget is back above zero.
3. Budget burns on `unhealthy` samples. `degraded` counts as good.

Report:

```text
<SLO name> on <service>: target <target_pct>% over <window_days> days
Budget left: <error_budget_remaining_pct>% (or collecting)
Burn: <open since ... / last closed ... / none>
Allowance: <window> x (1 - target) = <minutes> per window
```

Allowance example: 99.9% over 30 days allows 43.2 minutes.

## Design or change an SLO

1. **Read the metric.** `getMetric` for thresholds and unit; the SLO inherits
   the metric's verdicts, so fix thresholds first if they are wrong
   (`observer-checks`).
2. **Pick a target from evidence.** `getMetricHistory` (up to 30 days per
   call; use `resolution: 1h` and step back for longer) shows values against
   the unhealthy threshold. Bucket averages hide short spikes, so treat it as
   an estimate. Start near what the service has achieved, not tighter:
   99.5% for a new or unknown service, 99.9% for a stable one, 99.99% only
   with fast remediation. A target tighter than reality burns budget on noise.
3. **Choose the window.** Common: 7, 30 or 90 days (1 to 365 allowed).
4. **Choose `unknown_policy`** for samples without a verdict: `down` (default,
   strictest: counts against the budget), `exclude` (dropped from the math,
   with monitoring coverage disclosed), `up` (only if a contract says so).
5. **Choose `maintenance_policy`:** `exclude` (default: published maintenance
   pauses the budget) or `count`.
6. **Write it under the service**, with `exportConfig` (`all: true`) as the
   base so other entries stay intact:

   ```yaml
   services:
     - key: checkout
       name: Checkout
       slos:
         - key: checkout-availability
           metric: checkout-latency
           target_pct: 99.9
           window_days: 30
           unknown_policy: exclude
   ```

   `metric` may reference an existing metric by key (see
   `observer-config-as-code`).
7. `applyConfig` with `dryRun: true`, show the diff, apply after approval.
8. **Verify:** `getSlo` shows the new values. Expect "collecting" for the
   first 24 hours.

## Rules

- The window starts when the SLO is created. Older metric history neither
  earns nor burns budget.
- Deleting and recreating an SLO is the supported reset, for example after a
  threshold fix made old verdicts wrong. Confirm before deleting
  (`deleteSlo`, config-managed SLOs only), then apply the new one.
- `public: true` shows the SLO to page visitors. Confirm first.
- Never suggest deleting data to improve a number. Exclusion windows (console
  only, with a written reason, audit-logged, listed in evidence) adjust SLA
  attainment, not the live budget. For telemetry gaps consider
  `unknown_policy: exclude`.

## Example requests

- "How's the checkout SLO looking this month?"
- "Add a 99.9% availability SLO for the API over 30 days."
- "Our budget is negative because of a bad threshold last week. What can we do?"
- "Does planned maintenance count against the SLO?"

Concepts: https://docs.use.observer/docs/concepts/slos-and-error-budgets
