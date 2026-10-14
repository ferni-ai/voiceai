#!/bin/zsh
# Live memory eval on a LiveKit agent: each persona makes its history calls as
# one fresh user, waits for memory to be written after each, then the quiz.
#   scripts/memory-eval/live/run-live.sh <dev|local> <label> [persona ...]
# Score with: pnpm tsx scripts/memory-eval/live/score-live.ts <label>
# One call at a time (dev runs one worker per call). Don't run while someone
# is on a dev call, and hold anything that deploys or flips flags meanwhile.
set -euo pipefail
HERE=${0:A:h}; ROOT=${HERE:h:h:h}
env=$1; label=$2; shift 2
if (( $# )); then personas=($@); else personas=(nurse baker mover); fi
wait=${MEMLIVE_WAIT:-75}   # summaries and extraction land after a call ends
for p in $personas; do
  uid=voice-eval-memlive-$p-$label
  n=1
  while [[ -f $ROOT/scripts/voice-eval/scenarios/memlive-$p-$n.txt ]]; do
    print "== $p call $n ($uid)"
    $ROOT/scripts/voice-eval/run.sh $env memlive-$p-$n $label $uid
    sleep $wait
    n=$((n+1))
  done
  print "== $p quiz"
  $ROOT/scripts/voice-eval/run.sh $env memlive-$p-quiz $label $uid
done
