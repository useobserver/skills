# Customer targeting

`createIncident`, `patchIncident`, `createMaintenance` and `patchMaintenance`
accept an optional `customer_targeting` object. It records which customers an
update affects and whether their linked subscribers are emailed.

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
  customers), `all` (every customer).
- `customers`: customer ids or `external_id` values, resolved within the
  organization. Required and non-empty for `selected`; not allowed for `none`
  or `all`.
- `notify_customer_subscribers`: whether the targeted customers' linked
  subscribers are emailed about a public update. Defaults to `true`.
- Omit the field to keep the current targeting. New incidents and maintenance
  windows start at `none`.

Customer-scoped updates (`visible_to_customer_ids` set) are visible only to
those customers. Public embeds and feeds never show them. For such an update,
targeting must be `selected` with exactly the visible customers; omit
`customer_targeting` and Observer keeps the two in sync.

## Errors

| Error | Cause | What to do |
|---|---|---|
| 400 `invalid_customer_targeting` | Unknown mode, `customers` missing for `selected`, or present for `none` or `all` | Fix the object |
| 422 `unknown_customers` | A value matches no customer; the response lists them | Ask the user for the right id or external_id; never guess |
| 422 `customer_targeting_conflict` | Customer-scoped update whose targeting is not `selected` with exactly those customers | Omit `customer_targeting` |

Confirm the customer list with the user before sending: these updates reach
customers directly.
