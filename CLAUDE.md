@AGENTS.md

## Claude Code specifics

- **Skills in this repo** (`.claude/skills/`): `ship-change` (branch → small PR →
  queue → dev), `deploy-agent` (dev/prod LiveKit deploy with every gate),
  `voice-eval` (live-call evals and humanness scores). Use them; they hold the
  exact commands.
- **The repo enforces the shipping rules**, for every clone and worktree:
  `.husky/pre-push` blocks a branch built on another unmerged branch, more
  than 1000 reviewable lines, and new architecture or ratchet regressions; the
  **PR Flow** check does the same on GitHub and warns over 400 lines, over 25
  open PRs, or with no linked issue; **CI Health** opens a `ci-health` issue
  for a job failing across many PRs. Hooks run from `.husky/` (`pnpm install`
  sets `core.hooksPath` once per clone). When one blocks, fix the cause; each
  message names its override for the rare legitimate case.
- **Subagents**: name the model explicitly (`model: "opus"` for anything that
  edits, pushes or judges). After a subagent says it pushed, check the commit
  is on the remote (`git ls-remote origin <branch>`).
- **Parallel sessions**: one worktree per session, from `origin/main`. Before
  editing a file another session is changing, message that session.
