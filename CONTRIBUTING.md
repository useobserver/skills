# Contributing

## Add or change a skill

1. One job per skill, in `skills/<name>/SKILL.md`. The folder name is the
   skill name: kebab-case, prefixed `observer-`.
2. Frontmatter: `name`, `description`, `license: ISC`. The description says
   what the skill does, contains "Use when" with phrases a user would type,
   and names the sibling skill to use instead for nearby requests. At most
   1024 characters.
3. Body: a `# ` heading, numbered steps, a verify step and an "if it fails"
   branch for each write, an untrusted-content note where the skill reads
   text written by others, and example requests. At most 300 lines; move
   detail to `references/<topic>.md` (one level deep, linked from SKILL.md).
4. Every fact must match the Observer source or docs.use.observer. When unsure,
   leave it out.
5. Plain prose: no marketing words, no em or en dashes.
6. Add `evals/specs/<name>.json` and list the skill in
   `.claude-plugin/marketplace.json` and the README skills table.
7. Run `node scripts/validate.mjs` and `claude plugin validate .`.

## Generated files

From a checkout of the Observer monorepo (Bun required):

```bash
bun scripts/sync-tools.ts /path/to/observer          # scripts/tools.json
bun scripts/gen-probe-refs.ts /path/to/observer      # observer-checks/references
```

Commit the output. Do not edit generated files by hand.

## Evals

`evals/specs/<skill>.json` holds prompts that should and should not load the
skill, and workflow prompts with the tool expected first, tools that must be
called, call order, and forbidden calls (for example `publishIncident` without
approval, or `applyConfig` with `prune`). They are not run in CI. To run them
with Claude Code's plugin evals against a mocked Observer server:

```bash
node scripts/build-evals.mjs                    # writes evals/suite/ (git-ignored)
claude plugin eval . --eval-dir evals/suite --runs 1 --ablation none   # quick pass
claude plugin eval . --eval-dir evals/suite                            # full, with baseline
claude plugin eval . --eval-dir evals/suite --tag observer-incidents   # one skill
```

Mocked tools answer from `evals/suite/mocks/observer/_server.md`, so no real
organization is touched. Each run costs model calls; start with one skill.

## Release

1. Bump the version in `.claude-plugin/plugin.json`, `plugin.json` and
   `gemini-extension.json`, and add a CHANGELOG entry with the same version.
2. Validate, merge, then tag `vX.Y.Z` on main.

Commits: short imperative subject, no tool attribution trailers.
