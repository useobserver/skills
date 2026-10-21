# Client configuration

Server URL: `https://mcp.use.observer/mcp` (full) or
`https://mcp.use.observer/mcp/readonly` (read tools only). With OAuth, add the
URL and nothing else; the client opens the browser for approval. With an API
key, send `Authorization: Bearer <key>`.

Never put a key into a file that is committed. Prefer user-level config or an
environment variable reference.

## Claude Code

OAuth:

```bash
claude mcp add --transport http --scope user observer https://mcp.use.observer/mcp
```

Then run `/mcp` and choose `observer` to sign in.

API key (kept in user settings, outside any repository):

```bash
claude mcp add --transport http --scope user observer https://mcp.use.observer/mcp \
  --header "Authorization: Bearer <key>"
```

Shared project `.mcp.json`, key from the environment:

```json
{
  "mcpServers": {
    "observer": {
      "type": "http",
      "url": "https://mcp.use.observer/mcp",
      "headers": { "Authorization": "Bearer ${OBSERVER_API_KEY}" }
    }
  }
}
```

The Observer plugin (`/plugin marketplace add useobserver/skills`, then
`/plugin install observer@useobserver`) adds the server with OAuth for you.

## Claude.ai and Claude Desktop

OAuth: Settings, Connectors, Add custom connector, and paste
`https://mcp.use.observer/mcp`. Connect it and approve in the browser.

API key in `claude_desktop_config.json` (restart Claude Desktop after):

```json
{
  "mcpServers": {
    "observer": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.use.observer/mcp", "--header", "Authorization: Bearer <key>"]
    }
  }
}
```

## Cursor

One-click install (OAuth):

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=observer&config=eyJ1cmwiOiJodHRwczovL21jcC51c2Uub2JzZXJ2ZXIvbWNwIn0=
```

The `config` value is the base64 of `{"url":"https://mcp.use.observer/mcp"}`.

API key in `~/.cursor/mcp.json` (user config). In a project `.cursor/mcp.json`
use `"Bearer ${env:OBSERVER_API_KEY}"` instead of the literal key:

```json
{
  "mcpServers": {
    "observer": {
      "url": "https://mcp.use.observer/mcp",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}
```

## VS Code

```bash
code --add-mcp '{"name":"observer","type":"http","url":"https://mcp.use.observer/mcp"}'
```

Or in `.vscode/mcp.json`:

```json
{
  "servers": {
    "observer": { "type": "http", "url": "https://mcp.use.observer/mcp" }
  }
}
```

## Codex

OAuth:

```bash
codex mcp add observer --url https://mcp.use.observer/mcp
codex mcp login observer
```

API key, read from an environment variable so it stays out of
`~/.codex/config.toml`:

```toml
[mcp_servers.observer]
url = "https://mcp.use.observer/mcp"
bearer_token_env_var = "OBSERVER_API_KEY"
```

## Gemini CLI

```json
{
  "mcpServers": {
    "observer": { "httpUrl": "https://mcp.use.observer/mcp" }
  }
}
```

Gemini CLI discovers OAuth from the server's 401 response. The Observer
extension (`gemini extensions install https://github.com/useobserver/skills`)
adds this entry for you.

## Any other client

Use a remote (Streamable HTTP) server with the URL above. If the client has no
OAuth support, add the `Authorization: Bearer <key>` header and get the key
from `https://use.observer/connect?client=other`.
