# Common reason codes

The agent attaches a `reason` code to every failed sample. The API adds
`reason_label` and `reason_hint`. This table covers the codes seen most often;
the full list, grouped by source, is at
https://docs.use.observer/agent/reference/reason-codes

## Agent and assignment

| Code | Meaning | Fix |
|---|---|---|
| `stale_agent_silent` | No samples for longer than 3 times the push interval (capped at 15 minutes, or push interval plus 1 minute when that is longer) | Agent stopped or cannot reach Observer; check `getAgent` and its logs |
| `prometheus_url_missing` | The agent has no Prometheus server configured | Set `PROMETHEUS_SERVER_URL` on the agent, or `prometheus_url` in the config |
| `invalid_prometheus_url` | `PROMETHEUS_SERVER_URL` is not a valid URL | Fix the agent's environment |
| `custom_probe_not_found` | No custom probe registered under that name on this agent | Register it in the agent's code, or fix `probe_name` |

## Network

| Code | Meaning | Fix |
|---|---|---|
| `ECONNREFUSED` | The host resolved but refused the connection | Service down, wrong port or firewall, seen from the agent host |
| `ENOTFOUND` | The hostname did not resolve | Check the name and the agent host's DNS |
| `EAI_AGAIN` | Temporary DNS failure | Usually clears on the next sample |
| `EHOSTUNREACH` | No route from the agent to the target | Routing, VPN or firewall |
| `ETIMEDOUT` | No answer within the timeout | Slow or filtered target; raise `timeout_ms` only if slowness is expected |
| `ECONNRESET` | The target closed the connection | Crashing service, proxy, or TLS spoken to a plain port |
| `ConnectionRefused` | Older agents: refused or unresolvable | Check host, port and DNS |

## TLS

| Code | Meaning | Fix |
|---|---|---|
| `CERT_HAS_EXPIRED` | The server certificate has expired | Renew it |
| `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | The agent does not trust the issuer | Set `ca_cert_ref`, or `NODE_EXTRA_CA_CERTS` on the agent |
| `ERR_TLS_CERT_ALTNAME_INVALID` | The certificate does not cover the hostname | Use the right hostname or fix the certificate |
| `mtls_ref_missing` | An mTLS env var named in the config is not set on the agent | Export it and restart the agent |

## Secrets referenced from the agent host

| Code | Meaning | Fix |
|---|---|---|
| `db_dsn_missing` | The `connection_string_ref` variable is not set | Export it for the agent process and restart |
| `header_ref_missing` | A `header_refs` variable is not set or blank | Export it and restart |
| `metadata_ref_missing` | A `metadata_refs` variable is not set or blank | Export it and restart |
| `loki_auth_ref_missing`, `es_auth_ref_missing` | The auth variable is not set | Export it and restart |

## Source answers, but not as expected

| Code | Meaning | Fix |
|---|---|---|
| `unexpected_status:<code>` | HTTP status not in `expected_status` (401 or 403: auth failed) | Fix the URL, auth headers or `expected_status` |
| `body_mismatch` | `body_match` not found in the first 4 KB | Fix the match string or endpoint |
| `json_path_no_match`, `json_path_non_numeric` | `json_path` found nothing, or not a number | Fix the path; test with testProbe |
| `no_data_for_query` | PromQL returned no series | Check metric name and labels against Prometheus |
| `prom_multiple_series` | PromQL returned more than one series | Aggregate to one number |
| `db_empty_result`, `db_multi_row`, `db_non_numeric` | The query did not return exactly one number | Rewrite it to one row, one numeric column |
| `db_auth_failed`, `db_access_denied` | The database rejected the user | Check the credentials and grants of the read-only user |
| `loki_not_aggregation` | LogQL is a log stream, not a metric | Wrap it in `count_over_time`, `rate` or `sum` |
| `es_agg_not_found` | The named aggregation is missing from the response | Fix `agg_name` |
| `icmp_unavailable` | No usable `ping` on the agent host | Install ping, or use the standalone binary instead of the container image |
| `host_metric_unsupported_platform` | The host metric is not available on this OS | For example `network` on macOS |
