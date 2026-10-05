# Shadow to live: tool retrieval and the Speech Director

> **Quick reference**: what each feature logs in shadow, the bar for turning it
> live, and how to turn it live per environment without a code change.

Both features default to **shadow** outside tests (PR #213): they do their
work and log it, but the user gets the old behavior. Neither default changes
until the criteria below are met on production traffic.

| Feature         | Env var           | Code                                         |
| --------------- | ----------------- | -------------------------------------------- |
| Tool retrieval  | `TOOL_RETRIEVAL`  | `src/tools/retrieval/turn-tool-retrieval.ts` |
| Speech Director | `SPEECH_DIRECTOR` | `src/speech/tts-gateway/director/gate.ts`    |

Values: `off | shadow | live`. Director levers can be lowered one at a time
with `SPEECH_DIRECTOR_{PHRASING,PAUSES,NORMALIZE,EMOTION,PACING}`;
`SPEECH_DIRECTOR_NONVERBAL` and `_LAUGHTER` are off unless set.

---

## What shadow records

### Tool retrieval (logger module `TurnToolRetrieval`)

| Event (`msg`)             | When                       | Fields                                                                                                                                            |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool retrieval on`       | session start              | `mode`                                                                                                                                            |
| `TOOL_RETRIEVAL_SHADOW`   | each distinct pick         | `textChars`, `picked`, `unavailable`, `embedMs`, `speculative` (exact/near/none), `toolsNow`, `toolsWouldSend`                                    |
| `TOOL_RETRIEVAL_COVERAGE` | each tool the model called | `tool`, `rank` (in the whole index, -1 if not in the top 4k), `via` (retrieved/core/sticky/missed), `covered`, `liveCovered`, `mode`, `textChars` |
| `TOOL_RETRIEVAL_SUMMARY`  | session end                | `turns`, `k`, `picks`, `pickFailures`, `calls`, `covered`, `liveCovered`, `missedTools`, `embedMsP50/P95/Max`                                     |
| `TOOL_RETRIEVAL_FIND`     | the model called findTools | `needChars`, `found` (tool names), `ms`                                                                                                           |
| `tool retrieval failed`   | a pick failed (warn)       | `error`                                                                                                                                           |
| `TOOL_RETRIEVAL_LIVE`     | live only, each request    | `textChars`, `source` (fresh/fallback/all), `pickedForChars` (fallback only), `waitMs`, `toolsNow`, `toolsSent`                                   |

No event carries the user's words or the model's findTools request, only
their lengths (`textChars`, `pickedForChars`, `needChars`). The logs are
forwarded to Cloud Logging, so keep it that way.

**Read recall from `liveCovered`, not `covered`.** In shadow the agent has
only its dynamically loaded tools (about 150); live mode loads the whole
catalog (about 1,160). Shadow's `retrieved` is judged against the smaller
set, so a tool ranked 30th can count as covered in shadow and still miss the
top k in live. `liveCovered` counts a call only if the tool was core, sticky,
or ranked within the top k (20) of the whole index.

**Latency**: shadow awaits nothing. `embedMs` is the time from the request to
a ready pick, which is what live mode would wait, capped at
`LIVE_PICK_WAIT_MS` (150 ms, `src/agents/personas/turn-request.ts`). Slower
picks fall back to an earlier transcript's pick, or to core + recent tools.

**Decision (2026-10-04): the wait stays 150 ms.** A turn whose pick misses
it goes out with an earlier pick (an earlier transcript's, or the tools kept
sticky from previous turns) rather than delaying the first word. That is
accepted; findTools covers the rest.

### Speech Director (logger module `SpeechDirector`)

One `Speech director plan` line per reply, counts and decisions only:
`mode`, `levers`, `pushesIn/Out`, `segments`, `heldPhrases`,
`normalizations`, `ellipsesRemoved`, `commasPer100Words`, `emotion`,
`emotionSource`, `speed`, `tempo`, `tagsStripped`, `opening`, `laughter`,
`pauses`, `pauseMs`, `latencyUs` (Director CPU time for the reply),
`cancelled`, `failed`. Errors also log `Speech director failed` (warn); the
reply then goes out verbatim.

**Dev runs the Director live on purpose, laughter included**
(`SPEECH_DIRECTOR=live`, `SPEECH_DIRECTOR_LAUGHTER=live`). Dev is its live
trial: dev lines are live data, not shadow, and the shadow criteria below
apply to prod. Don't reset dev to shadow to "match" prod. Check with
`lk agent secrets --config livekit.toml`: on 2026-10-04 the LiveKit Cloud dev
agent had neither secret, so it ran the Director in shadow with laughter off;
set both as in "Going live per environment" below.

---

## Promotion criteria

All on the target environment's traffic, collected after the last change to
the feature. `scripts/shadow-promotion-report.ts` checks the logged ones.

### Tool retrieval → live

- [ ] At least **500 tool calls** across at least **50 sessions** in shadow.
- [ ] **Live-equivalent recall ≥ 98%** (`liveCovered / calls`).
- [ ] No missed tool from a safety or handoff domain (they are core by
      construction; any such miss is a bug).
- [ ] Pick failures **≤ 0.5%** of picks (a failure degrades to core + recent tools).
- [ ] Pick latency **p95 ≤ 150 ms** (`embedMs`), so live mostly gets a fresh pick.
- [ ] On dev with `TOOL_RETRIEVAL=live`: `TOOL_RETRIEVAL_LIVE` `source=all`
      on ≤ 5% of requests, and the tool scenarios in
      `scripts/voice-eval/scenarios/tools.txt` pass.

### Speech Director → live

- [ ] At least **500 replies** logged in shadow (or live on dev).
- [ ] **Zero** `failed: true` replies.
- [ ] Director CPU **p95 ≤ 5,000 µs** (`latencyUs`).
- [ ] Listening check passes: `scripts/audio-eval/speech-e2e.ts` on the
      shipping voices, and a blind A/B of shadow vs live replies with no
      preference for shadow.
- [ ] Go lever by lever where in doubt: emotion and pacing are the most
      audible, so `SPEECH_DIRECTOR=live` with `SPEECH_DIRECTOR_EMOTION=shadow`
      and `SPEECH_DIRECTOR_PACING=shadow` first.

---

## Collecting the data

Both LiveKit Cloud agents forward their runtime logs (stdout and stderr) to
Cloud Logging in `johnb-2025` through LiveKit's
[Google Cloud log drain](https://docs.livekit.io/deploy/agents/log-drains.md),
enabled 2026-10-04. `lk agent logs` streams only the current instance and
keeps nothing; use Cloud Logging.

| Environment | Config                    | Agent ID          |
| ----------- | ------------------------- | ----------------- |
| dev         | `livekit.toml`            | `CA_siTDMHEba4Fg` |
| prod        | `livekit.prod-cloud.toml` | `CA_GeFvEpsNXLSF` |

Each agent log line lands in log `cloud-agents` as `textPayload` (the raw
pino JSON line), labelled `agent_id` and `worker_id`. Every entry has
severity `ERROR` whatever its level, so filter on text, not severity.
Delivery lags about a minute, and lines printed before the drain sidecar
starts (the first minute after a restart) are not forwarded. The `_Default`
bucket keeps 30 days; run the report within that window or route
`logName="projects/johnb-2025/logs/cloud-agents"` to a longer-lived bucket.

```bash
# prod; for dev use labels.agent_id="CA_siTDMHEba4Fg"
gcloud logging read --project johnb-2025 --freshness=30d --limit=200000 \
  --format='value(textPayload)' \
  'logName="projects/johnb-2025/logs/cloud-agents"
   AND labels.agent_id="CA_GeFvEpsNXLSF"
   AND (textPayload:"TOOL_RETRIEVAL_" OR textPayload:"Speech director plan")' \
  > /tmp/agent-prod.jsonl
pnpm -s tsx scripts/shadow-promotion-report.ts /tmp/agent-prod.jsonl
```

### Log drain setup (already done; repeat for a new agent)

The drain runs in a LiveKit sidecar and authenticates with the service
account key the agent already mounts for Vertex and Firestore
(`ferni-lkcloud-agent@johnb-2025.iam.gserviceaccount.com`, file secret
`ferni-lkcloud-agent.json`, pointed to by `GOOGLE_APPLICATION_CREDENTIALS`;
`GOOGLE_CLOUD_PROJECT=johnb-2025`).

1. Grant the service account **Logs Writer** on the project:

   ```bash
   gcloud projects add-iam-policy-binding johnb-2025 \
     --member=serviceAccount:ferni-lkcloud-agent@johnb-2025.iam.gserviceaccount.com \
     --role=roles/logging.logWriter --condition=None
   ```

2. Turn the drain on (restarts the agent):

   ```bash
   lk agent update-secrets --config livekit.toml --secrets LOGS_ENABLE_GCP=1
   lk agent update-secrets --config livekit.prod-cloud.toml --secrets LOGS_ENABLE_GCP=1
   ```

   A new agent without the mounted key also needs
   `--secrets GOOGLE_CLOUD_PROJECT=johnb-2025`,
   `--secrets GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/<key>.json` and
   `--secret-mount ./<key>.json`. Never commit the key.

3. Confirm: after a minute,
   `gcloud logging read 'logName="projects/johnb-2025/logs/cloud-agents"' --project johnb-2025 --freshness=10m --limit=5`
   shows the agent's `Diagnostic summary` line (printed every minute).

To stop forwarding, delete `LOGS_ENABLE_GCP` in the LiveKit Cloud dashboard
(agent → Agent configuration → Secrets).

---

## Going live per environment

The mode is read from the environment, so each LiveKit project can differ
with no code change. Setting secrets restarts the agent.

```bash
# dev live, prod untouched
lk agent update-secrets --config livekit.toml --secrets TOOL_RETRIEVAL=live
lk agent update-secrets --config livekit.toml --secrets SPEECH_DIRECTOR=live --secrets SPEECH_DIRECTOR_LAUGHTER=live

# rollback: back to shadow (or off)
lk agent update-secrets --config livekit.toml --secrets TOOL_RETRIEVAL=shadow
```

Prod (`livekit.prod-cloud.toml`) only after its own shadow data meets the
criteria. Changing the code default is a separate, later change.

---

## Status (2026-10-04)

Neither feature meets the criteria; there is not enough traffic to judge.

- **Prod**: no sessions in the captured window, so no shadow lines.
- **Dev**: tool retrieval in shadow, 1 session, 10 picks, 1 tool call
  (`getNews`, not in the top 80: a miss). Fresh picks took 152–486 ms
  (over the 150 ms live wait); picks reusing an earlier transcript's
  embedding took 12–16 ms. The Director logged as **live** on dev
  (laughter live too): 8 replies, 0 failed, CPU p95 5.9 ms (the first
  reply; the rest ≤ 2.6 ms). The cloud dev agent's secrets don't set it
  live, though (see "Speech Director" above): confirm `mode` in the next
  `Speech director plan` lines.
- **Logs**: forwarded to Cloud Logging for dev and prod from 2026-10-04
  ~22:48 UTC; earlier traffic is gone.
- **Dev model**: `GEMINI_MODEL` moved from `gemini-2.5-flash` to
  `gemini-3.5-flash` on 2026-10-04 (secret only; prod already ran 3.5).
