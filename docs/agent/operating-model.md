# How work runs here (the operating model)

`AGENTS.md` says how to write and ship one change. This says how the work
around it is organised: where it's tracked, who picks it up, how much is in
flight, and when a change is done. Every agent reads it before opening an
issue or a PR.

Why it exists: on 2026-10-13 there were 141 open PRs, all from parallel
sessions working from their own idea of what was next. About 60 conflicted
with each other, about 40 failed the same flaky checks for days because each
looked like someone else's problem, and three sat on branches with no PR.
Nothing tracked the work except the PRs themselves.

## The unit of work is an issue

- Every change starts as an issue, and its PR says `Closes #N`. Use a
  template: `bug_report`, `feature_request` or `tech_debt`.
- One issue, one PR. If the work needs two PRs, it's two issues (or a parent
  issue with a task list linking them). Never stack one PR on another
  (`AGENTS.md` rule 1).
- Before starting, search open issues and PRs for the same thing
  (`gh issue list --search "<words>"`, `gh pr list --search "<words>"`). If it's
  there, comment on it instead of starting a second copy.
- Something found mid-task that isn't the task becomes a new issue, not part
  of the current PR.

## The board: "Ferni delivery" (org project #1)

| Status          | Means                                                  | Who moves it there                    |
| --------------- | ------------------------------------------------------ | ------------------------------------- |
| **Todo**        | Agreed and ready to pick up                            | Seth, or whoever files it             |
| **In progress** | Someone is building it: a branch or a draft PR exists  | The agent or person who started it    |
| **In review**   | PR is ready: CI, review and the merge queue            | Marking the PR ready                  |
| **Done**        | Merged, deployed to dev from `main`, and checked there | Closing the issue after the dev check |

- Put a new issue or PR on the board when you open it:
  `gh project item-add 1 --owner ferni-ai --url <url>`.
- An item in **In progress** names one owner (assignee, or the session in a
  comment). Two owners means two people about to conflict.
- Merged is not Done. Done needs the dev check from `AGENTS.md` rule 4.

## How much is in flight

- **No more than 25 open PRs.** Above that, help land the open ones (review,
  fix their CI, rebase them) before starting new work. The PR Flow check warns
  past 25.
- **An agent session takes one issue at a time** and finishes it (merged, or
  handed back with a comment saying why) before taking the next.
- **The Shipwright daemon** picks up issues labelled `ready-to-build`, two at
  a time (`.claude/daemon-config.json`). Label an issue `ready-to-build` only
  when it's specific enough to build without asking questions.

## Labels that mean something

| Label                                  | Meaning                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ready-to-build`                       | The daemon may pick this up                                                                                           |
| `pipeline/complete`, `pipeline/failed` | Set by the daemon when it finishes                                                                                    |
| `size/large-ok`                        | This PR can't be split; the 1000-line limit doesn't apply. Say why in the PR.                                         |
| `ci-health`                            | A CI job is failing on many PRs: one problem on main (opened by CI Health)                                            |
| `needs-ultrareview`                    | Large or risky PR: an independent verifier must PASS it before it's marked ready (Seth may also run the cloud review) |

## Review: machines check, people decide intent

Nobody reads every PR. Quality comes from checks that run on every change, an
independent verifier on risky ones, and flags that make merging safe.

1. **Every PR**: CI, the PR Flow check (size, base branch, issue link) and the
   AI review, which reads `AGENTS.md` and this file and checks the diff
   against them. A 🔴 finding is fixed before the PR enters the queue.
2. **Risky PRs** (over 400 reviewable lines, or touching auth and identity,
   account deletion or privacy, real caller data, payments, or secrets): the
   author labels them `needs-ultrareview` and, before marking the PR ready,
   has an independent verifier subagent (fresh context, told to find reasons
   to reject, e.g. `compound-loop:verifier`) check the diff. Its verdict goes
   in the PR, and the PR waits for a PASS. Seth may also run
   `/code-review ultra <PR#> --post`; nothing waits for it.
3. A finding is fixed in the same PR, or becomes its own issue linked from the
   PR. It is never just dismissed.

Merging is safe because new behaviour ships behind a flag that is off
(`AGENTS.md` rule 3). The decision that changes what callers get is turning
the flag on: on dev freely, on prod once its evals are in the PR and it has
run on dev.

## When CI is red

- Read the failing job's log before changing anything.
- If the same check fails on several PRs, it's one problem on main. Look for a
  `ci-health` issue, or open one, fix it once in its own PR, then update the
  affected branches. Don't retry it PR by PR (`AGENTS.md` rule 9).
- If the merge queue rejects your PR, find out why before re-queuing. A PR the
  queue rejects also knocks out the PRs tested together with it.

## Who decides what

Seth decides what gets built and in what order, and a short list of things
nobody can undo. Everything else is decided by the checks above.

- **Seth sets priority**: the order of Todo, and whether an issue is
  `ready-to-build`.
- **Ask Seth on the issue, before building**, only for:
  - deleting or migrating real caller data, or changing how long it's kept;
  - secrets, IAM, billing, or who can reach an API;
  - legal text (terms, privacy policy) and anything about Ferni saying he's
    an AI;
  - turning a flag on in prod when its evals are worse on any measure.
    Ask once, on the issue, and carry on with other work while waiting.
- **Agents decide the rest**: they pick up Todo in order, keep the board true
  for their item, merge through the queue when checks pass, and stop to ask
  only when the issue doesn't say enough. They never merge around a failing
  check, skip a hook, or turn a prod flag on with worse evals.
- **Seth gets a digest, not a queue**: what merged, what turned on, and what's
  stuck. He reads it when he likes; nothing waits for it.
