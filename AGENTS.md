# Ferni: instructions for coding agents

Ferni is a voice AI companion ("making AI human"). This file is the one set of
instructions for every coding agent (Claude Code reads it through `CLAUDE.md`;
Codex, Cursor and others read it directly). It holds only what the code can't
tell you: how work ships here, and the traps that have cost us before. How
the work around a change is organised (issues, the board, how much is in
flight, review by risk) is in `docs/agent/operating-model.md`: read it before
opening an issue or a PR. For anything else, read the code, and `docs/agent/`
on demand. Reviews are adversarial and answer the six questions in the
operating model's Review section; the reviewer is never the author.

## The stack today (verified 2026-10-08)

| Part | What runs | Where it's defined |
|---|---|---|
| Voice agent | LiveKit Cloud agents. Dev `CA_siTDMHEba4Fg` (project `ferni-dev`, dispatch name `voice-agent-lkcloud`), prod `CA_GeFvEpsNXLSF` (project `ferni-prod`). The GCE VM is gone. | `livekit.toml`, `livekit.prod-cloud.toml`, `docker/Dockerfile.agent` |
| Voice pipeline | Cartesia cascade: Ink-2 STT → Gemini 3.5 Flash (Vertex) → Cartesia Sonic TTS, native function calling | `src/agents/model-provider/factory.ts` |
| Agent config | Env secrets on the LiveKit agent. Behaviour changes ship **behind a flag, off by default**. | `lk agent update-secrets` |
| UI server | Cloud Run `john-bogle-ui`, deployed by GitHub Actions on a merge-queue merge to `main` (or once push CI passes) | `.github/workflows/deploy-production.yml` |
| Quality bar | `docs/DEFINITION-OF-CLEAN.md`, enforced by the ratchet | `apps/cli/src/commands/quality/ratchet.ts` |
| Firestore | Project `johnb-2025`, two databases: `(default)` is **prod**, `ferni-dev` is **dev** (`FIRESTORE_DATABASE=ferni-dev`). Both read the same rules and index files; diff the live rules before a prod deploy (below). | `firebase.json`, `firestore.rules`, `firestore.indexes.json` |

Docs elsewhere that mention GCE, Gemini Live, OpenAI Realtime, a JSON
function-call workaround or Sonata are describing retired setups.

### Firestore rules and indexes, per database

`firebase.json` has one `firestore` entry per database, so every deploy names
its database. Deploy to dev first, then check it:

```bash
firebase deploy --only firestore:ferni-dev --dry-run    # compiles rules, reads indexes, changes nothing
firebase deploy --only firestore:ferni-dev              # dev rules + indexes
scripts/firestore-rules/diff-live.sh johnb-2025 firestore.rules ferni-dev
npx tsx scripts/firestore/check-indexes.ts --database ferni-dev
```

Prod is `firebase deploy --only 'firestore:(default)'`, and a hook asks for
`PDLC_PROD_RULES="<why, how tested>"` first. Run `diff-live.sh` (no database
argument) before it: prod's live rules can lag `firestore.rules`. Never run a bare
`firebase deploy --only firestore`: it deploys both databases. The emulator reads
rules only when `--only` names one entry, so start it with
`firebase emulators:start --only firestore:ferni-dev` (plain `--only firestore`
starts with no rules: every read and write allowed).

## How work ships (one small chunk at a time)

1. **Branch from `origin/main`**: `git fetch origin && git switch -c <type>/<slug> origin/main`.
   Never branch from another unmerged branch and never hand-build an
   integration branch. If two pieces depend on each other, land the first
   (behind a flag if it isn't ready), then build on main.
2. **One concern per PR, about 400 reviewable lines or fewer** (tests,
   lockfiles and generated files don't count). Bigger means split it, or use
   `/batch` for a mechanical change.
3. **New behaviour goes behind an env flag that is off by default**, so it can
   merge before it's proven. Test both states. Turn it on in dev with
   `lk agent update-secrets`, and on prod only after it has been heard on dev.
4. **Prove it before you claim it.** Run the tests that cover the change and
   `pnpm typecheck`. For voice behaviour, run the eval harness on dev and paste
   the numbers in the PR (skill: `voice-eval`). "Done" means merged, deployed
   to dev from `main`, and checked there. Every new test or gate must be seen
   to fail: break the code it covers (or run it on main) and say so in the PR.
5. **Merge through the queue**: `gh pr merge <n> --auto`, with no
   `--squash` (the queue squashes; passing it errors and leaves auto-merge
   off). Never `gh pr update-branch` a PR that is already queued.
6. **Deploy only commits that are on `origin/main`** (skill: `deploy-agent`).
   Prod deploys only what has run on dev.
7. Delete your worktree when its PR merges.
8. **Start from an issue, and finish before you start.** Put `Closes #N` in
   the PR. Before opening a new PR, check `gh pr list --state open`: past 25
   open, help land those instead, because every merge makes the rest conflict.
9. **A check failing on many PRs is one problem on main.** Fix it once in its
   own PR (CI Health files a `ci-health` issue for it), then update the
   affected branches. Don't retry it PR by PR.

The repo enforces 1, 2 and 9 (`.husky/pre-push`, the PR Flow and CI Health
checks; reviewable lines are counted by `scripts/ci/reviewable.sh`).

## Hard rules (each one cost us before)

- **Never print, log or commit secrets.** Read them into env vars from Secret
  Manager (`gcloud secrets versions access latest --secret=<name> --project=johnb-2025`).
- **Never skip git hooks** (`--no-verify`, `core.hooksPath`), not even for local commits.
- **Never use `git stash`.** The stash list is shared by every worktree of this
  repo; on 2026-10-14 one session's pop dropped another's work. Set work aside
  by committing on a throwaway branch.
- **Commit subjects**: conventional type (`feat fix refactor docs test chore
  style perf ci revert`) and entirely lower-case. A camelCase word in the
  subject fails commitlint.
- **`lk agent update-secrets`**: one `--secrets "KEY=value"` per key. Commas
  don't split (`"A=1,B=2"` sets one key named A). Without `--overwrite` it
  merges with the existing secrets. An empty value is rejected; use `off`.
  Every update restarts the agent.
- **Always pass `--project` and `--config`** to `lk` commands. `lk` defaults can
  point at the wrong project.
- **Never redeploy or update secrets on dev while someone is in a room**
  (`lk room list --project ferni-dev` must be empty). A deploy drops live calls.
- **Typecheck with `pnpm typecheck`.** Plain `npx tsc` can run out of memory
  without printing `error TS`, which looks like "0 errors".
- **Files over 500 lines may not grow** (ratchet). Put new code in a new module.
- **When a fix needs another session's file, coordinate first.** Parallel edits
  to one file are where our merge conflicts come from.
- **Voice text rules** (`src/agents/personas/speech-markup-notes.ts`): no em
  dashes or ellipses in what Ferni says, and no stage directions. A hint that
  asks for a restart or trailing off needs a written example in commas and
  full stops, or the model writes `,,`.
- **No AI-disclosure prompt changes.** Ferni speaks as himself.

## Code conventions that aren't obvious from the code

- **Logging**: `createLogger` from `src/utils/logger.js`, never `console.*`.
  Never swallow an error (`.catch(() => {})`); log it with context.
- **Types**: no `any`, no `as any`. Use `unknown` and narrow.
- **Layers** point inward: L5 entrypoints → L4 orchestration → L3 (ten capability
  contexts, via each other's index.ts) → L2 shared kernel; L1 adapters implement L2/L3 ports.
  Map: `apps/cli/src/commands/quality/architecture-layers.ts`; `pnpm quality:arch` fails new violations.
- **Names**: files are kebab-case. Name by function, not acronym or version
  (`tool-classifier.ts`, not `ftis-v2.ts`). No persona names in tool files.
- **Classifiers on user text** match whole words, never substrings
  ("informal" contains "formal").
- **Frontend**: colors, durations and shadows come from design tokens
  (`var(--color-*)`); edit `design-system/tokens/*.json` and run
  `pnpm tokens:sync`. Never edit `*.generated.*`.
- **Tests**: Vitest, next to the code in `__tests__/`. A test named after a
  behaviour must fail when the behaviour is missing: no `>= 0` or `true` asserts.

## Commands

```bash
pnpm install                 # pnpm only
pnpm typecheck               # tsc, 8 GB heap
pnpm vitest run <path>       # targeted tests; pnpm test runs everything
pnpm lint:fix                # eslint autofix
pnpm quality                 # typecheck + lint + format + builders (before a PR)
pnpm tsx apps/cli/src/commands/quality/ratchet.ts   # the CI quality ratchet
pnpm build:fast              # esbuild
```

## Where to look (load on demand)

- `docs/archive/2026-10-08-former-claude-md.md`: the former 2,000-line
  CLAUDE.md, archived. Subsystem overviews (memory, personas, tools, design
  system, CLI). **Partly outdated: verify against the code.**
- `src/**/CLAUDE.md`: notes for a subsystem, read when you work in it.
- `docs/DEFINITION-OF-CLEAN.md`: what "clean" means here.
- `scripts/voice-eval/`: the live-call eval harness and its scenarios.
