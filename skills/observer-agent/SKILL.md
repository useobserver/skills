---
name: observer-agent
description: Operates Observer Agents, the data plane that runs checks inside the user's network. Lists agents and their state (never_connected, online, offline, revoked), produces install commands for docker, compose, kubernetes, systemd, launchd (macOS) or a foreground binary, delivers keys in the chat or through a single-use claim link, handles proxies and private CAs, rotates keys with a 24-hour grace or immediately after a leak, and deletes agents after confirmation. Use when the user says "install the Observer agent", "give me the docker command for the agent", "set it up on my Mac", "rotate the agent key", "our agent key leaked", "I lost the agent key", "which agents are offline", "move checks to a new agent", or "remove the old agent". For first-time setup of everything use observer-setup; for a metric with no data use observer-no-data.
license: ISC
---

# Observer Agents

An agent runs near the systems it checks, evaluates thresholds locally and
sends verdicts to Observer over outbound HTTPS only. Its key (`obs_live_`) is
shown once; Observer stores only a hash.

Needs: `read:agents`; changes need `write:agents`. Both are in the default
connect preset.

## Read state

`listAgents` (filter by exact `name`) or `getAgent`. Both are small by
default and never return a key.

| `status` | Meaning |
|---|---|
| `never_connected` | no heartbeat yet; installs report within about a minute |
| `online` | a heartbeat in the last 90 seconds |
| `offline` | connected before, silent for over 90 seconds |
| `revoked` | its key is rejected (console kill switch) |

`connected_ever` stays true once an agent has run; `version`,
`first_seen_at` and `last_heartbeat_at` help with upgrades and outages. An
offline agent triggers the `agent.offline` alert 3 to 5 minutes after its last
heartbeat, if an alert destination subscribes to it.

## Install a new agent

1. Ask where it runs: `docker`, `compose`, `kubernetes`, `systemd` (Linux),
   `launchd` (macOS) or `binary` (Linux or macOS, foreground). Ask about
   proxies, TLS-intercepting proxies, private CAs and restricted egress.
2. `listAgents` with the intended `name`. Reuse an agent only if
   `connected_ever` is false (rotate its key with `invalidate_immediately`);
   otherwise create a new one with a distinct name. Names are not enforced
   unique, but config documents match agents by name, so keep them unique.
3. `getMe` quotas: agents count toward the plan (Free 1, Starter 3, Pro 10,
   Business 25).
4. `createAgent` with `{ "name": "..." }` and `target=<target>`. Add
   `prometheus_url` only if it will run PromQL. Ask for one `target`, not
   `include=install`.
5. Hand over the install command `install.<target>.content`, which has the
   key in it, and say it is secret and shown once. Never store it, repeat it
   or write it to a file.
   Or, if the user prefers the key never enters the chat, call with
   `delivery=claim` and give them `claim_url`: single use, valid 15 minutes,
   revealed in the console by a signed-in member of the organization. A 503
   `claim_unavailable` means the option is off and nothing was created.
6. Restricted networks: add `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` (internal
   targets and Prometheus belong in `NO_PROXY`) and `NODE_EXTRA_CA_CERTS` with
   the CA file present on the host or mounted in the container. Never disable
   TLS verification. Guide:
   https://docs.use.observer/agent/guides/restricted-networks

Verify: `getAgent` (no `target`) every 15 to 30 seconds until `online`.
If it fails: after about 3 minutes still `never_connected`, ask for the logs.
`getAgent` with `target` returns `install.<target>.logs_command`
(`docker logs`, `kubectl logs`, `journalctl` for systemd,
`~/Library/Logs/observer-agent.log` for launchd; `binary` logs to its
terminal).

Notes by target: [references/targets.md](references/targets.md).

## Rotate a key

Ask why first; it decides the options.

| Reason | Call | Effect |
|---|---|---|
| Routine rotation, agent running | `rotateAgentKey` with `target` | Old key keeps working 24 hours (`previous_key_valid_until`) while the user redeploys |
| Key leaked | `rotateAgentKey` with `{ "invalidate_immediately": true }` | Old key stops now; the agent is offline until redeployed |
| Key lost before first use | check `connected_ever: false`, then rotate with `invalidate_immediately` | Do not delete and recreate |

Rotating the key of a connected agent affects a running install. Confirm
first. Deliver the new key the same way as on install (command in chat, or
`delivery=claim`). The user updates `AGENT_KEY` where the agent runs and
restarts it.

Verify: `getAgent` shows `online` with a fresh `last_heartbeat_at` after the
redeploy.

## Delete an agent

`deleteAgent` is permanent: its key stops working at once, its heartbeat
history goes, and its metrics are kept but have no agent, so they stop
receiving data.

1. `getAgent` and `listMetrics` to see what it runs; tell the user how many
   metrics will lose their agent.
2. Offer to move them first: change each metric's `agent` in the config
   document to another agent, dry run, apply (`observer-config-as-code`).
3. Get an explicit yes naming the agent, then `deleteAgent`.
4. Verify: `listAgents` no longer lists it.

## Example requests

- "Give me the Docker command to install the Observer agent."
- "Install the agent on my MacBook as a background service."
- "Our agent key was in a screenshot, rotate it now."
- "Which agents are offline?"
- "Delete the staging agent but keep its checks running on prod-eu."

Guides: https://docs.use.observer/agent/guides/rotate-agent-key and
https://docs.use.observer/agent/overview
