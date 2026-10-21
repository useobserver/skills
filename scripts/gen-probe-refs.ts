// Regenerates skills/observer-checks/references/<source_type>.md, one file per
// probe type, from the probe-config package in the Observer monorepo.
//
// Usage: bun scripts/gen-probe-refs.ts <path to the Observer monorepo>
//
// Field tables (types, defaults, limits, required fields) come from the Zod
// schemas in packages/probe-config/src, converted to JSON Schema with the same
// options the public API uses. Value units come from units.ts. Which types
// testProbe accepts comes from the MCP tool list. The short notes per type
// below are written by hand for rules a JSON Schema cannot express (fields
// that must appear together, auth modes). Keep them in step with the
// refinements in schemas.ts.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("usage: bun scripts/gen-probe-refs.ts <observer-monorepo-path>");
  process.exit(2);
}

const pcDir = resolve(root, "packages/probe-config/src");
const pc = await import(join(pcDir, "index.ts"));
const { z } = await import(Bun.resolveSync("zod", pcDir));
const toolsMod = await import(resolve(root, "apps/observer-mcp/generated/tools.ts"));
const testProbe = (toolsMod.TOOLS as any[]).find((t) => t.name === "testProbe");
const TESTABLE: string[] = testProbe?.inputSchema?.properties?.source_type?.enum ?? [];

const outDir = join(import.meta.dir, "..", "skills", "observer-checks", "references");
mkdirSync(outDir, { recursive: true });

// Types that never run on an Observer Agent.
const AGENTLESS = new Set(["heartbeat", "manual", "alert"]);
// Types whose status does not come from thresholds you write.
const NO_THRESHOLDS = new Set(["heartbeat", "manual", "alert"]);
// Deprecated alias, documented inside http.md instead of its own file.
const SKIP = new Set(["mtls_http"]);

const ENV_REF = "^[A-Z][A-Z0-9_]*$";

interface Note {
  title: string;
  summary: string;
  rules?: string[];
  example?: Record<string, unknown>;
}

const NOTES: Record<string, Note> = {
  prometheus: {
    title: "Prometheus (PromQL)",
    summary: "Runs a PromQL instant query on the agent and reports the scalar result. The agent reads `PROMETHEUS_SERVER_URL` (and its auth variables) from its own environment unless `prometheus_url` is set here.",
    rules: [
      "The query must return a single number. A query that returns no series reports `no_data` with reason `no_data_for_query`.",
      "Create the agent with `prometheus_url` (or set `PROMETHEUS_SERVER_URL` on the host) when it reads PromQL.",
    ],
    example: { query: 'sum(rate(http_requests_total{job="api",code=~"5.."}[5m])) / sum(rate(http_requests_total{job="api"}[5m])) * 100' },
  },
  http: {
    title: "HTTP and HTTPS",
    summary: "Sends one request and reports the response time in milliseconds, or, with `json_path`, a number read from the JSON response.",
    rules: [
      "`url` must be http or https and must not carry `user:pass@`. Put credentials in `header_refs`.",
      "`headers` are stored by Observer, so a header whose name looks like a credential (Authorization, Cookie, anything with token, secret, key, auth, session) is rejected there. Map it in `header_refs` to an env var name on the agent host instead.",
      "A header name may not appear in both `headers` and `header_refs`.",
      "Mutual TLS: set `client_cert_ref` and `client_key_ref` together (env vars holding PEM text or a path to a PEM file). `ca_cert_ref` is optional.",
      "`expected_status` takes one code or a list. A different status reports `no_data` with an `unexpected_status:<code>` reason.",
      "`body_match` checks the first 4 KB of the body for a string.",
      "The `mtls_http` source type is a deprecated alias of `http`. Use `http` with the `*_ref` fields.",
    ],
    example: { url: "https://api.example.com/health", expected_status: 200, timeout_ms: 5000 },
  },
  tcp: {
    title: "TCP connect",
    summary: "Opens a TCP connection and reports the connect time in milliseconds.",
    example: { host: "db.internal", port: 5432 },
  },
  dns: {
    title: "DNS resolution",
    summary: "Resolves a name and reports the resolve time in milliseconds.",
    rules: ["`expected_value` makes the check fail when the answer does not contain it.", "`resolver` sends the query to a specific DNS server instead of the host's default."],
    example: { domain: "api.example.com", record_type: "A" },
  },
  icmp: {
    title: "ICMP ping",
    summary: "Pings a host and reports latency, packet loss or reachability, chosen by `interpretation`.",
    rules: [
      "Needs the system `ping` and the NET_RAW capability on the agent host. The published container image has no `ping`, so icmp reports `no_data` there; use the standalone binary or a custom image.",
      "`host` is a hostname or IPv4 address and may not start with `-`.",
    ],
    example: { host: "gateway.internal", count: 3, interpretation: "packet_loss" },
  },
  tls_cert: {
    title: "TLS certificate expiry",
    summary: "Connects with TLS and reports the days until the certificate expires.",
    rules: [
      "`warn_days` must be at least `critical_days`.",
      "Thresholds still decide status: for example healthy `over` 30, unhealthy `under` 7.",
    ],
    example: { host: "api.example.com", port: 443 },
  },
  grpc: {
    title: "gRPC health check",
    summary: "Calls the standard gRPC health service (grpc.health.v1.Health/Check). Reports 1 for SERVING and 0 for NOT_SERVING, or the round trip in milliseconds with `interpretation: latency`.",
    rules: [
      "Only the health checking protocol is supported, not arbitrary methods. Leave `service` empty to check the whole server.",
      "`tls_mode: mtls` needs `client_cert_ref` and `client_key_ref`.",
      "`metadata` is stored by Observer, so credential-looking keys are rejected there. Put secrets in `metadata_refs` (key to env var name). Keys starting with `grpc-` and binary `-bin` keys are not allowed.",
    ],
    example: { host: "orders.internal", port: 50051, tls_mode: "plaintext" },
  },
  websocket: {
    title: "WebSocket",
    summary: "Opens a WebSocket and reports handshake time, message round trip, or whether the socket opened, chosen by `interpretation`.",
    rules: [
      "`url` must start with `ws://` or `wss://`.",
      "`interpretation: round_trip_latency` needs `ping_mode: message` and a `send_message`. `expect_message`, when set, must appear in the reply.",
      "Secret handshake headers go in `header_refs`, as for http.",
    ],
    example: { url: "wss://realtime.example.com/socket", interpretation: "handshake_latency" },
  },
  database: {
    title: "Database query",
    summary: "Runs one read-only query against Postgres, MySQL, Redis or MongoDB and reports the single number it returns.",
    rules: [
      "`connection_string_ref` is the name of an env var on the agent host holding the full connection URL. The URL never reaches Observer. Use a read-only database user.",
      "postgres and mysql: one SELECT (or WITH ... SELECT) statement returning one row with one column. No semicolons, no writes.",
      "redis: one read-only command from this list: __REDIS__.",
      'mongodb: a JSON spec using `countDocuments` or `estimatedDocumentCount`, for example `{"db":"shop","collection":"orders","op":"countDocuments","filter":{"status":"pending"}}`. `$where`, `$function`, `$accumulator` and `$expr` are rejected.',
    ],
    example: { kind: "postgres", connection_string_ref: "OBSERVER_PG_DSN", query: "SELECT count(*) FROM jobs WHERE state = 'failed' AND created_at > now() - interval '15 minutes'" },
  },
  otlp: {
    title: "OTLP push",
    summary: "The agent receives OpenTelemetry metrics over OTLP/HTTP (JSON) and reports the latest matching data point, aggregated by `aggregation`.",
    rules: [
      "Senders push to the agent's receiver (default `127.0.0.1:4318`). Binding it beyond loopback needs `OBSERVER_OTLP_BEARER_TOKEN` on the agent.",
      "A metric with no data point newer than `staleness_ms` reports `no_data`.",
      "Cannot be run with testProbe: nothing is pushed during a test.",
    ],
    example: { metric_name: "http.server.duration", attribute_filters: { "service.name": "checkout" }, aggregation: "p95" },
  },
  cloudwatch: {
    title: "Amazon CloudWatch",
    summary: "Reads the latest datapoint of one CloudWatch metric with the agent host's AWS credentials.",
    rules: [
      "`statistic` is Average, Sum, Minimum, Maximum, SampleCount, or a percentile such as p95 or p99.9.",
      "`period_seconds` is 60, 300, 900 or 3600.",
      "`role_arn` (and optional `external_id`) assumes a role from the host's credentials for cross-account reads.",
    ],
    example: { region: "eu-west-1", namespace: "AWS/RDS", metric_name: "CPUUtilization", dimensions: { DBInstanceIdentifier: "prod-db" }, statistic: "Average" },
  },
  loki: {
    title: "Loki (LogQL)",
    summary: "Runs a LogQL metric query and reports the single number it returns. Log lines are never stored.",
    rules: [
      "The query must be an aggregation such as `count_over_time`, `rate` or `sum(...)`, not a raw log stream.",
      "`auth_mode: bearer` needs `token_ref`; `auth_mode: basic` needs `username` and `password_ref`.",
      "`tenant_id` sets the Loki tenant for multi-tenant setups.",
    ],
    example: { base_url: "http://loki.internal:3100", query: 'sum(count_over_time({app="api"} |= "ERROR" [5m]))' },
  },
  elasticsearch: {
    title: "Elasticsearch and OpenSearch",
    summary: "Runs one search with an aggregation and reports the value of the named aggregation. Documents are never stored.",
    rules: [
      "`query` is the search body and must contain an `aggs` (or `aggregations`) block. `agg_name` names the aggregation to read; `percentile` picks a key from a percentiles aggregation.",
      "`auth_mode: bearer` needs `token_ref`; `basic` needs `username` and `password_ref`; `api_key` needs `api_key_ref`.",
    ],
    example: { base_url: "https://es.internal:9200", index: "logs-*", query: { query: { match: { level: "error" } }, aggs: { errors: { value_count: { field: "_id" } } } }, agg_name: "errors" },
  },
  custom: {
    title: "Custom probe",
    summary: "Runs a probe function registered by name in the agent's own code. Observer stores only the name and an opaque config object.",
    rules: ["The function must be registered on the agent that runs the metric.", "Cannot be run with testProbe."],
    example: { probe_name: "queue-depth", probe_config: { queue: "emails" } },
  },
  host: {
    title: "Host vitals",
    summary: "Reads CPU, memory, disk, network or load from the host the agent runs on. No endpoint and no credentials.",
    rules: [
      "Linux gives the fullest values. On macOS memory values are coarser and `network` reports `no_data`.",
    ],
    example: { metric: "filesystem", mountpoint: "/" },
  },
  manual: {
    title: "Manual status",
    summary: "No probe. Status is set by hand with setManualMetricStatus, in the console, or by an open incident on a service that contains the metric.",
    rules: ["No agent and no thresholds.", "Use it for signals nothing measures, such as a vendor's own status."],
    example: {},
  },
  heartbeat: {
    title: "Heartbeat (cron and job pings)",
    summary: "No probe. A job calls a private ping URL; Observer marks the metric late when the next successful ping does not arrive within the period plus the grace.",
    rules: [
      "Must not name an `agent`; thresholds are derived from `period_seconds` and `grace_seconds`.",
      "The schedule is an interval in seconds, not a cron expression: a daily job is 86400.",
      "The ping URL is a credential and is never part of a config document. Read it with getMetricHeartbeat; see the observer-heartbeats skill.",
    ],
    example: { period_seconds: 86400, grace_seconds: 1800 },
  },
  alert: {
    title: "Inbound alerts",
    summary: "No probe. Status follows alerts that inbound alert sources (Alertmanager, Grafana, Datadog, CloudWatch, generic JSON) route to the metric: a firing alert makes it unhealthy or degraded.",
    rules: ["Inbound sources and their routing rules are set up in the console, not through the API.", "No agent and no thresholds."],
    example: {},
  },
};

function typeOf(p: any): string {
  if (p.enum) return "enum";
  if (p.anyOf) return p.anyOf.map(typeOf).join(" or ");
  if (p.type === "array") return `array of ${p.items ? typeOf(p.items) : "any"}`;
  if (p.type === "object") return "object";
  return p.type ?? "any";
}

function limits(p: any): string {
  const out: string[] = [];
  const safe = (n: unknown) => typeof n === "number" && Math.abs(n) < Number.MAX_SAFE_INTEGER;
  if (p.enum) out.push(p.enum.map((v: unknown) => `\`${v}\``).join(", "));
  if (safe(p.minimum) && safe(p.maximum)) out.push(`${p.minimum} to ${p.maximum}`);
  else if (safe(p.minimum)) out.push(`at least ${p.minimum}`);
  else if (safe(p.maximum)) out.push(`at most ${p.maximum}`);
  if (p.pattern === ENV_REF) out.push("env var name on the agent host (UPPER_SNAKE_CASE)");
  else if (p.maxLength) out.push(`up to ${p.maxLength} characters`);
  if (p.format === "uri") out.push("URL");
  if (p.type === "object" && p.additionalProperties?.pattern === ENV_REF) out.push("values are env var names on the agent host");
  if (p.anyOf) {
    const inner = p.anyOf.map(limits).filter(Boolean);
    if (inner.length) out.push(inner.join("; "));
  }
  if (p.type === "array" && p.items) {
    const inner = limits(p.items);
    if (inner) out.push(`items ${inner}`);
  }
  return out.join("; ");
}

function unitLines(type: string): string[] {
  const entry = (pc.PROBE_VALUE_UNITS as Record<string, any>)[type];
  if (!entry) return [];
  const fmt = (u: { unit: string | null; description: string }) => `${u.unit ? `\`${u.unit}\`` : "no unit"}: ${u.description}`;
  if (entry.variants) {
    return Object.entries(entry.variants.values).map(
      ([k, v]: [string, any]) => `- \`${entry.variants.field}: ${k}\`${k === entry.variants.default ? " (default)" : ""}: ${fmt(v)}`,
    );
  }
  const lines = [`- ${fmt(entry)}`];
  if (entry.jsonPath) lines.push(`- with \`json_path\` set: ${fmt(entry.jsonPath)}`);
  return lines;
}

function esc(s: string) {
  return s.replace(/\|/g, "\\|");
}

for (const f of readdirSync(outDir)) if (f.endsWith(".md")) rmSync(join(outDir, f));

const written: string[] = [];
for (const type of pc.PROBE_TYPES as string[]) {
  if (SKIP.has(type)) continue;
  const note = NOTES[type];
  if (!note) throw new Error(`no NOTES entry for probe type ${type}; add one`);
  const schema = z.toJSONSchema(pc.getConfigSchema(type), { io: "input", unrepresentable: "any" }) as any;
  const props = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);

  const lines: string[] = [];
  lines.push(`# ${note.title} (\`source_type: ${type}\`)`);
  lines.push("");
  lines.push("<!-- Generated by scripts/gen-probe-refs.ts from packages/probe-config. Do not edit by hand. -->");
  lines.push("");
  lines.push(note.summary);
  lines.push("");
  lines.push(`- Runs on: ${AGENTLESS.has(type) ? "Observer Cloud, no agent (do not set `agent`)" : "an Observer Agent (set the metric's `agent` to its name)"}`);
  lines.push(`- Thresholds: ${NO_THRESHOLDS.has(type) ? "not used" : "required when the metric is created (all four fields)"}`);
  lines.push(`- testProbe: ${TESTABLE.includes(type) ? "supported" : "not supported"}`);
  lines.push("");
  const units = unitLines(type);
  if (units.length) {
    lines.push("## Value and unit");
    lines.push("");
    lines.push(...units);
    lines.push("");
  }
  lines.push("## source_config fields");
  lines.push("");
  const names = Object.keys(props);
  if (names.length === 0) {
    lines.push("None. `source_config` is `{}`.");
  } else {
    lines.push("| Field | Required | Type | Default | Limits |");
    lines.push("|---|---|---|---|---|");
    for (const name of names) {
      const p = props[name];
      const def = p.default === undefined ? "" : `\`${JSON.stringify(p.default)}\``;
      lines.push(`| \`${name}\` | ${required.has(name) ? "yes" : "no"} | ${esc(typeOf(p))} | ${esc(def)} | ${esc(limits(p))} |`);
    }
  }
  lines.push("");
  if (note.rules?.length) {
    lines.push("## Rules");
    lines.push("");
    for (const r of note.rules) lines.push(`- ${r.replace("__REDIS__", (pc.REDIS_ALLOWED_COMMANDS as string[]).join(", "))}`);
    lines.push("");
  }
  lines.push("## Example");
  lines.push("");
  lines.push("```yaml");
  lines.push(`source_type: ${type}`);
  lines.push(`source_config: ${JSON.stringify(note.example ?? {})}`);
  lines.push("```");
  lines.push("");
  writeFileSync(join(outDir, `${type}.md`), lines.join("\n"));
  written.push(type);
}
console.log(`wrote ${written.length} files to ${outDir}: ${written.join(", ")}`);
