#!/bin/zsh
# Stream a LiveKit Cloud agent's logs to a file, reconnecting whenever
# `lk agent logs` exits (it dies on very long log lines: "token too long").
# usage: scripts/voice-eval/capture-logs.sh <project> <out-file>   (stop with kill)
project=$1; out=$2
while true; do
  lk agent logs --project $project >> $out 2>&1
  sleep 1
done
