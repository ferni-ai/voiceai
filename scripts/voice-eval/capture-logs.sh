#!/bin/zsh
# Stream a LiveKit Cloud agent's logs to a file, reconnecting whenever
# `lk agent logs` exits (it dies on very long log lines: "token too long").
# usage: scripts/voice-eval/capture-logs.sh <ferni-dev|ferni-prod> <out-file>   (stop with kill)
# The agent config must match the project: without it lk falls back to
# livekit.toml (dev) and, for prod, logs only "project does not match agent
# subdomain" — an empty capture that reads as "0 errors".
project=$1; out=$2
case $project in
  ferni-prod) config=livekit.prod-cloud.toml ;;
  ferni-dev) config=livekit.toml ;;
  *) echo "unknown project: $project" >&2; exit 2 ;;
esac
while true; do
  lk agent logs --project $project --config $config >> $out 2>&1
  sleep 1
done
