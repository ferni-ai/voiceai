---
name: ship-change
description: Ship one small change to Ferni from a fresh branch to merged and checked on dev. Use when starting any code change in this repo, opening a PR, or asked to "ship", "land", "merge" or "get this green". Covers branching from origin/main, flagging unfinished behaviour, PR size, evidence, the merge queue and cleanup.
---

# Ship one change

One concern, one branch, one PR of about 400 reviewable lines or fewer.

## 1. Start from main
```bash
git fetch origin
git worktree add -b <type>/<slug> .claude/worktrees/<slug> origin/main   # or: git switch -c <type>/<slug> origin/main
cd .claude/worktrees/<slug> && pnpm install --frozen-lockfile
```
Before editing a shared file (a big handler, `run.sh`, `score.mjs`), check open
PRs touching it: `gh pr list --search "<filename>" --state open`. If one is in
flight, build on it after it merges, or message that session.

## 2. Make the change behind a flag when it changes behaviour
- Read the flag once from env, defaulting to off:
  `export function fooEnabled(env = process.env) { return env.FOO === 'on'; }`
- When the flag is off, behaviour must be byte-for-byte the same, and a test
  must pin that.
- Test both states. A test named for a behaviour must fail if the behaviour
  is missing.

## 3. Prove it
```bash
pnpm typecheck
pnpm vitest run <the tests for the files you touched>
npx prettier --check <changed files>
```
For voice behaviour, also run the `voice-eval` skill on dev and keep the numbers.

## 4. Commit and open the PR
- Subject: `type(scope): lower-case summary` (no camelCase words).
- Body: why (the observed problem), what changed, and evidence: the test
  names, eval numbers before and after, and the flag name and its default.
```bash
git push -u origin <branch>
gh pr create --base main --title "..." --body "..."
gh pr merge <n> --auto        # queue it; no --squash
```
The PR-size hook blocks more than about 400 reviewable lines. Split by
concern instead of overriding. Override only for a genuinely atomic change:
`PDLC_LARGE_PR="<reason>" gh pr create ...`.

## 5. After merge
- Deploy `main` to dev (skill `deploy-agent`), turn the flag on in dev, and
  check it live.
- Remove the worktree: `git worktree remove .claude/worktrees/<slug>`
  (or let `python3 ~/.claude/hooks/pdlc/wt_gc.py --apply` clean merged ones).

## If CI is red
Read the failing job's log (`gh run view <id> --log-failed`) before changing
anything. If several PRs fail the same way, the cause is on main: fix it once
in its own PR (see the `diagnose-ci-queue` skill).
