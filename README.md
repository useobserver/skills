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
Observer on your behalf: read metrics and SLOs, manage incidents, and
apply configuration as code.

## Connect the MCP server

Observer runs a remote MCP server at `https://mcp.use.observer/mcp`.
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
the same key scopes and plan entitlement as the REST API. Full tool
catalog: [MCP server documentation](https://docs.use.observer/docs/mcp/index).

## Skills

| Skill | What it teaches an agent |
|---|---|
| [`skills/observer`](skills/observer/SKILL.md) | The full working model: MCP tools, scope discipline, the config-as-code loop with the Observer CLI, and where to read documentation. |
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
