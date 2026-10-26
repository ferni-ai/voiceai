#!/bin/bash
# Nightly capability sweep on ferni-dev: claim dev, deploy origin/main to dev, run
# lanes a and b (the 2026-10-21 scenario set), judge, pull the agent logs, analyze,
# score each capability (scorecard.mjs) and report. Dev only: no prod path exists here.
#
# usage: scripts/voice-eval/nightly/run-nightly.sh     (from ~/Projects/voiceai at origin/main)
#   NIGHTLY_DRY_RUN=1   print the plan and run nothing (no claim, deploy, call or write)
#   NIGHTLY_DEPLOY=0    skip the deploy and test whatever dev runs now (default 1)
#   NIGHTLY_OUT         default ~/Documents/voiceai-evidence/nightly/<YYYY-MM-DD>
#   NIGHTLY_ISSUE       tracking issue for the public comment, verdicts only (default 2407)
#   NIGHTLY_CLEANUP_MIN_AGE_H  cleanup-users --min-age-hours (default 1)
#   NIGHTLY_LANES       directory holding a.txt and b.txt (default lanes/ beside this script)
# Exit: scorecard's 0 (nothing new) / 1 (new FAIL or regression) / 2 (harness or deploy
# error), 3 when ferni-dev is claimed by someone else. On exit or a signal, a trap stops the
# lanes (every run.sh under them), cleans up, reports, and only then releases the claim.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
HERE=$ROOT/scripts/voice-eval/nightly EVAL=$ROOT/scripts/voice-eval
DATE=$(date -u +%F) TAG=n$(date -u +%m%d)
OUT=${NIGHTLY_OUT:-$HOME/Documents/voiceai-evidence/nightly/$DATE}
DRY=${NIGHTLY_DRY_RUN:-0}
P=ferni-dev CONF=$ROOT/livekit.toml DEV_AGENT=CA_siTDMHEba4Fg GCP=johnb-2025
CLAIM=$HOME/.claude/coordination/claim.py BOARD=$HOME/.claude/coordination/board.md
ISSUE=${NIGHTLY_ISSUE-2407} LANES_DIR=${NIGHTLY_LANES:-$HERE/lanes}
# A call that runs longer than this is killed so the rest of its lane still runs
# (2026-10-23: one hung converse.mjs held lane B for 47 min).
CALL_MAX_S=${NIGHTLY_CALL_MAX_S:-900}
# claim.py names its owner by session id: the sweep always claims as itself, never as the caller
export CLAUDE_CODE_SESSION_ID=nightly-sweep CLAUDE_SESSION_NAME=nightly-sweep
# Vertex Gemini requests from this run carry billing label ferni_job=nightly_sweep
export GEMINI_BILLING_JOB=nightly_sweep
RC=2 CLAIMED=0 LANES=0 STATUS=harness-error REASON="harness error" LANE_PIDS="" RENEW_PID="" RUNNER=$$
cd "$ROOT" || exit 2

say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
log() { if [ "$DRY" = 1 ]; then return; fi; say "$*" >> "$OUT/nightly.log"; }
# step NAME DESCRIPTION FUNCTION...: the dry run prints the plan, a live run logs and runs it
step() {
  local name=$1 what=$2; shift 2
  if [ "$DRY" = 1 ]; then printf 'PLAN %-9s %s\n' "$name" "$what"; return 0; fi
  log "$name: $what"
  "$@"
}
trim() { local s=$1; s=${s#"${s%%[![:space:]]*}"}; printf '%s' "${s%"${s##*[![:space:]]}"}"; }
# ISO time $1 seconds ago (negative: ahead). `--` so node takes "-120" as an argument, not an option.
iso_ago() { node -e 'console.log(new Date(Date.now() - process.argv[1] * 1000).toISOString())' -- "$1"; }

# Live rooms on dev (eval-* excluded unless $1 = all); fails when lk can't reach the project.
live_rooms() {
  local json
  json=$(lk room list --project $P --json 2>/dev/null) || return 2
  printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of (JSON.parse(s||"{}").rooms??[])) if((process.argv[1]==="all"||!r.name.startsWith("eval-"))&&(r.numParticipants??0)>0) console.log(r.name.replace(/[0-9]{6,}/g,"#"))})' -- "${1:-}"
}
# Wait up to 10 min for no live rooms (non-eval only unless $1 = all).
wait_rooms() {
  local busy waited=0
  while busy=$(live_rooms "${1:-}") || return 1; [ -n "$busy" ]; do
    log "WAIT room live: $busy"
    waited=$((waited + 30)); [ $waited -gt 600 ] && return 1
    sleep 30
  done
}

write_status() { # status reason: a night with no scorecard still leaves a report (HARNESS ERROR, ...)
  local up; up=$(printf '%s' "$1" | tr 'a-z-' 'A-Z ')
  mkdir -p "$OUT"
  printf '{"status":"%s","date":"%s","reason":"%s"}\n' "$1" "$DATE" "$2" > "$OUT/scorecard.json"
  printf '# Nightly capability sweep %s\n\n%s: %s\n' "$DATE" "$up" "$2" > "$OUT/REPORT.md"
  printf '**%s**: %s (%s)\n' "$DATE" "$up" "$2" > "$OUT/COMMENT.md"
}
# 0 claimed, 3 held by someone else, 2 claim.py itself failed (a harness error, not "busy")
do_claim() {
  local err
  err=$(python3 "$CLAIM" acquire $P --why "nightly capability sweep" --ttl 45 2>&1 >/dev/null) && { CLAIMED=1; return 0; }
  log "claim.py: $err"
  case $err in "HELD by "*) return 3 ;; *) return 2 ;; esac
}
# The claim has a 45 min TTL; this renews it every 10 min until finish stops it.
renew_claim() { # polls every 60 s, renews every 10th poll, and quits once the runner is gone
  local n=0
  while sleep "${NIGHTLY_RENEW_POLL_S:-60}"; do
    kill -0 "$RUNNER" 2> /dev/null || exit 0 # runner SIGKILLed: the claim lapses within its TTL
    n=$((n + 1)); [ $((n % ${NIGHTLY_RENEW_EVERY:-10})) = 0 ] || continue
    python3 "$CLAIM" acquire $P --why "nightly capability sweep" --ttl 45 > /dev/null 2>&1
  done
}
tree() { local c; echo "$1"; for c in $(pgrep -P "$1"); do tree "$c"; done; }
# Stop background jobs and everything under them: freeze the tree (so nothing new starts),
# TERM it, then KILL what is left, and wait. Used before cleanup and the claim release.
stop_jobs() {
  local all="" p
  [ -n "$*" ] || return 0
  # shellcheck disable=SC2086 # pid lists
  for _ in 1 2 3; do for p in "$@"; do all="$all $(tree "$p")"; done; kill -STOP $all 2> /dev/null; done
  # shellcheck disable=SC2086
  { kill -TERM $all; kill -CONT $all; sleep 2; kill -KILL $all; } 2> /dev/null
  for p in "$@"; do wait "$p" 2> /dev/null; done
}

# The deploy-agent skill's dev chain (.claude/skills/deploy-agent), fixed to ferni-dev.
do_deploy() {
  local dlog=$OUT/deploy.log
  local want; want=$(cd "$HOME/Projects/voiceai" 2> /dev/null && pwd -P)
  [ -n "$want" ] && [ "$(pwd -P)" = "$want" ] || { log "deploys run only from ~/Projects/voiceai, not $(pwd -P)"; return 1; }
  git fetch -q origin main && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
    || { log "HEAD is not origin/main"; return 1; }
  wait_rooms all || { log "a dev room stayed live"; return 1; }
  live() {
    local g
    g=$(lk agent versions --project $P --config "$CONF" 2>/dev/null | awk -F'│' '$3 ~ /✓/' \
      | sed -n 's/.*"git_commit":"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)
    [ -n "$g" ] && case $(git rev-parse HEAD) in "$g"*) ;; *) false ;; esac
  }
  local rooms
  [ -z "$(git diff --name-only --diff-filter=U)" ] \
    && [ -z "$(git status --porcelain)" ] \
    && git merge-base --is-ancestor HEAD origin/main \
    && pnpm install --frozen-lockfile > /dev/null \
    && pnpm typecheck > /dev/null \
    && rooms=$(lk room list --project $P 2>&1) \
    && echo "$rooms" | grep -q "Using project \[$P\]" \
    && [ "$(echo "$rooms" | grep -c '│ RM_')" = 0 ] \
    && git rev-parse HEAD > .build-sha \
    && cp docker/Dockerfile.agent ./Dockerfile \
    && { lk agent deploy --project $P --config "$CONF" -y . > "$dlog" 2>&1; rm -f Dockerfile .build-sha; } \
    && ! grep -qE "error TS[0-9]{4}|^(#[0-9]+ )?ERROR:|[Bb]uild failed|✘ \[ERROR\]" "$dlog" \
    && ! grep "unable to deploy agent" "$dlog" | grep -qv "bufio.Scanner" \
    && for _ in $(seq 1 16); do live && break; sleep 15; done \
    && live && sleep 45 && log "DEPLOYED $(git rev-parse HEAD)"
}
# One lane file: "ENV | scenario | label | uid | capability" per line.
lane() {
  local file=$1 llog=$2 envs sc label uid cap rc name cpid wpid tflag
  name=$(basename "$file" .txt)
  while IFS='|' read -r envs sc label uid cap; do
    envs=$(trim "$envs"); sc=$(trim "${sc:-}"); label=$(trim "${label:-}"); uid=$(trim "${uid:-}")
    case $envs in '#'* | '') continue ;; esac
    if [ "$sc" = SLEEP ]; then [ "$DRY" = 1 ] || sleep "$label"; continue; fi
    [ "$uid" = @memlive ] && uid=$MEMLIVE
    if [ "$DRY" = 1 ]; then
      printf 'PLAN %-9s [%s] run.sh dev %s %s %s  (%s)\n' "$name" "$envs" "$sc" "$TAG$label" "$uid" "$(trim "${cap:-}")"
      continue
    fi
    kill -0 "$RUNNER" 2> /dev/null || exit 0 # no new call once the runner is gone
    wait_rooms || { say "SKIP $sc $label (non-eval room live > 10 min)" >> "$llog"; continue; }
    say "START $sc $label env=[$envs]" >> "$llog"
    (
      # shellcheck disable=SC2086,SC2163 # ENV is a list of VAR=val words, split on purpose
      [ "$envs" = - ] || export $envs
      exec "$EVAL/run.sh" dev "$sc" "$TAG$label" ${uid:+"$uid"}
    ) > "$OUT/runlogs/$sc-$TAG$label.out" 2>&1 < /dev/null &
    cpid=$!
    tflag=$OUT/runlogs/.timeout-$cpid
    { sleep "$CALL_MAX_S" && : > "$tflag" && say "TIMEOUT $sc $label after ${CALL_MAX_S}s" >> "$llog" \
      && stop_jobs "$cpid"; } 2> /dev/null &
    wpid=$!
    wait "$cpid"
    rc=$?
    # A timed-out call dies on TERM before stop_jobs reaches its KILL step: let the
    # watchdog finish, or a child that ignores TERM outlives it.
    if [ -e "$tflag" ]; then wait "$wpid" 2> /dev/null; rm -f "$tflag"
    else pkill -P "$wpid" 2> /dev/null; kill "$wpid" 2> /dev/null; wait "$wpid" 2> /dev/null; fi
    say "END $sc $label rc=$rc" >> "$llog"
  done < "$file"
  say "LANE DONE" >> "$llog"
}

do_lanes() {
  LANES=1
  mkdir -p "$OUT/runlogs"
  T0=$(iso_ago 60)
  lane "$LANES_DIR/a.txt" "$OUT/laneA.log" &
  LANE_PIDS=$!
  lane "$LANES_DIR/b.txt" "$OUT/laneB.log" &
  LANE_PIDS="$LANE_PIDS $!"
  # shellcheck disable=SC2086
  wait $LANE_PIDS
  LANE_PIDS="" T1=$(iso_ago -120)
}

tonight() { # tonight's scored test runs in scripts/voice-eval/out
  local f
  for f in "$EVAL"/out/*-"$TAG"*.json; do
    case $f in *.seed.json | *.score.json | *.judge*.json | *.agent-room.json) continue ;; esac
    [ -f "${f%.json}.score.json" ] && printf '%s\0' "$f"
  done
}
do_judge() {
  tonight | JUDGE_K=2 GCP_PROJECT=$GCP xargs -0 -n 1 -P 4 node "$EVAL/judge.mjs" >> "$OUT/judge.log" 2>&1 \
    || log "some judge calls failed (see judge.log)"
}
do_collect() {
  mkdir -p "$OUT/runs" && cp -p "$EVAL"/out/*-"$TAG"*.json "$OUT/runs/" \
    && git rev-parse --short=9 HEAD > "$OUT/build.txt"
}
do_logs() {
  local f="logName=\"projects/$GCP/logs/cloud-agents\" AND labels.agent_id=\"$DEV_AGENT\""
  mkdir -p "$OUT/logs" \
    && gcloud logging read "$f AND timestamp>=\"$T0\" AND timestamp<=\"$T1\"" --project $GCP --format json \
      > "$OUT/logs/cloud-agents.json" \
    && gcloud logging read "$f AND textPayload:\"EFFECTIVE_SETTINGS\" AND timestamp>=\"$(iso_ago 21600)\"" \
      --project $GCP --format json > "$OUT/logs/boot.json"
}
do_analyze() {
  python3 -I "$HERE/analyze.py" "$OUT/logs/cloud-agents.json" "$OUT/logs/boot.json" "$OUT/runs" "$OUT/summary.json" \
    >> "$OUT/analyze.log" 2>&1
}
do_scorecard() {
  node "$HERE/scorecard.mjs" "$OUT" >> "$OUT/scorecard.log" 2>&1
  RC=$?; STATUS=ok; REASON="scorecard exit $RC"
  [ $RC = 2 ] && STATUS=harness-error REASON="scorecard exit 2 (see scorecard.log)"
}

# Erases the generated voice-eval users older than the min age in dev's database (ferni-dev
# since the 2026-10-23 cutover). If dev resolves to '(default)', the prod database (e.g.
# EVAL_DEV_DATABASE='(default)' as a rollback), it only does the dry run and reports the count.
do_cleanup() {
  local db out n age=${NIGHTLY_CLEANUP_MIN_AGE_H:-1}
  db=$(node "$EVAL/eval-database.mjs" dev) || return 1
  out=$(npx tsx "$EVAL/cleanup-users.ts" --project $GCP --env dev --min-age-hours "$age" 2>&1)
  printf '%s\n' "$out" >> "$OUT/cleanup.log"
  n=$(printf '%s\n' "$out" | sed -n 's/^Dry run\. To delete these \([0-9][0-9]*\):$/\1/p')
  if [ -z "$db" ] || [ "$db" = '(default)' ]; then log "cleanup: dev resolves to '${db}', not a dev database; dry run only, ${n:-?} would go"; return 0; fi
  [ "${n:-0}" -gt 0 ] || return 0
  npx tsx "$EVAL/cleanup-users.ts" --project $GCP --env dev --min-age-hours "$age" --execute --confirm "$n" \
    >> "$OUT/cleanup.log" 2>&1
}

do_report() {
  local verdicts
  # shellcheck disable=SC2016 # JS template literals, not shell
  verdicts=$(node -e 'const c=require(process.argv[1]);const n={};for(const x of Object.values(c.capabilities??{}))n[x.verdict]=(n[x.verdict]??0)+1;const s=c.diff?.safetyFail??[];console.log((s.length?`SAFETY FAIL: ${s.join(", ")}; `:"")+(c.status==="ok"?Object.entries(n).map(([k,v])=>`${v} ${k}`).join(", "):`${c.status}: ${c.reason}`))' -- "$OUT/scorecard.json" 2>/dev/null)
  printf '%s | nightly-sweep | NOTE | %s nightly %s: %s, exit %s, %s | -\n' \
    "$(date -u +%FT%H:%MZ)" $P "$DATE" "${verdicts:-$STATUS: $REASON}" "$RC" "$OUT" >> "$BOARD"
  [ -z "$ISSUE" ] || [ ! -f "$OUT/COMMENT.md" ] || gh issue comment "$ISSUE" --repo ferni-ai/voiceai --body-file "$OUT/COMMENT.md" \
    > /dev/null || log "issue comment failed"
}

finish() {
  trap '' INT TERM
  # shellcheck disable=SC2086 # pid list
  [ "$DRY" = 1 ] || stop_jobs $LANE_PIDS
  [ "$LANES" = 1 ] && step cleanup "cleanup-users.ts --env dev --min-age-hours ${NIGHTLY_CLEANUP_MIN_AGE_H:-1} (dry run only if dev resolves to (default))" do_cleanup
  [ "$STATUS" = ok ] || [ "$DRY" = 1 ] || write_status "$STATUS" "$REASON"
  step report "board.md line + gh issue comment ${ISSUE:-<unset: skipped>} --body-file $OUT/COMMENT.md" do_report
  [ "$DRY" = 1 ] || stop_jobs $RENEW_PID
  [ "$CLAIMED" = 1 ] && step release "claim.py release $P" python3 "$CLAIM" release $P --note "nightly sweep $DATE: exit $RC"
  [ "$DRY" = 1 ] && RC=0
  exit "$RC"
}
trap finish EXIT
trap 'REASON="interrupted by a signal"; exit 2' INT TERM

[ "$DRY" = 1 ] && echo "DRY RUN: nothing below runs. OUT=$OUT TAG=$TAG"
[ "$DRY" = 1 ] || mkdir -p "$OUT"
# local time, as run.sh and cleanup-users (eval-users.ts generatedAt) read it
MEMLIVE=voice-eval-memlive-mover-$(date +%Y%m%d%H%M%S)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')
step claim "claim.py acquire $P --ttl 45 as session nightly-sweep, renewed every 10 min (held: SKIPPED, exit 3)" do_claim
case $? in
  0) if [ "$DRY" = 1 ]; then CLAIMED=1; else renew_claim & RENEW_PID=$!; fi ;;
  3) STATUS=skipped REASON="$P is claimed by another session" RC=3; exit 3 ;;
  *) REASON="claim.py failed (see nightly.log)"; exit 2 ;;
esac
if [ "${NIGHTLY_DEPLOY:-1}" = 1 ]; then
  if ! step deploy "deploy-agent chain: origin/main $(git rev-parse --short=9 origin/main 2>/dev/null) -> lk agent deploy --project $P --config $CONF (fail closed)" do_deploy; then
    STATUS=deploy-failed REASON="deploy of origin/main to $P failed; nothing ran"
    exit 2
  fi
fi
step lanes "lanes a + b in parallel, label $TAG<label>, memlive uid $MEMLIVE" do_lanes
[ "$DRY" = 1 ] && { LANES=1; lane "$LANES_DIR/a.txt" /dev/null; lane "$LANES_DIR/b.txt" /dev/null; }
step judge "judge.mjs (JUDGE_K=2, GCP_PROJECT=$GCP) on tonight's runs, 4 at a time" do_judge
step collect "copy scripts/voice-eval/out/*-$TAG*.json to $OUT/runs" do_collect
step logs "gcloud logging read cloud-agents for agent $DEV_AGENT over the lanes' window + boot lines" do_logs \
  || log "log capture failed; summary will be missing"
step analyze "analyze.py -> $OUT/summary.json" do_analyze || log "analyze failed"
step scorecard "scorecard.mjs $OUT -> scorecard.json, REPORT.md, COMMENT.md (exit 0/1/2)" do_scorecard
