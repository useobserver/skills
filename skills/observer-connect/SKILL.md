---
name: observer-connect
description: Connects an AI client to the Observer MCP server and fixes access problems. Covers OAuth sign-in (no key pasted), the device flow that gives an agent its own scoped API key, a manual API key, the read-only endpoint, scopes and step-up, the Starter trial for organizations on Free, and confirming the organization with getMe. Use when the Observer tools are missing or failing with 401 or 403, or the user says "connect Observer", "give my agent access to my status page", "I don't have an Observer account yet", "add the Observer MCP server", "why do I get insufficient_scope", "read-only access only", or "which org did I connect". For first-time setup after connecting use observer-setup; for routing a general request use observer.
license: ISC
---

# Connect to Observer

The Observer MCP server is at `https://mcp.use.observer/mcp`. It holds no data:
each call goes to the Observer public API with the connection's OAuth token or
API key, and the same scopes and plan rules apply. The public API, and so the
MCP server, needs the Starter plan or above.

Never ask the user for their password, and never copy, print or store tokens
or keys beyond what a step below says.

## Choose a path

| Situation | Path |
|---|---|
| The client supports MCP authorization (Claude Code, Claude.ai, Cursor, VS Code, Codex, Gemini CLI) | OAuth, step A |
| The client has no OAuth, or you need a key for the REST API | Device flow, step B |
| You cannot make HTTP requests | Manual key page, step C |
| The user only wants analysis, no changes | Read-only endpoint, step D |

## Step A: OAuth

1. Add the server with no `Authorization` header. Claude Code:

   ```bash
   claude mcp add --transport http --scope user observer https://mcp.use.observer/mcp
   ```

   Other clients take the same URL in their remote MCP config; some also need
   `"type": "http"`. Per-client lines are in
   [references/clients.md](references/clients.md).
2. Tell the user what happens next: the first call opens a browser on
   Observer's approval page (in Claude Code, run `/mcp` and pick `observer`).
   They sign in or sign up, choose the organization, review the listed
   scopes and select Approve. Only an organization owner can approve.
3. Verify: call `getMe` and report the organization, plan and scopes.

If it fails:

- Approval page says to ask an owner: the user is a member, not an owner.
  An owner must approve, or create a key for them.
- Approval page asks to upgrade: the organization is on Free and has used
  its one Starter trial.
- A tool returns 403 `insufficient_scope`: the error names every missing
  scope. A client with step-up authorization reopens the approval page for
  them; otherwise tell the user which scopes to add and reconnect, or use a
  key that has them.

Facts: with no particular scopes requested, OAuth grants the same preset as
the device flow (below). Access tokens last one hour and the client refreshes
them; each refresh returns a new refresh token. Each approval appears as an
API key named after the client (for example `Claude Code (MCP OAuth)`) under
Developers > API keys, where revoking it disconnects the client.

## Step B: device flow

The user approves one link and you receive a scoped `obs_pub_` key.

1. Start a request. `client` is `claude-code`, `claude-desktop`, `cursor`,
   `codex` or `other`:

   ```bash
   curl -s -X POST https://use.observer/api/connect/device \
     -H "Content-Type: application/json" -d '{"client": "claude-code"}'
   ```

   Keep `device_code` to yourself: never print, log or show it.
2. Show the user `user_code` and `verification_uri_complete` (open it in
   their browser if you can). They check the code matches, sign in or sign
   up, and approve. Only an owner can approve. An organization on Free gets
   a one-time 14-day Starter trial with no card; afterwards it returns to
   Free and nothing is deleted.
3. Poll every `interval` seconds (5):

   ```bash
   curl -s -X POST https://use.observer/api/connect/device/token \
     -H "Content-Type: application/json" -d '{"device_code": "<device_code>"}'
   ```

   - 400 `authorization_pending`: wait and poll again.
   - 400 `slow_down`: use the returned `interval` from now on.
   - 400 `access_denied`: the user declined. Stop.
   - 400 `expired_token`: expired (10 minutes) or already delivered. Stop;
     start again only if the user still wants to connect.
   - 200: `{ api_key, org, mcp_url, scopes }`. The key is delivered once.
4. Before you configure anything, decide with the user how to continue.
   Most clients load a new MCP server only after a restart, and a restart
   ends this session. Offer: continue now over the REST API
   (`https://use.observer/api/v1`, same key and operations), or restart and
   continue with MCP tools. Do not create an Observer Agent and then
   restart: its key is shown once and would be lost.
5. Add the server with the header `Authorization: Bearer <api_key>`. Prefer a
   user-level config outside any repository (Claude Code `--scope user`), or
   an environment variable reference. Never commit a file containing the
   key. See [references/clients.md](references/clients.md).
6. Verify: `getMe` (or `GET /api/v1/me` over REST).

## Step C: manual key page

Send the user to `https://use.observer/connect?client=<client>`. After
approving they see the key once with a ready-made config for their client.
They can add the config themselves, or paste the key to you for step B.5.

## Step D: read-only endpoint

`https://mcp.use.observer/mcp/readonly` offers only the tools that read and
change nothing. Use it when the user wants analysis without any risk of a
write. Write tools are not listed there at all, so to change something the
user must also connect the full endpoint.

## Scopes

The device flow and default OAuth grant this preset: `read:config`,
`write:config`, `read:agents`, `write:agents`, `read:services`,
`read:metrics`, `read:slos`, `read:incidents`. That covers setup, config as
code, agents and reading status.

Not in the preset, on purpose (they act on public pages or customers):
`write:incidents`, `read:maintenances`, `write:maintenances`,
`write:metrics`, `write:change_events`, `read:sla`, `read:audit`. For those
the user creates a key under Developers > API keys with the extra scopes, or
approves them through OAuth step-up. Keys from before agents joined the
preset lack `read:agents` and `write:agents`; run the connect flow again.
Scope list: https://docs.use.observer/api/getting-started/auth

## Verify the connection

Report in this shape:

```text
Connected to Observer
Organization: <org.name> (<org.id>)
Plan: <plan> (trial ends <trial_ends_at>, if any)
Scopes: <scopes>
Missing for your request: <scopes or "none">
```

## Example requests

- "Hook my Claude Code up to Observer."
- "I want my agent to manage our status page but I have no account yet."
- "Connect Observer but only let it read things."
- "It says insufficient_scope when I try to open an incident."

References: https://docs.use.observer/docs/mcp/oauth and
https://docs.use.observer/docs/mcp/connect-ai-agent
