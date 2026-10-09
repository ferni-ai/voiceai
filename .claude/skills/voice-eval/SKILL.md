---
name: voice-eval
description: Measure how Ferni actually sounds on a live call. Runs scripted callers against the dev or prod agent and scores replies against human conversation baselines. Use before claiming any voice, prompt, turn-taking or humanness change works, to compare before/after, or when asked "how does he sound", "run the evals", "is it more human".
---

# Live-call evals

`scripts/voice-eval/` places real LiveKit calls: a synthetic caller speaks
each line of a scenario, and the agent's audio and captions are recorded.

## Run
```bash
cd scripts/voice-eval
export CALLER_VOICE=cartesia:c894559e-d529-4d70-a6fb-3330ecf7ef6b   # natural caller voice (default: macOS say)
./run.sh dev long-day <label>            # one call, a fresh user each run
EVAL_SEED=catch-up ./run.sh dev returning <label>   # seed call, then a returning call as the same user
EVAL_DRY_RUN=1 ./run.sh dev playful x    # print the plan only
```
- Scenarios live in `scenarios/*.txt`, one caller line each.
  `[[slnc N]]` inserts N ms of silence.
- Main set: `long-day playful story real-call`.
  Special-purpose: `quiet` (long pause), `talk-over`, `timer`, `tools`,
  `catch-up` + `returning` (memory).
- Run each scenario at least twice. One call is an anecdote.
- Output lands in `out/<scenario>-<label>.json` plus wav files and `.score.json`.
- Don't run while someone is on a dev call. Never deploy mid-run.

## Score
```bash
node score.mjs out/*-<label>.json > pooled.json   # pooled over the runs
```
`humanness` reports, per Ferni turn: words p25/p50/p75, question-end rate,
fillers per 100 words, self-repair, laughter, stance, self-disclosure and
broken-mark rate. `vsHuman` compares each against the targets in
`~/Documents/voiceai-evidence/human-baselines/score-targets.json`. Human
reference points: median turn about 18 words; questions are about 6% of
utterances; 1 to 4 filled pauses per 100 words.

## Read the transcripts too
The numbers miss things a listener hears. Print the conversation:
```bash
node -e 'const r=require(process.argv[1]);for(const e of r.events)console.log(e.who.padEnd(5),e.text)' "$PWD/out/<file>.json"
```
Look for:
- replies that ignore what the caller said;
- talking into a pause the caller asked for;
- repeated phrases;
- markup spoken aloud.

## Agent-side evidence
Stream the agent's logs during the run
(`lk agent logs --project ferni-dev --config <abs>/livekit.toml > agent.log`)
and grep them, e.g. `TURN_SHAPE`, `PRESENCE_SOUND`, `LIFE_LEDGER_SAVED` or
`backchannel clip played`, to prove a flagged behaviour actually fired.

## Offline A/B (no calls)
`scripts/humanness-eval/replay.ts` replays recorded moments through the model
with the current or the candidate prompt shaping:
```bash
GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/humanness-eval/replay.ts --variant shaped --samples 3 --out x.json out/*-<label>.json
```
Use it to compare prompt variants cheaply. Confirm the winner live.

Keep evidence in `~/Documents/voiceai-evidence/<label>/` and put the headline
numbers, before and after, in the PR.
