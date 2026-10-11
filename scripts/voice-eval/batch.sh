#!/bin/zsh
# Run N seed->recall pairs for one experiment arm, then score them.
#
# usage: scripts/voice-eval/batch.sh <dev|local> <seed-scenario> <recall-scenario> <arm> <n>
#   e.g. batch.sh dev facts-seed facts-recall base 10
#        (flip the flag on dev, then)  batch.sh dev facts-seed facts-recall sem 10
# Each pair is a fresh voice-eval user (run.sh with EVAL_SEED), labelled
# <arm>-1 .. <arm>-<n>. Then judge.mjs scores each call (BATCH_JUDGE=0 skips
# it: it costs JUDGE_K Gemini calls per run) and recall-facts.mjs counts which
# seeded facts came back. Compare arms with:
#   node judge.mjs --summary out/<recall>-<arm>-*.json
#   node recall-facts.mjs out/<recall>-<arm>-*.json
# Arms run one after the other on the same deployment, so keep the build fixed
# between them and alternate arms when you can (dev drifts).
set -euo pipefail
HERE=${0:A:h}
env=$1; seed=$2; recall=$3; arm=$4; n=$5
[[ $arm == *-* ]] && { print -u2 "batch.sh: arm must not contain '-' (got: $arm)"; exit 2; }
runs=()
for i in {1..$n}; do
  EVAL_SEED=$seed $HERE/run.sh $env $recall $arm-$i
  runs+=($HERE/out/$recall-$arm-$i.json)
done
[[ ${BATCH_JUDGE:-1} == 0 ]] || node $HERE/judge.mjs $runs
node $HERE/recall-facts.mjs $runs
