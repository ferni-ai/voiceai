# Ferni: instructions for coding agents

Ferni is a voice AI companion ("making AI human"). This file is the one set of
instructions for every coding agent (Claude Code reads it through `CLAUDE.md`;
Codex, Cursor and others read it directly). It holds only what the code can't
tell you: how work ships here, and the traps that have cost us before. For
anything else, read the code, and `docs/agent/` on demand.

## The stack today (verified 2026-10-08)

| Part | What runs | Where it's defined |
|---|---|---|
| Voice agent | LiveKit Cloud agents. Dev `CA_siTDMHEba4Fg` (project `ferni-dev`, dispatch name `voice-agent-lkcloud`), prod `CA_GeFvEpsNXLSF` (project `ferni-prod`). The GCE VM is gone. | `livekit.toml`, `livekit.prod-cloud.toml`, `docker/Dockerfile.agent` |
| Voice pipeline | Cartesia cascade: Ink-2 STT → Gemini 3.5 Flash (Vertex) → Cartesia Sonic TTS, native function calling | `src/agents/model-provider/factory.ts` |
| Agent config | Env secrets on the LiveKit agent. Behaviour changes ship **behind a flag, off by default**. | `lk agent update-secrets` |
| UI server | Cloud Run `john-bogle-ui`, deployed by GitHub Actions on every push to `main` | `.github/workflows/deploy-production.yml` |
| Quality bar | `docs/DEFINITION-OF-CLEAN.md`, enforced by the ratchet | `apps/cli/src/commands/quality/ratchet.ts` |

Docs elsewhere that mention GCE, Gemini Live, OpenAI Realtime, a JSON
function-call workaround or Sonata are describing retired setups.

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
   to dev from `main`, and checked there.
5. **Merge through the queue**: `gh pr merge <n> --auto`, with no
   `--squash` (the queue squashes; passing it errors and leaves auto-merge
   off). Never `gh pr update-branch` a PR that is already queued.
6. **Deploy only commits that are on `origin/main`** (skill: `deploy-agent`).
   Prod deploys only what has run on dev.
7. Delete your worktree when its PR merges.

## Hard rules (each one cost us before)

- **Never print, log or commit secrets.** Read them into env vars from Secret
  Manager (`gcloud secrets versions access latest --secret=<name> --project=johnb-2025`).
- **Never skip git hooks** (`--no-verify`, `core.hooksPath`), not even for local commits.
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
- **Layers**: `agents/` and `api/` → `personas/ intelligence/ tools/
  conversation/ speech/` → `services/` → `memory/` → `config/ utils/ types/`.
  Lower layers never import higher ones (`pnpm quality:arch`).
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

- `docs/agent/reference.md`: the former 2,000-line CLAUDE.md. Subsystem
  overviews (memory, personas, tools, design system, CLI). **Partly outdated:
  verify against the code.**
- `src/**/CLAUDE.md`: notes for a subsystem, read when you work in it.
- `docs/DEFINITION-OF-CLEAN.md`: what "clean" means here.
- `scripts/voice-eval/`: the live-call eval harness and its scenarios.
