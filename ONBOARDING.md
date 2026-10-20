# Developer onboarding

Your first day: get the code running locally, run the checks, and land a small
PR. For what Ferni is and the repo map, see [README.md](./README.md).

## 1. Prerequisites

- **Node 22** (`.nvmrc`; CI uses 22 too).
- **pnpm 10** (`packageManager` in `package.json`). `corepack enable` gives
  you the pinned version. Don't use npm or yarn to install.
- **gcloud**, logged in, for Secret Manager and Vertex
  (`gcloud auth application-default login`).
- **gh** (GitHub CLI) for issues, PRs and the merge queue.
- **lk** (LiveKit CLI) only if you will deploy the voice agent.

## 2. Install

```bash
git clone https://github.com/ferni-ai/voiceai.git && cd voiceai
pnpm install
```

`pnpm install` also sets `core.hooksPath` to `.husky`, so the pre-commit,
commit-msg and pre-push hooks run. Never skip them (`--no-verify`).

## 3. Environment

```bash
cp .env.example .env
```

Fill in the keys `.env.example` marks `[REQUIRED]`: `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GOOGLE_API_KEY`, `CARTESIA_API_KEY`.
The cascade's LLM runs on Vertex, so also set `GOOGLE_CLOUD_PROJECT`
(`src/agents/model-provider/cartesia-cascade.ts`). Ask for dev values rather
than creating your own accounts; secrets live in Secret Manager. Every other
variable is in [docs/guides/environment-variables.md](./docs/guides/environment-variables.md).

Local processes refuse to open production data
(`src/config/refuse-production-data.ts`).

## 4. Run it

There is no single command that starts everything. `pnpm dev` starts **only
the voice agent worker**: it rebuilds the tool manifest and embeddings, then
runs `src/agent.ts dev`, which registers with the LiveKit project in your
`.env`.

| Terminal | Command | What it starts |
|---|---|---|
| 1 | `pnpm dev` | Voice agent worker (`PERSONA_ID` picks the persona) |
| 2 | `pnpm ui-server` | UI/API server on :3002 (`src/servers/api/index.ts`): tokens, auth, APIs |
| 3 | `pnpm -C apps/web dev` | Web app on http://localhost:3004 (proxies `/token`, `/api` and the rest to :3002) |

`pnpm dev:full` runs terminals 1 and 2 together.

## 5. Checks

```bash
pnpm typecheck               # always this, not plain tsc (it can run out of memory silently)
pnpm test:unit               # unit tests
pnpm vitest run <path>       # the tests for what you changed
pnpm test:frontend           # web app tests (apps/web)
pnpm lint:fix                # eslint autofix
pnpm quality                 # typecheck + lint + format + builders + tests, before a PR
```

Tests are Vitest, next to the code in `__tests__/`.

## 6. Your first PR

The full rules are in [AGENTS.md](./AGENTS.md) and
[docs/agent/operating-model.md](./docs/agent/operating-model.md). In short:

1. Start from an issue (templates in `.github/ISSUE_TEMPLATE/`). The PR says `Closes #N`.
2. Branch from `origin/main`: `git fetch origin && git switch -c <type>/<slug> origin/main`.
3. One concern per PR, about 400 reviewable lines or fewer (`scripts/ci/reviewable.sh`
   counts them; the pre-push hook blocks over 1000).
4. New behaviour goes behind an env flag that is off by default.
5. Commit subjects are conventional and all lower-case (`fix: ...`, `docs: ...`).
6. Merge through the queue: `gh pr merge <n> --auto`, without `--squash`.
7. Done means merged, deployed to dev, and checked there
   ([docs/runbooks/deploy.md](./docs/runbooks/deploy.md)).

## Where to read next

- `src/**/CLAUDE.md`: notes for the subsystem you're working in
  (for example `src/tools/CLAUDE.md`, `src/personas/CLAUDE.md`, `apps/web/CLAUDE.md`).
- [docs/README.md](./docs/README.md): the docs that are kept current.
- [docs/DEFINITION-OF-CLEAN.md](./docs/DEFINITION-OF-CLEAN.md): the quality bar.
