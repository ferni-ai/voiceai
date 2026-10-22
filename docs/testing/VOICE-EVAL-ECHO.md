# Speakerphone echo eval

On iPhone speakerphone calls Ferni's voice leaks back into the caller's mic and
barge-in logic takes it for the caller (prod: `BARGE_IN_FASTPATH`
sustained-speech fired 6 times on iOS calls, 0 on web or phone). This eval
recreates that echo on a scripted dev call, so each fix is measured before and after.

`run.sh --echo` places the usual scripted call, and `converse.mjs` feeds every
agent audio frame it receives (24 kHz) to `echo-mixer.mjs`: upsampled to the
mic's 48 kHz, delayed, attenuated, optionally under room noise, and mixed into
the caller's mic. Scripted lines carry echo under them; while Ferni talks between
lines the mic carries echo alone.

| Flag                | Env                  | Default | Meaning                                      |
| ------------------- | -------------------- | ------- | -------------------------------------------- |
| `--echo`            | `EVAL_ECHO=1`        | off     | echo on, with the defaults                   |
| `--echo-gain-db N`  | `EVAL_ECHO_GAIN_DB`  | -18     | an iPhone speaker at arm's length, after AEC |
| `--echo-delay-ms N` | `EVAL_ECHO_DELAY_MS` | 120     | after the agent frame arrives (0 to 2000)    |
| `--echo-noise-db N` | `EVAL_ECHO_NOISE_DB` | off     | room noise, dBFS RMS (e.g. -50)              |

Any `--echo-*` flag turns echo on; `EVAL_DRY_RUN=1` prints the settings. The run
keeps `.mic.wav` as the clean caller and adds `.sent.wav` (what the agent heard).

## Baseline vs echo

ferni-dev only, with nobody else on a dev call. Run each arm at least twice.

```bash
# from the repo root (capture-logs.sh reads livekit.toml from here)
E=scripts/voice-eval; mkdir -p $E/out
$E/capture-logs.sh ferni-dev $E/out/echo-batch.log &   # before the calls
$E/run.sh dev long-day base1
$E/run.sh --echo dev long-day echo1
kill %1
node $E/echo-report.mjs $E/out/long-day-base1.json --logs $E/out/echo-batch.log
node $E/echo-report.mjs $E/out/long-day-echo1.json --logs $E/out/echo-batch.log
node $E/echo-report.mjs --compare $E/out/long-day-base1.echo.json $E/out/long-day-echo1.echo.json
```

The report finds the call by its room (`--job <AJ_...>` names one by hand;
`--logs` also reads saved `gcloud logging read --format=json` output) and writes
`<run>.echo.json` plus a summary of barge-in, loop-stall and reply counts
(`echoMetrics` in `echo-report.mjs`). Counts, timings and ids only,
never transcript text. `NO LOG LINES` means nothing was measured.
