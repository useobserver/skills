# CLI and GitHub Action

## Install the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/useobserver/cli/main/install.sh | sh
```

Or download a binary from https://github.com/useobserver/cli/releases (each
release has `SHA256SUMS.txt`). With Node 20.10 or later the CLI also runs from
source: `node bin.mjs`.

Configuration is by environment:

- `OBSERVER_API_KEY`: a key with `write:config` (`read:config` is enough for
  `export`). Create it under Developers > API keys.
- `OBSERVER_API_URL`: optional, defaults to `https://use.observer`.

## Commands

```bash
observer apply -f observer.yaml --dry-run     # plan only
observer apply -f observer.yaml               # upsert by key
observer apply -f observer.yaml --prune       # also delete what the file dropped
observer export --format yaml -o observer.yaml        # config-managed objects
observer export --all --format yaml -o observer.yaml  # include console objects
observer apply < observer.yaml                # read the document from stdin
```

## GitHub Action

```yaml
name: observer
on:
  pull_request:
    paths: [observer.yaml]
  push:
    branches: [main]
    paths: [observer.yaml]
jobs:
  observer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: useobserver/cli@v1
        with:
          file: observer.yaml
          mode: ${{ github.event_name == 'pull_request' && 'dry-run' || 'apply' }}
        env:
          OBSERVER_API_KEY: ${{ secrets.OBSERVER_API_KEY }}
```

- `mode` is `dry-run` (default) or `apply`. On pull requests the plan is
  printed to the job log and invalid config fails the check; nothing is
  posted to the pull request.
- `prune: "true"` passes `--prune`. Leave it off unless the team wants files
  to be the only source of truth, and review every plan that lists `prune`.
- `@v1` follows the newest 1.x release; pin a full tag to freeze it.
- Store the key as a repository or environment secret. Never echo it.
