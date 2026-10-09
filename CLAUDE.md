@AGENTS.md

## Claude Code specifics

- **Skills in this repo** (`.claude/skills/`): `ship-change` (branch → small PR →
  queue → dev), `deploy-agent` (dev/prod LiveKit deploy with every gate),
  `voice-eval` (live-call evals and humanness scores). Use them; they hold the
  exact commands.
- **Hooks enforce the shipping rules** (in `~/.claude/hooks/pdlc/`). They block
  branches that don't start on `origin/main`, PRs over ~400 reviewable lines,
  and deploys of commits not on `origin/main`. They also warn when another
  worktree is changing the file you're editing. When one blocks, fix the cause;
  each block message names its override for the rare legitimate case.
- **Subagents**: name the model explicitly (`model: "opus"` for anything that
  edits, pushes or judges). After a subagent says it pushed, check the commit
  is on the remote (`git ls-remote origin <branch>`).
- **Parallel sessions**: one worktree per session, from `origin/main`. Before
  editing a file another session is changing, message that session.
