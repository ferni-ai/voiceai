---
name: deploy-agent
description: Deploy the Ferni voice agent to LiveKit Cloud (dev or prod), change its env secrets or flags, or roll it back. Use for "deploy to dev", "ship to prod", "turn on FLAG", "set a secret", "roll back the agent". Runs every safety gate in one chain.
---

# Deploy the voice agent

| | dev | prod |
|---|---|---|
| Project / agent | `ferni-dev` / `CA_siTDMHEba4Fg` | `ferni-prod` / `CA_GeFvEpsNXLSF` |
| Config | `<repo>/livekit.toml` | `<repo>/livekit.prod-cloud.toml` |
| What may ship | a commit on `origin/main` | a commit on `origin/main` that has already run on dev |

Always pass absolute `--project` and `--config` paths. Never print secrets.

## Deploy (one `&&` chain: any failure stops it)
Run from a clean checkout of the commit you're deploying, normally `origin/main`:
```bash
P=ferni-dev; C=$(git rev-parse --show-toplevel)/livekit.toml   # prod: ferni-prod + livekit.prod-cloud.toml
LOG=$(mktemp)
[ -z "$(git diff --name-only --diff-filter=U)" ] \
 && [ -z "$(git status --porcelain --untracked-files=no)" ] \
 && git merge-base --is-ancestor HEAD origin/main \
 && pnpm install --frozen-lockfile >/dev/null \
 && pnpm typecheck >/dev/null \
 && [ "$(lk room list --project $P | grep -c '│ RM_')" = 0 ] \
 && cp docker/Dockerfile.agent ./Dockerfile \
 && { lk agent deploy --project $P --config $C -y . > $LOG 2>&1; rm -f Dockerfile; } \
 && ! grep -qiE "error TS|ERROR:|build failed|✘ \[ERROR\]" $LOG \
 && echo DEPLOYED $(git rev-parse --short=9 HEAD)
```
- `unable to deploy agent: bufio.Scanner: token too long` at the end is harmless.
- Then wait until the new version is live:
  `lk agent versions --project $P --config $C`. The row with ✓ in
  Production must show your `git_commit`. Give it about 45 s more before calling.
- The deploy hook refuses a commit that isn't on `origin/main`. Trying a
  branch on dev before merging is the exception, and it says why:
  `PDLC_DEPLOY_UNMERGED="<reason>" lk agent deploy ...` (dev only; prod has no
  override).

## Flags and secrets
```bash
lk agent update-secrets --project $P --config $C --secrets "FLAG=on" --secrets "OTHER=off"
```
- Use one `--secrets` per key; commas don't split.
- It merges unless you pass `--overwrite`.
- An empty value is rejected, so use `off`.
- It restarts the agent, so check rooms are empty first.
- When turning a flag on in prod, record the change in the PR that added the flag.

Check for drift between dev and prod before a prod deploy:
`lk agent secrets --project <p> --config <c>` lists names only. Compare the
two lists and explain any difference.

## Roll back
```bash
lk agent versions --project $P --config $C        # find the last good version id
lk agent rollback --project $P --config $C --version <id>
```

## After deploying
Run `scripts/voice-eval/run.sh <dev|prod> long-day <label>` once (skill
`voice-eval`) and look at the transcript before calling it done.
