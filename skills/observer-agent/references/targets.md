# Install targets

`createAgent`, `rotateAgentKey`, `getAgent` and `listAgents` accept
`target` to return one ready-to-run snippet in `install.<target>`:
`label`, `content`, and `file` (a suggested file name for Compose,
Kubernetes and systemd). From create and rotate the snippet carries the key;
everywhere else it has the `${AGENT_KEY}` placeholder. Always give the user
the snippet Observer returns rather than writing your own. `getAgent` with
`target` also returns `install.<target>.logs_command`, which is the most
reliable way to read the logs.

| Target | Runs as | Logs | Restart after a key change |
|---|---|---|---|
| `docker` | container from `ghcr.io/useobserver/agent:latest` | `docker logs -f observer-agent` | recreate the container with the new `AGENT_KEY` |
| `compose` | Compose service | `docker compose logs -f observer-agent` | update the env file, `docker compose up -d` |
| `kubernetes` | Deployment `observer-agent` with a Secret `observer-agent`, in the namespace `observability` | `kubectl logs -f deploy/observer-agent -n observability` | update the `observer-agent` Secret, `kubectl rollout restart deploy/observer-agent -n observability` |
| `systemd` | Linux service `observer-agent` | `journalctl -u observer-agent -f` | edit `/etc/observer-agent.env`, `systemctl restart observer-agent` |
| `launchd` | macOS user agent `use.observer.agent` | `tail -f ~/Library/Logs/observer-agent.log` | edit `AGENT_KEY` in `~/Library/LaunchAgents/use.observer.agent.plist`, then `launchctl bootout` and `launchctl bootstrap` it |
| `binary` | foreground process (Linux or macOS) | its terminal | stop it and start it again with the new key |

The `systemd`, `launchd` and `binary` commands pick the right binary for the
host and clear the macOS quarantine flag. Binaries ship with a
`SHA256SUMS.txt` on each release.

## Things to tell the user

- Container: mount a volume on `/data` so readings queued during an outage
  survive a container being recreated.
- Container: the published image has no `ping`, so `icmp` checks report
  `no_data` there. Use the binary on a host with `ping`, or a custom image.
- The install command uses the `:latest` image tag, which moves with each
  release. Pin an exact version (for example `:1.7.0`) or the major tag `:1`
  to make upgrades explicit.
- The agent's local debug dashboard is at `http://127.0.0.1:10101` on its
  host, loopback only by default.
- Prometheus checks need `PROMETHEUS_SERVER_URL` (and its auth variables) on
  the agent, unless each metric sets `prometheus_url`.
- Secrets that checks reference (`connection_string_ref`, `header_refs` and
  the other `*_ref` fields) are environment variables on this host. Set them
  for the agent process and restart it.
- testProbe through an agent needs agent 1.7.0 or later.

Full environment reference:
https://docs.use.observer/agent/reference/environment-variables
