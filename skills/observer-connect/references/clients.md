# Client configuration

Server name `observer`. URL `https://mcp.use.observer/mcp` (full) or
`https://mcp.use.observer/mcp/readonly` (read tools only). With OAuth, add the
URL and nothing else; the client opens the browser for approval. With an API
key, send `Authorization: Bearer <key>`.

Use OAuth wherever the client supports it: no key is pasted or stored. With an
API key, never write the key into a config file. Have the user keep it in an
environment variable and reference that variable from the client's config. The
exact form for each client (Claude Code, Cursor, VS Code, Codex) is at
https://docs.use.observer/docs/mcp/connect-ai-agent#manual-setup .

## Claude Code

OAuth:

```bash
claude mcp add --transport http observer https://mcp.use.observer/mcp
```

The default scope is `local` (this project, for this user only). Add
`--scope user` to use it in every project, or `--scope project` to write a
shared `.mcp.json`. Then sign in: run `/mcp` in a session and choose
`observer`, or run `claude mcp login observer` from the shell.

API key: add an `Authorization` header to the same entry, with the key taken
from an environment variable as the page linked above shows.

The Observer plugin adds the server with OAuth for you:

```text
/plugin marketplace add useobserver/skills
/plugin install observer@useobserver
```

From the shell: `claude plugin marketplace add useobserver/skills`, then
`claude plugin install observer@useobserver`.

## Claude.ai and Claude Desktop

Free, Pro and Max: Customize > Connectors, then + Add > Add custom connector.
Enter the name `observer` and the URL `https://mcp.use.observer/mcp`, select
Continue, review the detected authentication, and select Add. The Free plan
allows one custom connector.

Team and Enterprise: an Owner or Primary Owner (on Enterprise also a custom
role with "Manage access to Libraries") adds it under Organization settings >
Connectors > Add: hover Custom and select Web. Members then connect it under
Customize > Connectors > Connect.

## Cursor

One-click install (OAuth):

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=observer&config=eyJ1cmwiOiJodHRwczovL21jcC51c2Uub2JzZXJ2ZXIvbWNwIn0=
```

The `config` value is the base64 of `{"url":"https://mcp.use.observer/mcp"}`.
The same entry by hand, in `~/.cursor/mcp.json` (every project) or
`.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "observer": { "url": "https://mcp.use.observer/mcp" }
  }
}
```

API key: add an `Authorization` header to that entry, with the key taken from
an environment variable as the page linked above shows.

## VS Code (GitHub Copilot)

Install link (`vscode-insiders:` instead of `vscode:` for Insiders):

```text
vscode:mcp/install?%7B%22name%22%3A%22observer%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.use.observer%2Fmcp%22%7D
```

Or from the command line:

```bash
code --add-mcp '{"name":"observer","type":"http","url":"https://mcp.use.observer/mcp"}'
```

Or in `.vscode/mcp.json` (the top-level key is `servers`):

```json
{
  "servers": {
    "observer": { "type": "http", "url": "https://mcp.use.observer/mcp" }
  }
}
```

OAuth runs in the browser the first time VS Code connects.

## Codex CLI

OAuth:

```bash
codex mcp add observer --url https://mcp.use.observer/mcp
codex mcp login observer
```

The same entry in `~/.codex/config.toml`:

```toml
[mcp_servers.observer]
url = "https://mcp.use.observer/mcp"
```

API key: Codex can read the bearer token from an environment variable; the
setting is on the page linked above.

## Gemini CLI

```bash
gemini mcp add --transport http observer https://mcp.use.observer/mcp
```

The default scope is the project; add `-s user` for every project. Then run
`/mcp auth observer` in a session to sign in. OAuth needs a browser on the
same machine, so it fails over SSH or on a headless host. In `settings.json`
the entry uses `httpUrl`:

```json
{
  "mcpServers": {
    "observer": { "httpUrl": "https://mcp.use.observer/mcp" }
  }
}
```

The Observer extension (`gemini extensions install https://github.com/useobserver/skills`)
adds this entry and the skills for you.

## Any other client

Use a remote (Streamable HTTP) server with the URL above. If the client has no
OAuth support, send the `Authorization: Bearer <key>` header, with the key
kept in an environment variable and never in a file, and get the key from
`https://use.observer/connect?client=other`.
