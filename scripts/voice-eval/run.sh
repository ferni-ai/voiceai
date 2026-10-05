#!/bin/zsh
# Run one scripted conversation against a LiveKit agent and score it.
#
# usage: scripts/voice-eval/run.sh <dev|prod|local> <scenario> [label] [user_id]
#   scenario: a name under scenarios/ (long-day, story, playful)
#   local: a worker started from a checkout on the dev project, e.g.
#     AGENT_NAME=voice-agent-local pnpm dev   (EVAL_AGENT overrides the name)
#   EVAL_CITY / EVAL_REGION: the caller's location, as the token server's geo
#     lookup would send it (weather and local tools use it)
# Output: scripts/voice-eval/out/<scenario>-<label>.{json,*.wav,score.json}
set -euo pipefail
HERE=${0:A:h}
ROOT=${HERE:h:h}
env=$1; scenario=$2; label=${3:-$(date +%H%M%S)}; uid=${4:-voice-eval-sam}
if [[ $env == prod ]]; then
  project=ferni-prod; agent=voice-agent; url=wss://test-rvg91u1z.livekit.cloud
elif [[ $env == local ]]; then
  project=ferni-dev; agent=${EVAL_AGENT:-voice-agent-local}; url=wss://dev-8sm1ba0z.livekit.cloud
else
  project=ferni-dev; agent=voice-agent-lkcloud; url=wss://dev-8sm1ba0z.livekit.cloud
fi
out=$HERE/out; mkdir -p $out/audio/$scenario
turns=()
i=0
grep -v '^#' $HERE/scenarios/$scenario.txt | grep -v '^[[:space:]]*$' | while IFS= read -r line; do
  i=$((i+1))
  # "@backchannel 1800 Mm-hmm." / "@interrupt 1500 Wait...": spoken that many ms
  # after the agent starts its current reply, over it (see converse.mjs).
  mode=turn; at=0
  if [[ $line == @* ]]; then
    mode=${${line%% *}#@}; rest=${line#* }; at=${rest%% *}; line=${rest#* }
  fi
  pcm=$out/audio/$scenario/t$i.pcm
  if [[ ! -s $pcm || $HERE/scenarios/$scenario.txt -nt $pcm ]]; then
    say -v Samantha -o $out/audio/$scenario/t$i.aiff -- "$line"
    ffmpeg -loglevel error -y -i $out/audio/$scenario/t$i.aiff -ac 1 -ar 48000 -f s16le $pcm
  fi
  if [[ $mode == turn ]]; then print -r -- $pcm; else print -r -- "$pcm::$mode::$at"; fi
done > $out/audio/$scenario/turns.list
turns=(${(f)"$(<$out/audio/$scenario/turns.list)"})
room="eval-$scenario-$label-$(date +%H%M%S)"
# Built with JSON.stringify: a quote or backslash in a value must not break it.
meta=$(node -e '
  const [uid, tz, city, region] = process.argv.slice(1);
  const m = { user_id: uid, user_name: "Sam", timezone: tz };
  if (city) Object.assign(m, { city, regionCode: region });
  process.stdout.write(JSON.stringify(m));
' "$uid" "${EVAL_TZ:-America/New_York}" "${EVAL_CITY:-}" "${EVAL_REGION:-}")
tok=$(lk token create --project $project --join --room $room --identity eval-user --name Sam \
  --agent $agent --job-metadata "$meta" --valid-for 20m 2>/dev/null \
  | grep -Eo 'eyJ[A-Za-z0-9._-]+' | head -1)
json=$out/$scenario-$label.json
(cd $ROOT && node $HERE/converse.mjs $url "$tok" $json $turns)
node $HERE/score.mjs $json | tee ${json:r}.score.json
node $HERE/mix.mjs $json >&2
