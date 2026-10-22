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

CLI profiles: `ferni-dev` and `ferni-prod` (`lk project list`). The prod LiveKit
Cloud project's own name is still `test` (subdomain `test-rvg91u1z`), so never
pick a project by the name `test`. If a profile is missing, add it once with
`lk project add ferni-prod --url wss://test-rvg91u1z.livekit.cloud --api-key … --api-secret …`
(keys from Secret Manager; never print them).

Always pass absolute `--project` and `--config` paths. Never print secrets.

## Deploy (one `&&` chain: any failure stops it)
The room check fails closed: if `lk` can't reach the project (wrong or
missing profile, bad keys), the chain stops instead of reading the error as
"no rooms". Never deploy while a room is live; that cuts a caller off.
Run from a clean checkout of the commit you're deploying, normally `origin/main`:
```bash
P=ferni-dev; C=$(git rev-parse --show-toplevel)/livekit.toml   # prod: ferni-prod + livekit.prod-cloud.toml
LOG=$(mktemp)
# lk tags git_commit with git's shortest unique SHA (9 chars, then 10, growing), so
# match the Production row's git_commit as a prefix of the full HEAD.
live() { G=$(lk agent versions --project $P --config $C 2>/dev/null | awk -F'│' '$3 ~ /✓/' \
  | sed -n 's/.*"git_commit":"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)
  [ -n "$G" ] && case $(git rev-parse HEAD) in "$G"*) ;; *) false ;; esac; }
[ -z "$(git diff --name-only --diff-filter=U)" ] \
 && [ -z "$(git status --porcelain --untracked-files=no)" ] \
 && git merge-base --is-ancestor HEAD origin/main \
 && pnpm install --frozen-lockfile >/dev/null \
 && pnpm typecheck >/dev/null \
 && ROOMS=$(lk room list --project $P 2>&1) \
 && echo "$ROOMS" | grep -q "Using project \[$P\]" \
 && [ "$(echo "$ROOMS" | grep -c '│ RM_')" = 0 ] \
 && git rev-parse HEAD > .build-sha \
 && cp docker/Dockerfile.agent ./Dockerfile \
 && { lk agent deploy --project $P --config $C -y . > $LOG 2>&1; rm -f Dockerfile .build-sha; } \
 && ! grep -qE "error TS[0-9]{4}|^(#[0-9]+ )?ERROR:|[Bb]uild failed|✘ \[ERROR\]" $LOG \
 && ! { grep "unable to deploy agent" $LOG | grep -v "bufio.Scanner" | grep -q .; } \
 && for i in $(seq 1 16); do live && break; sleep 15; done \
 && live \
 && echo DEPLOYED $(git rev-parse HEAD)
```
- `unable to deploy agent: bufio.Scanner: token too long` at the end is harmless.
- The check pipes into `grep -q .` instead of `grep -qv`: some greps (ugrep, which Claude Code shells use as `grep`) return 0 for `-qv` on empty input, so a clean deploy read as failed (2026-10-22, both dev and prod).
- Any other `unable to deploy agent: …` (for example `stream error … INTERNAL_ERROR`)
  means the upload failed, even though `lk` exits 0. LiveKit's log lines aren't proof
  either way: after the harmless bufio message there's no "Completed deployment" line.
  So the chain only prints DEPLOYED once `lk agent versions` shows your commit as
  Production (it waits up to 4 minutes).
- The build log echoes minified bundle code, which contains strings like
  `ERROR:` mid-line. The check only matches real error lines (tsc `error TS2322`,
  a BuildKit line starting `ERROR:` or `#14 ERROR:`, esbuild `✘ [ERROR]`).
- Then wait until the new version is live:
  `lk agent versions --project $P --config $C`. The row with ✓ in
  Production must show your `git_commit` (a prefix of `git rev-parse HEAD`; its
  length varies). Give it about 45 s more before calling.
- `.build-sha` carries the commit into the image (lk passes no build args), so
  the boot `EFFECTIVE_SETTINGS` line shows it instead of `unknown`. It is
  gitignored, so the tree stays clean, and `.dockerignore` re-includes it because
  `lk` applies `.gitignore` to its upload.
- The command refuses a commit that isn't on `origin/main` (its
  `git merge-base --is-ancestor` step; no hook does this for you, so don't
  deploy any other way). Trying a branch on dev before merging is the one
  exception: drop that step knowingly and say why in the PR. Never on prod.

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

## Before promoting dev to prod
Sweep dev (skill `voice-eval`, serially), with the same scenarios as the last
release's sweep. Then run the release check on dev:
```bash
node scripts/voice-eval/release-check.mjs dev <candidate-sha> <prod-sha> \
  --candidate <this sweep's dir> --baseline <last release's sweep dir> | tee release-check.txt
```
Promote only on `RESULT_release_check=PASS` (exit 0). Paste the output into
the release PR. A FAIL or INCONCLUSIVE result blocks the release. Fix the
cause, or add scenarios or repeats and re-run. Don't swap in a hand-written
canary. Details: `scripts/voice-eval/README.md`, "Checking a release".
