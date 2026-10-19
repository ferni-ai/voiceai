# Deploy and roll back

Each part of Ferni ships one way. Only commits on `origin/main` ship to
production. The `ferni` CLI no longer deploys, restarts or rolls back the
voice agent or the web services: `ferni deploy agent`, `ferni restart agent`
and `ferni rollback agent` exit with an error that points here
(`apps/cli/src/utils/livekit-agent.ts`, `apps/cli/src/commands/deploy/deploy.ts`).

| Part | Runs on | Ships by | Rolls back by |
|---|---|---|---|
| Voice agent (`src/agent.ts`, `docker/Dockerfile.agent`) | LiveKit Cloud | `lk agent deploy`, by hand, through the deploy-agent skill | `lk agent rollback`, same skill |
| UI/API server (`src/servers/api/`, `docker/Dockerfile.ui`) | Cloud Run `john-bogle-ui` | `.github/workflows/deploy-production.yml`, automatically from `main` | the workflow itself on a failed health check; `.github/workflows/rollback.yml` |
| Web app (`apps/web/`) | Firebase Hosting sites `ferni-prod` and `johnb-app` (app.ferni.ai) | `.github/workflows/deploy-firebase.yml`, job `deploy-app`, on push to `main` | the workflow itself on a failed health check |
| Website (`apps/website/ferni-website/`) | Firebase Hosting site `ferni-landing` | `.github/workflows/deploy-firebase.yml`, job `deploy-landing`, on push to `main` | the workflow itself on a failed health check |
| Async workers (`apps/async/`) | Cloud Run | `ferni deploy async` | |

## Voice agent (LiveKit Cloud)

| | dev | prod |
|---|---|---|
| Project / agent | `ferni-dev` / `CA_siTDMHEba4Fg` | `ferni-prod` / `CA_GeFvEpsNXLSF` |
| Config | `livekit.toml` | `livekit.prod-cloud.toml` |
| May ship | a commit on `origin/main` | a commit on `origin/main` that has already run on dev |

The exact commands are in **[the deploy-agent skill](../../.claude/skills/deploy-agent/SKILL.md)**
(in Claude Code: `/deploy-agent`). Use its chain as written; it is the only
deploy path. What it guarantees, so you know what not to skip:

- the tree is clean and `HEAD` is on `origin/main`, and `pnpm typecheck` passes;
- no room is live (`lk room list` shows none): a deploy, restart, secret
  change or rollback drops live calls;
- `lk agent deploy` really deployed: `lk` can exit 0 on a failed upload, so
  the chain waits until `lk agent versions` shows your commit in Production.

Flags and secrets: `lk agent update-secrets`, one `--secrets "KEY=value"` per
key, `off` instead of an empty value. It restarts the agent. Turn a flag on
in dev first, and in prod only after it has been heard on dev.

Roll back: find the last good version with `lk agent versions`, then
`lk agent rollback --version <id>`, with the skill's `--project` and
`--config`, rooms empty first. `rollback.yml` with `service=voice-agent` only
prints this command; it does not roll anything back.

After any agent deploy, run one live-call eval and read the transcript
(`scripts/voice-eval/run.sh`, skill `voice-eval`).

## UI/API server (Cloud Run `john-bogle-ui`)

Merging to `main` deploys it. The workflow gates on CI's verdict for the
commit, deploys a new revision with no traffic, health-checks it, and only
then moves traffic; an unhealthy revision never takes traffic. The workflow
never deploys the voice agent to Cloud Run (a Cloud Run worker would steal
LiveKit jobs and fail them).

```bash
gh workflow run deploy-production.yml --ref main -f service=ui-server           # redeploy main
gh workflow run rollback.yml -f service=ui-server -f reason="<why>"            # previous revision
gh workflow run rollback.yml -f service=ui-server -f target=<sha> -f reason="<why>"
```

## Web app and website (Firebase Hosting)

Every push to `main` runs both jobs of `deploy-firebase.yml`. Each builds,
deploys, health-checks the live site and runs `firebase hosting:rollback` if
the check fails.

```bash
gh workflow run deploy-firebase.yml --ref main -f target=app        # or landing, or both
```

## See also

- [docs/architecture/ci-deployment-current.md](../architecture/ci-deployment-current.md): the CI and deploy workflows.
- [AGENTS.md](../../AGENTS.md): the shipping rules these deploys enforce.
