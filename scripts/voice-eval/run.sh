#!/bin/zsh
# Run one scripted conversation against a LiveKit Cloud agent and score it.
#
# usage: scripts/voice-eval/run.sh <dev|prod|local|phone> <scenario> [label] [user_id]
#   scenario: a name under scenarios/ (long-day, story, playful, ...)
#   label:    names the output files (default: HHMMSS)
#   user_id:  who the agent thinks is calling (also settable as EVAL_UID).
#             Default: a NEW user every run,
#               voice-eval-<scenario>-<YYYYMMDDHHMMSS>-<4 hex>
#             so the call starts with no memories. One shared user
#             (voice-eval-sam) used to carry every other scenario's "life"
#             (a hike, a deadline, a pregnancy) into each run.
#
# Returning caller, two ways:
#   EVAL_SEED=<seed-scenario> run.sh dev <scenario> [label]
#     Plays <seed-scenario> first as the same fresh user (saved as
#     <scenario>-<label>.seed.json, not scored), waits EVAL_SEED_WAIT seconds
#     (default 30) for memories to be written, then plays <scenario>. The
#     caller's history is exactly the seed, nothing else. Prefer this.
#   run.sh dev <scenario> <label> voice-eval-sam   (or EVAL_UID=voice-eval-sam)
#     Reuses a fixed user and everything it has piled up across past runs.
# The user id must start with "voice-eval-": code that skips synthetic
# callers keys on it (src/services/outreach/automated-scheduler.ts).
#
# EVAL_DRY_RUN=1 prints the plan as JSON (user id, rooms, scenarios) and exits:
#   no audio, no token, no call.
# EVAL_TZ sets the caller's timezone (default America/New_York).
# EVAL_CITY / EVAL_REGION: the caller's location, as the token server's geo
#   lookup would send it (weather and local tools use it).
# local: a worker started from a checkout on the dev project, e.g.
#   AGENT_NAME=voice-agent-local pnpm dev   (EVAL_AGENT overrides the name)
# CALLER_VOICE=say (default, macOS Samantha) or cartesia:<voiceId> for a natural
# caller (see caller-tts.mjs). Each voice keeps its own rendered audio.
# phone: the same call over the real phone network, on ferni-dev. The scripted
#   caller joins a room of its own; the dev Twilio trunk dials the dev number,
#   which lands in a dev-call-* room with the agent, so the caller's mic and the
#   agent's voice both cross the PSTN. record-room.mjs records the agent's room
#   as a hidden listener (its captions, and the agent's tracks before the line),
#   and phone-merge.mjs folds that into the run. Dials only the dev number, one
#   call at a time: it refuses while any dev-call-* room is open.
#   Inbound calls carry no job metadata, so the agent takes the caller as an
#   anonymous phone caller (no user id, no name, no memories, nothing written to
#   a user). The user id below is only a label for the run; EVAL_SEED doesn't apply.
#
# Output: scripts/voice-eval/out/<scenario>-<label>.{json,*.wav,score.json}.
# The json has meta.uid and the score.json has users, so a scorecard can be
# traced back to the Firestore user it ran as.
set -euo pipefail
HERE=${0:A:h}
ROOT=${HERE:h:h}
env=$1; scenario=$2; label=${3:-$(date +%H%M%S)}
seed=${EVAL_SEED:-}
uid=${4:-${EVAL_UID:-voice-eval-$scenario-$(date +%Y%m%d%H%M%S)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')}}
if [[ $uid != voice-eval-?* ]]; then
  print -u2 "run.sh: user id must start with voice-eval- (got: $uid)"
  exit 2
fi
for s in $scenario $seed; do
  [[ -f $HERE/scenarios/$s.txt ]] || { print -u2 "run.sh: no scenario $HERE/scenarios/$s.txt"; exit 2; }
done
if [[ $env == phone && -n $seed ]]; then
  print -u2 "run.sh: EVAL_SEED needs a known caller; phone callers are anonymous"
  exit 2
fi
if [[ $env == prod ]]; then
  project=ferni-prod; agent=voice-agent; url=wss://test-rvg91u1z.livekit.cloud
elif [[ $env == local ]]; then
  project=ferni-dev; agent=${EVAL_AGENT:-voice-agent-local}; url=wss://dev-8sm1ba0z.livekit.cloud
else
  project=ferni-dev; agent=voice-agent-lkcloud; url=wss://dev-8sm1ba0z.livekit.cloud
fi
out=$HERE/out
caller=${CALLER_VOICE:-say}
if [[ $caller == cartesia:* && -z ${CARTESIA_API_KEY:-} && -z ${EVAL_DRY_RUN:-} ]]; then
  export CARTESIA_API_KEY=$(gcloud secrets versions access latest --secret=cartesia-api-key --project=johnb-2025 2>/dev/null)
fi
json=$out/$scenario-$label.json
stamp=$(date +%H%M%S)

if [[ -n ${EVAL_DRY_RUN:-} ]]; then
  print -r -- "{\"env\":\"$env\",\"scenario\":\"$scenario\",\"label\":\"$label\",\"uid\":\"$uid\",\"seed\":\"$seed\",\"room\":\"eval-$scenario-$label-$stamp\",\"json\":\"$json\"}"
  exit 0
fi

# Writes $out/audio/<scenario>/turns.list: one PCM per scripted line.
prepare_turns() {
  local sc=$1 i=0 line mode at rest pcm
  local adir=$out/audio/$sc${${caller:#say}:+/${caller//:/-}}
  mkdir -p $adir
  grep -v '^#' $HERE/scenarios/$sc.txt | grep -v '^[[:space:]]*$' | while IFS= read -r line; do
    i=$((i+1))
    # "@backchannel 1800 Mm-hmm." / "@interrupt 1500 Wait...": spoken that many ms
    # after the agent starts its current reply, over it (see converse.mjs).
    mode=turn; at=0
    if [[ $line == @* ]]; then
      mode=${${line%% *}#@}; rest=${line#* }; at=${rest%% *}; line=${rest#* }
    fi
    pcm=$adir/t$i.pcm
    # "@data 0 {json}": publish that JSON to the room as the app would, no speech.
    if [[ $mode == data ]]; then
      print -r -- "$line" > $adir/t$i.json
      print -r -- "$adir/t$i.json::data::$at"
      continue
    fi
    if [[ ! -s $pcm || $HERE/scenarios/$sc.txt -nt $pcm ]]; then
      if [[ $caller == cartesia:* ]]; then
        node $HERE/caller-tts.mjs ${caller#cartesia:} $pcm "$line"
      else
        say -v Samantha -o $adir/t$i.aiff -- "$line"
        ffmpeg -loglevel error -y -i $adir/t$i.aiff -ac 1 -ar 48000 -f s16le $pcm
      fi
    fi
    if [[ $mode == turn ]]; then print -r -- $pcm; else print -r -- "$pcm::$mode::$at"; fi
  done > $adir/turns.list
  print -r -- $adir
}

# One call as $uid: converse_call <scenario> <out.json> <role>
converse_call() {
  local sc=$1 file=$2 role=$3 room tok turns meta
  local adir
  adir=$(prepare_turns $sc)
  turns=(${(f)"$(<$adir/turns.list)"})
  room="eval-$sc-$label-$(date +%H%M%S)"
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
  print -u2 "voice-eval: $role $sc as $uid in $room"
  (cd $ROOT && VOICE_EVAL_META="{\"uid\":\"$uid\",\"env\":\"$env\",\"scenario\":\"$sc\",\"label\":\"$label\",\"room\":\"$room\",\"role\":\"$role\",\"seed\":\"$seed\"}" \
    node $HERE/converse.mjs $url "$tok" $file $turns)
}

# The dev phone number (a LiveKit number on ferni-dev, dispatch rule dev-phone) and
# the dev Twilio trunk that dials it, with caller ID +14843273479. Fixed on purpose:
# phone mode never dials any other number.
PHONE_TO=+18018494000
PHONE_TRUNK=ST_FCiQRLuvhYzx

# dev-call-* rooms in use (someone on the line), or created after $1 (epoch ms).
# An ended call's room lingers empty for a few minutes; it doesn't count.
dev_call_rooms() {
  (cd $ROOT && lk room list --project ferni-dev --json 2>/dev/null) |
    node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{
      const since = Number(process.argv[1] || Infinity);
      for (const r of JSON.parse(s||"{}").rooms ?? [])
        if (r.name.startsWith("dev-call-") && ((r.numParticipants ?? 0) > 0 || Number(r.creationTimeMs) >= since))
          console.log(r.name);
    })' "${1:-}"
}

# One phone call: phone_call <scenario> <out.json>
phone_call() {
  local sc=$1 file=$2 adir room tok turns conv rec agent_room i
  [[ -f $HERE/record-room.mjs ]] || { print -u2 "run.sh: phone needs record-room.mjs (PR #630)"; exit 2; }
  local busy=$(dev_call_rooms) rc=0
  if [[ -n $busy ]]; then
    print -u2 "run.sh: a dev phone call is in progress ($busy); try again when it ends"
    exit 3
  fi
  adir=$(prepare_turns $sc)
  turns=(${(f)"$(<$adir/turns.list)"})
  room="eval-phone-$sc-$label-$(date +%H%M%S)"
  # No --agent: the agent must answer the phone, not join this room.
  tok=$(lk token create --project ferni-dev --join --room $room --identity eval-user --name Sam \
    --valid-for 20m 2>/dev/null | grep -Eo 'eyJ[A-Za-z0-9._-]+' | head -1)
  print -u2 "voice-eval: phone $sc in $room, dialing $PHONE_TO"
  (cd $ROOT && VOICE_EVAL_PHONE=1 VOICE_EVAL_META="{\"uid\":\"$uid\",\"env\":\"phone\",\"scenario\":\"$sc\",\"label\":\"$label\",\"room\":\"$room\",\"role\":\"test\",\"seed\":\"\"}" \
    node $HERE/converse.mjs $url "$tok" $file $turns) &
  conv=$!
  sleep 2
  local dialed=$(node -p 'Date.now()')
  # The recorder joins as soon as the agent's room exists; it still tends to miss
  # the greeting's caption (the agent greets within ~1.5 s of answering).
  (cd $ROOT && lk sip participant create --project ferni-dev --room $room --identity phone-agent \
    --trunk $PHONE_TRUNK --call $PHONE_TO >/dev/null) &
  for i in {1..120}; do
    agent_room=$(dev_call_rooms $dialed | head -1)
    [[ -n $agent_room ]] && break
    sleep 0.25
  done
  if [[ -z $agent_room ]]; then
    print -u2 "run.sh: no dev-call-* room appeared; hanging up"
    (cd $ROOT && lk room delete --yes --project ferni-dev $room >/dev/null 2>&1)
    kill $conv 2>/dev/null
    exit 4
  fi
  local rtok=$(lk token create --project ferni-dev --join --room $agent_room --identity recorder-$(date +%s) \
    --grant '{"hidden":true,"canPublish":false,"canPublishData":false}' --valid-for 1h 2>/dev/null |
    grep -Eo 'eyJ[A-Za-z0-9._-]+' | head -1)
  (cd $ROOT && node $HERE/record-room.mjs $url $rtok ${file:r}.agent-room.json) &
  rec=$!
  wait $conv || rc=$?
  # Deleting the caller room hangs up the call; the agent then leaves its room.
  (cd $ROOT && lk room delete --yes --project ferni-dev $room >/dev/null 2>&1)
  for i in {1..40}; do kill -0 $rec 2>/dev/null || break; sleep 0.5; done
  kill -INT $rec 2>/dev/null && wait $rec
  (( rc == 0 )) || { print -u2 "run.sh: converse.mjs failed ($rc)"; exit $rc; }
  node $HERE/phone-merge.mjs $file ${file:r}.agent-room.json
}

if [[ $env == phone ]]; then
  phone_call $scenario $json
  node $HERE/score.mjs $json | tee ${json:r}.score.json
  node $HERE/mix.mjs $json >&2
  exit 0
fi

if [[ -n $seed ]]; then
  converse_call $seed ${json:r}.seed.json seed
  sleep ${EVAL_SEED_WAIT:-30}
fi
converse_call $scenario $json test
node $HERE/score.mjs $json | tee ${json:r}.score.json
node $HERE/mix.mjs $json >&2
