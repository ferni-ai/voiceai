# Contributing to Ferni

> **We believe in making AI human, and the decisions we make will reflect that.**

Before your first PR, read [CORE-PRINCIPLES.md](./CORE-PRINCIPLES.md) (why),
[AGENTS.md](./AGENTS.md) (how work ships, and the hard rules) and
[docs/agent/operating-model.md](./docs/agent/operating-model.md) (issues, the
board, review). Setup is in [ONBOARDING.md](./ONBOARDING.md).

Ask of every change: does it make Ferni feel more human, does it serve the
relationship, is it honest to Ferni's character?

## Code rules

| Never | Instead |
|---|---|
| `console.*` | `createLogger()` from `src/utils/safe-logger.ts` |
| `.catch(() => {})` | log the error with context |
| `any`, `as any` | `unknown`, then narrow |
| growing a file past 500 lines | a new module (the ratchet fails it) |
| hardcoded colors, durations, shadows | design tokens (`var(--color-*)`); edit `design-system/tokens/*.json`, then `pnpm tokens:sync` |
| editing `*.generated.*` files | change the source and regenerate |
| em dashes, ellipses or stage directions in what Ferni says | the rules in `src/agents/personas/speech-markup-notes.ts` |
| substring matches in classifiers on user text | whole-word matches ("informal" contains "formal") |

Names: files are kebab-case and named by what they do, not by acronym,
version or persona (`habit-coaching.ts`, not `maya-habits.ts`). Imports use
the `.js` extension. Layers point inward; `pnpm quality:arch` fails new
violations.

## Tests

Vitest, next to the code in `__tests__/`. A test named after a behaviour must
fail when that behaviour is missing: no `>= 0` or `toBe(true)` placeholders.
Test both states of any new flag.

```bash
pnpm vitest run <path>       # the tests for your change
pnpm typecheck               # never plain tsc
pnpm quality                 # typecheck + lint + format + builders + tests
```

## Common changes

- **A tool**: read `src/tools/CLAUDE.md`; tools live under `src/tools/domains/`.
- **A persona**: read `src/personas/CLAUDE.md`; bundles live in
  `src/personas/bundles/<id>/` with a `persona.manifest.json`. Try one locally
  with `PERSONA_ID=<id> pnpm dev`.
- **A context builder**: read `src/intelligence/context-builders/CLAUDE.md`.
- **An API route**: route modules are in `src/api/`, served by the UI/API
  server in `src/servers/api/`.
- **Web UI**: read `apps/web/CLAUDE.md`.

## Pull requests

1. One issue, one PR, `Closes #N` in the description.
2. Branch from `origin/main`; never stack on another unmerged branch.
3. About 400 reviewable lines or fewer, one concern. Split bigger work.
4. New behaviour behind an env flag that is off by default.
5. Commit subjects: conventional type (`feat fix refactor docs test chore
   style perf ci revert`), entirely lower-case. commitlint enforces it.
6. Fill in the PR template (`.github/pull_request_template.md`) and paste the
   checks you ran.
7. Merge through the queue: `gh pr merge <n> --auto` (no `--squash`; the queue
   squashes).

The reviewer is never the author. Reviews follow the Review section of the
operating model.

## Code of conduct

Be respectful and constructive, welcome newcomers, review the code and not
the person, and assume good intent.
