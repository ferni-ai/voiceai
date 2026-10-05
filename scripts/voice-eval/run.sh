#!/bin/zsh
# Run one scripted conversation against a LiveKit Cloud agent and score it.
#
# usage: scripts/voice-eval/run.sh <dev|prod> <scenario> [label] [user_id]
#   scenario: a name under scenarios/ (long-day, story, playful)
# Output: scripts/voice-eval/out/<scenario>-<label>.{json,*.wav,score.json}
set -euo pipefail
HERE=${0:A:h}
ROOT=${HERE:h:h}
env=$1; scenario=$2; label=${3:-$(date +%H%M%S)}; uid=${4:-voice-eval-sam}
if [[ $env == prod ]]; then
  project=ferni-prod; agent=voice-agent; url=wss://test-rvg91u1z.livekit.cloud
else
  project=ferni-dev; agent=voice-agent-lkcloud; url=wss://dev-8sm1ba0z.livekit.cloud
fi
# CALLER_VOICE=say (default, macOS Samantha) or cartesia:<voiceId> for a natural
# caller (see caller-tts.mjs). Each voice keeps its own rendered audio.
caller=${CALLER_VOICE:-say}
out=$HERE/out; adir=$out/audio/$scenario${${caller:#say}:+/${caller//:/-}}; mkdir -p $adir
if [[ $caller == cartesia:* && -z ${CARTESIA_API_KEY:-} ]]; then
  export CARTESIA_API_KEY=$(gcloud secrets versions access latest --secret=cartesia-api-key --project=johnb-2025 2>/dev/null)
fi
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
  pcm=$adir/t$i.pcm
  if [[ ! -s $pcm || $HERE/scenarios/$scenario.txt -nt $pcm ]]; then
    if [[ $caller == cartesia:* ]]; then
      node $HERE/caller-tts.mjs ${caller#cartesia:} $pcm "$line"
    else
      say -v Samantha -o $adir/t$i.aiff -- "$line"
      ffmpeg -loglevel error -y -i $adir/t$i.aiff -ac 1 -ar 48000 -f s16le $pcm
    fi
  fi
  if [[ $mode == turn ]]; then print -r -- $pcm; else print -r -- "$pcm::$mode::$at"; fi
done > $adir/turns.list
turns=(${(f)"$(<$adir/turns.list)"})
room="eval-$scenario-$label-$(date +%H%M%S)"
tok=$(lk token create --project $project --join --room $room --identity eval-user --name Sam \
  --agent $agent --job-metadata "{\"user_id\":\"$uid\",\"user_name\":\"Sam\",\"timezone\":\"${EVAL_TZ:-America/New_York}\"}" --valid-for 20m 2>/dev/null \
  | grep -Eo 'eyJ[A-Za-z0-9._-]+' | head -1)
json=$out/$scenario-$label.json
(cd $ROOT && node $HERE/converse.mjs $url "$tok" $json $turns)
node $HERE/score.mjs $json | tee ${json:r}.score.json
node $HERE/mix.mjs $json >&2
