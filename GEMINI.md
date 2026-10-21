# Observer

This extension connects the Observer MCP server (`https://mcp.use.observer/mcp`)
and ships skills under `skills/`. Before any Observer task, read
`skills/observer/SKILL.md`: it checks the connection with `getMe`, sets the
safety rules, and points to the task skill to load next (setup, checks,
no-data diagnosis, config as code, incidents, maintenance, SLOs, SLA reports,
heartbeats, status pages, agents).

Short version of the rules: confirm the organization before the first write,
read before you write, dry run every `applyConfig`, confirm anything that
customers see or that deletes data, and never write keys or ping URLs to
files or logs.
