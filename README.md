<p align="center">
    <img src="assets/headline.png" alt="Observer Skills" height="100%">
</p>

<p align="center">
  <a href="https://status.use.observer"><img src="https://status.use.observer/badge.svg?style=for-the-badge" alt="Observer Cloud live status"></a>
</p>

# Observer skills

Agent skills and MCP setup for [Observer](https://use.observer), the
metrics-driven status page platform. This repository teaches AI
assistants (Claude, Cursor, or any MCP-compatible client) to operate
Observer on your behalf: set up status pages, create and install the
Observer Agent, read metrics and SLOs, manage incidents, and apply
configuration as code.

## Connect the MCP server

Observer runs a remote MCP server at `https://mcp.use.observer/mcp`.

### Let the agent connect itself

The quickest way, even without an Observer account, is to paste this
into your agent:

```text
Set up Observer for me. Instructions: https://use.observer/llms.txt
```

The agent starts a device-flow request (`POST /api/connect/device`),
shows you a short code and a link, and waits while you sign up or sign
in and approve. It then receives a scoped API key and configures the
MCP server itself. The key can manage status pages, services, metrics
and SLOs, create Observer Agents, and read status and incidents. From
there the agent checks your plan with `getMe`, creates the Observer
Agent your checks need and gives you its install command, applies the
configuration after a dry run, and shares your status page's address. Organizations on Free get a one-time 14-day Starter
trial, with no card. The `observer` skill describes the flow step by
step; the full reference is
[Connect an AI agent](https://docs.use.observer/docs/mcp/connect-ai-agent).

To get a key without the device flow, open
`https://use.observer/connect?client=claude-code` (or `claude-desktop`,
`cursor`, `codex`, `other`), approve, and copy the key and config the
page shows once.

### Configure by hand

Create an `obs_pub_` API key in the console (Settings, API keys), grant
only the scopes you need, and add the server to your client:

```json
{
  "mcpServers": {
    "observer": {
      "url": "https://mcp.use.observer/mcp",
      "headers": { "Authorization": "Bearer obs_pub_your_key_here" }
    }
  }
}
```

With Claude Code:

```bash
claude mcp add observer --transport http https://mcp.use.observer/mcp \
  --header "Authorization: Bearer obs_pub_your_key_here"
```

Every tool maps one-to-one to a public API operation and is governed by
the same key scopes and plan entitlement as the REST API.

### Tools

| Area | Tools |
|---|---|
| Account | `getMe` (no scope needed) |
| Observer Agents | `listAgents`, `getAgent`, `createAgent`, `rotateAgentKey`, `deleteAgent` |
| Status pages | `listPages`, `getPage`, `deletePage` |
| Metrics | `listMetrics`, `getMetric`, `getMetricHistory`, `setManualMetricStatus`, `getMetricHeartbeat`, `rotateMetricHeartbeatUrl`, `deleteMetric` |
| Services and SLOs | `listServices`, `getService`, `deleteService`, `listSlos`, `getSlo`, `deleteSlo` |
| SLA statements | `listSlaStatements`, `getSlaStatement` |
| Incidents | `listIncidents`, `getIncident`, `createIncident`, `patchIncident`, `publishIncident`, `resolveIncident`, `appendIncidentMessage`, `draftIncidentFromMetric`, `deleteIncident` |
| Maintenance | `listMaintenances`, `getMaintenance`, `createMaintenance`, `patchMaintenance`, `startMaintenance`, `completeMaintenance`, `cancelMaintenance` |
| Config as code | `exportConfig`, `applyConfig` |
| Change events | `createChangeEvent` |

`createAgent` and `rotateAgentKey` return the agent key once, with
install commands. The delete tools for metrics, services, SLOs and
pages take an id or a config key and only delete config-managed
objects. Scopes for each tool:
[MCP server documentation](https://docs.use.observer/docs/mcp/index).

## Skills

| Skill | What it teaches an agent |
|---|---|
| [`skills/observer`](skills/observer/SKILL.md) | The full working model: connecting (device flow), the setup sequence (plan check, creating and installing the Observer Agent, dry-run and apply, sharing the page), diagnosing metrics with no data, scope discipline, the config-as-code loop with the Observer CLI, and where to read documentation. |
| [`skills/observer-incidents`](skills/observer-incidents/SKILL.md) | The incident lifecycle: draft from a failing metric, publish, post updates, resolve. |

To use a skill with Claude Code, copy its folder into `~/.claude/skills/`
(or your project's `.claude/skills/`). Other agent frameworks can ingest
the SKILL.md files directly; they are plain Markdown with a small
frontmatter header.

## Documentation for machines

The documentation site publishes LLM-ready exports:

- `https://docs.use.observer/llms.txt`: an index of every page with a
  one-line summary and a link to its Markdown.
- Every docs page is also available as raw Markdown: append `.md` to
  its path, for example `https://docs.use.observer/docs/mcp/index.md`.

Point a research agent at `llms.txt` when it needs product knowledge
without crawling, and let it fetch only the pages it needs.

## Related

- Documentation: [docs.use.observer](https://docs.use.observer)
- Agent (data plane): [github.com/useobserver/agent](https://github.com/useobserver/agent)
- CLI (config as code): [github.com/useobserver/cli](https://github.com/useobserver/cli)
- Live status: [status.use.observer](https://status.use.observer)
