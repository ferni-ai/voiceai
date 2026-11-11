# Rules for a parallel agent fleet

`AGENTS.md` says how to ship one change, and `operating-model.md` says how the
work around it is organised. This page adds what a lead session and its
background agents need when several of them work on this repo from one
machine at once. Every agent definition in `.claude/agents/` points here.
The current queue for each lane is in `fleet-handoff.md`.

## Roles

- **The lead** (the main session) owns the plan. It is the only one that
  deploys, changes dev or prod settings (`lk agent update-secrets`), or runs
  evals on dev. Dev is shared, so the lead hands it out in turns. An agent
  that needs dev asks the lead and waits.
- **Lane agents** each own one area (safety, memory, personas, tools, web UI,
  latency, backlog, best-friend). One worktree each, one PR at a time.
- **Verifiers** (`compound-loop:verifier`) check a finished PR blind. The
  author never grades their own work.

## Disk and machine limits

These limits come from 2026-10-14 and 2026-10-15, when the Mac's disk filled
and a session crashed.

- At most about 5 worktrees at once. Each is about 1.2 GB.
- In a worktree, run `pnpm install` (through `scripts/agents/heavy.sh`). Never
  symlink another checkout's `node_modules`: your checks then run against its
  dependencies, and pnpm can write through the link into that checkout. With the
  pnpm store on the same disk as the worktree, an install hardlinks from the
  store and adds little; check with `pnpm store path`.
- Run every heavy check through `scripts/agents/heavy.sh <label> <cmd…>`.
  That covers tsc or typecheck, vitest beyond 1–2 files, `sh .husky/pre-commit`
  and `pnpm quality:arch`. It allows two at a time, machine-wide, and only
  with at least 8 GB free. Batch your heavy steps into one call. Use
  `--maxWorkers=2` for vitest. Never run the whole suite locally. Never
  remove a lock directory by hand.
- Remove your worktree (`git worktree remove`) right after its PR is pushed
  and queued. `rm -rf` is blocked by a safety hook: don't work around it.
- The lead runs a low-disk alert (below 6 GB) whenever more than 3 agents
  are working.

## Git and merging

- Branch from `origin/main`. Never `git stash`, never `--no-verify`, never
  `gh pr update-branch` a queued PR. Update a stale branch by merging
  `origin/main` into it; don't rebase a shared branch.
- Commit through the hooks, lowercase subject, ending with your model's
  `Co-Authored-By:` trailer. PR bodies end with the Claude Code line.
- A PR is queued (`gh pr merge N --auto`, no `--squash`) only after a fresh
  verifier PASS on its current head. If the permission system refuses that
  call, don't retry it: tell the lead, who queues it.
- Files over 500 lines may not grow (the quality ratchet).
  `pnpm quality:arch` must pass. New behaviour is behind a flag, off by
  default. New flag: `pnpm flags:new` (one file in `src/config/flags/`).

## Every PR body answers the six questions

What's broken, what's wrong, what to rework to be more human, research
needed, how it stays grounded, how it's proven e2e. The verifier answers the
same six.

## Public repo

No real transcripts, phone numbers, uids, secret values or corpus text in
code, PRs, issues or logs. Tests use synthetic lines. Evidence from real
calls stays in the lead's local evidence folder, never in the repo.

## Ask Seth first

The lead brings these to Seth:

- billing or new accounts (Temporal Cloud);
- legal or AI-disclosure questions (#1460);
- deleting or migrating real caller data;
- rotating secrets;
- turning on a prod flag whose eval came back worse.

Seth has given standing approval for queuing verified PRs, shipping
increments through the release gate (#1400), and wiring keys he has
already approved.

## When the network or a session dies

Work that is committed and pushed survives. When stopping, commit WIP
(commitlint rejects a `wip:` type, so use `chore(<scope>): wip …`), push it, and open a draft PR whose body says
exactly where you stopped and what comes next.
