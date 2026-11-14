# Development scripts for the Observer skills

This branch holds the scripts that maintain
[`useobserver/skills`](https://github.com/useobserver/skills). They are kept
off `main` because the plugin directory accepts only Markdown, text, JSON, YAML
and images from the plugin's own branch.

Check this branch out inside the plugin checkout (`.tools/` is git-ignored
there) and run the scripts from the plugin's root:

```bash
git worktree add .tools tools
node .tools/validate.mjs                        # every check; CI runs this
bun .tools/sync-tools.ts /path/to/observer      # evals/tools.json
bun .tools/gen-probe-refs.ts /path/to/observer  # skills/observer-checks/references
node .tools/build-evals.mjs                     # evals/suite/ for claude plugin eval
```

Each script works on the plugin checkout in the current directory, or on the
one `SKILLS_ROOT` names. `validate.mjs` needs Node 20 or later and has no
dependencies. The two generators need Bun and a checkout of the Observer
monorepo.

`gen-probe-refs.ts` removes the reference files before it writes them. If it
stops with "no NOTES entry for probe type ...", restore the folder with
`git checkout -- skills/observer-checks/references`, add the note for that type
to the script, and run it again.
