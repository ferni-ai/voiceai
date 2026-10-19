# Ferni docs: the ones kept current

This index lists only living docs. Everything else in `docs/` is history:
plans, audits and guides written for setups that have since changed (GCE,
Gemini Live, OpenAI Realtime, `ferni deploy`). Check those against the code
before acting on them, and when you fix or retire one, update this list.

## Start here

| Doc | Read it for |
|---|---|
| [README.md](../README.md) | What Ferni is, the repo map, quick start |
| [ONBOARDING.md](../ONBOARDING.md) | First-day setup, local processes, checks, first PR |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Code rules and the PR process |
| [AGENTS.md](../AGENTS.md) | The stack today, how work ships, hard rules |
| [CORE-PRINCIPLES.md](../CORE-PRINCIPLES.md) | The mission behind product decisions |

## How work runs

| Doc | Read it for |
|---|---|
| [agent/operating-model.md](./agent/operating-model.md) | Issues, the board, work in flight, review |
| [agent/fleet-rules.md](./agent/fleet-rules.md) | Rules for parallel agent sessions |
| [agent/fleet-handoff.md](./agent/fleet-handoff.md) | A dated snapshot of the fleet queue (check `gh` before acting) |
| [DEFINITION-OF-CLEAN.md](./DEFINITION-OF-CLEAN.md) | The quality bar the ratchet enforces |

## The system

| Doc | Read it for |
|---|---|
| [VOICE-STACK-DIRECTION.md](./VOICE-STACK-DIRECTION.md) | The Cartesia cascade, and what was removed |
| [FOCUS-EVERYTHING-ELSE.md](./FOCUS-EVERYTHING-ELSE.md) | What to fix, wire or prove next |
| [architecture/ci-deployment-current.md](./architecture/ci-deployment-current.md) | CI and the deploy workflows |
| [guides/environment-variables.md](./guides/environment-variables.md) | Environment variables |

## Runbooks

| Doc | Read it for |
|---|---|
| [runbooks/deploy.md](./runbooks/deploy.md) | Deploying and rolling back every part |
| [runbooks/cohort-rollout.md](./runbooks/cohort-rollout.md) | Turning a flag on for one audience at a time |
| [runbooks/FERNI-LIVENESS.md](./runbooks/FERNI-LIVENESS.md) | The liveness check and what to do when it fails |
| [runbooks/firestore-indexes.md](./runbooks/firestore-indexes.md) | Which Firestore indexes are ours, and which never to prune |

## In the code

- `src/**/CLAUDE.md` and `apps/*/CLAUDE.md`: notes for one subsystem, read
  when you work in it (for example `src/tools/CLAUDE.md`, `apps/web/CLAUDE.md`).
- `.claude/skills/`: `ship-change`, `deploy-agent` and `voice-eval` hold the
  exact commands for shipping, deploying and live-call evals.
- [archive/2026-10-08-former-claude-md.md](./archive/2026-10-08-former-claude-md.md):
  the old 2,000-line CLAUDE.md, with subsystem overviews. Partly outdated.
