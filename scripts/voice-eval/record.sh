#!/bin/zsh
# Record a live call as a hidden listener (nobody on the call sees or hears it).
#
#   scripts/voice-eval/record.sh <dev|prod> <room> [label]
#
# Start it right after the room exists (e.g. after dialing a test call); it stops
# when everyone else has left. Output: scripts/voice-eval/out/rec-<label>.json plus
# one WAV per track and a .mix.wav. Score it with judge.mjs like any eval call.
# Only for test calls with people who know they're being recorded.
set -eu
HERE=${0:A:h}
env=$1 room=$2 label=${3:-$2}
case $env in
  prod) project=ferni-prod; url=wss://test-rvg91u1z.livekit.cloud ;;
  dev) project=ferni-dev; url=wss://dev-8sm1ba0z.livekit.cloud ;;
  *) print -u2 "usage: record.sh <dev|prod> <room> [label]"; exit 2 ;;
esac
tok=$(lk token create --project $project --join --room $room --identity recorder-$(date +%s) \
  --grant '{"hidden":true,"canPublish":false,"canPublishData":false}' --valid-for 1h 2>/dev/null \
  | grep -Eo 'eyJ[A-Za-z0-9._-]+' | head -1)
mkdir -p $HERE/out
node $HERE/record-room.mjs $url $tok $HERE/out/rec-$label.json
