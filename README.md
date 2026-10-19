# Ferni

Ferni is a voice AI companion ("making AI human"). You talk to Ferni in the
web app; a LiveKit voice agent runs the conversation through a Cartesia
cascade: Ink-2 speech-to-text, Gemini 3.5 Flash on Vertex, Cartesia Sonic
text-to-speech, with native function calling, memory and tools.

The mission and principles are in [CORE-PRINCIPLES.md](./CORE-PRINCIPLES.md).
The current stack, verified against the code, is in [AGENTS.md](./AGENTS.md).

## Repo map (the parts that run in production)

| Path | What it is | How it ships |
|---|---|---|
| `src/` | Voice agent (entry `src/agent.ts`, pipeline in `src/agents/model-provider/`), plus the UI/API server (`src/servers/api/index.ts`) | Agent: LiveKit Cloud, by hand. UI server: Cloud Run `john-bogle-ui`, automatically from `main` |
| `apps/web/` | The web app (Vite, TypeScript) | Firebase Hosting, automatically from `main` |
| `apps/website/ferni-website/` | Marketing website | Firebase Hosting, automatically from `main` |
| `apps/cli/` | The `ferni` CLI (dev, test, quality, ops tooling) | Run from the repo |
| `apps/async/` | Async workers | `ferni deploy async` |
| `design-system/` | Design tokens and brand assets used by the web app and website | With its consumers |
| `docker/` | `Dockerfile.agent` (voice agent), `Dockerfile.ui` (UI server) | |
| `infra/` | Cloud Scheduler, Cloud Armor and other GCP config | |
| `scripts/` | Build, CI and eval scripts (live-call evals in `scripts/voice-eval/`) | |

The other folders under `apps/` (native apps, `apps/sonata/`, Rust audio and
more) are outside the production path above; see each folder's own notes.
Much of `docs/` describes retired setups (GCE, Gemini Live, OpenAI Realtime),
so check a doc against the code before relying on it.

## Quick start

Node 22 (`.nvmrc`) and pnpm 10 (`package.json` `packageManager`).

```bash
pnpm install                 # pnpm only; also points git hooks at .husky
cp .env.example .env         # fill in the [REQUIRED] keys
pnpm dev                     # the voice agent worker (src/agent.ts dev)
pnpm ui-server               # UI/API server on :3002 (second terminal)
pnpm -C apps/web dev         # web app on :3004 (third terminal)
```

`pnpm typecheck` and `pnpm test:unit` are the first checks to run. Full
first-day setup: [ONBOARDING.md](./ONBOARDING.md).

## Where to go next

- [ONBOARDING.md](./ONBOARDING.md): setup, what each process does, tests, your first PR.
- [CONTRIBUTING.md](./CONTRIBUTING.md): code rules and the PR process.
- [AGENTS.md](./AGENTS.md): how work ships and the hard rules (read before your first PR).
- [docs/README.md](./docs/README.md): index of the docs that are kept current.
- [docs/runbooks/deploy.md](./docs/runbooks/deploy.md): how each part deploys and rolls back.
