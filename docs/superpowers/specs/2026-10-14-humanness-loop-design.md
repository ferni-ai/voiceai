# Humanness loop: autonomous dev-call optimization of the personas

Issue: #1377. Status: design, approved in conversation 2026-10-14.

## Why

Ferni and the five teammates still sound like an AI. The blind next-turn
test (#1124), where a judge sees a real friend's next turn beside Ferni's
and has to pick the friend, has Ferni winning 11% of pairs (4% on held-out
scenarios). The judge sees an AI tell in 90%. Median reply is 16 words
against the friends' 7, and 53% of replies carry a filler against 14–26%.
Without a canon, 30 of 50 first calls invent a life fact.

There is plenty of work aimed at this, but none of it is measured against
the rest: about 40 humanness flags are off in code but on in dev, and about
20 persona PRs are open. The loop measures that backlog, keeps what helps,
then keeps generating and testing new changes, without anyone in the loop.

## Goal and score

- **Primary score: next-turn win rate on held-out scenarios**, per persona.
  50% means a judge can't tell Ferni from a friend. Target: 35% held-out
  for Ferni, then each teammate; keep going toward 50%.
- **Diagnostics** (explain a change, never decide one alone):
  `scripts/voice-eval/judge.mjs` 1–5 dimensions grouped into the four areas
  (sound, turn-taking, words, continuity); `humanness.mjs` rates against
  human baselines (fillers, laughs, opinions, reply length); the canon judge
  (invented life facts).
- **Guardrails** (a change that worsens one is rejected):
  first-audio latency p50 more than +100 ms; talked-over rate more than
  +2 points; memory-eval accuracy more than −2 points; invented life facts
  up at all; cost per call more than +20%.
- **Two judge families.** Every next-turn verdict is made by a Gemini judge
  and a Claude judge; a pair counts only when both agree. Agreement rate is
  reported; below 70% the run is marked unreliable and doesn't decide.

## Scenarios

- Source: the next-turn corpus (`scripts/voice-eval/next-turn/corpus.mjs`)
  plus the existing voice-eval scenario files, per persona.
- Split once, by a fixed hash: 70% **working**, 30% **held-out**.
- **The held-out set is hidden from the brain.** Its scenario ids live only
  in a GCS object the eval workflow reads with the service account; the
  brain never sees its contents, only aggregate scores. This is the guard
  against the loop learning to please the judge.

## One experiment

1. One hypothesis, one flag (off by default, registered in
   `src/config/flag-manifest.ts`).
2. Same scenarios, two arms: flag off and flag on. Per-call flag override
   through dispatch metadata if the agent supports it (both arms in
   parallel); otherwise arms run one after the other with a dev
   `lk agent update-secrets` between them.
3. **Keep** only if: the on arm wins on working **and** held-out (paired
   sign test over scenarios, p < 0.1 each), both judges agree, and no
   guardrail regresses. Otherwise the change is discarded and the reason
   logged.
4. Size: 20 scenarios per arm on working, all held-out for that persona.
   If the budget can't cover a full experiment today, it waits for tomorrow
   instead of running underpowered.

## Order of work

- **Phase 0, baseline.** Every persona, working and held-out, flags as dev
  has them today. Publishes the first scoreboard.
- **Phase 1, the backlog.** Each humanness flag and open persona PR becomes
  an experiment. Reply length and filler rate go first (largest gaps).
  Ordered by expected impact on the weakest area.
- **Phase 2, open-ended.** The brain proposes new changes aimed at the
  weakest area on the scoreboard, implements them behind a flag, and runs
  them through the same experiment.

## Architecture

```
Claude Code routine (brain, daily)            GitHub Actions (hands, hosted runners)
  read scoreboard + ledger (tracking issue)     humanness-eval.yml (workflow_dispatch + nightly)
  pick next experiment                            auth: GCP_SA_KEY -> Secret Manager
  implement behind a flag, open PR                  (dev LiveKit, Cartesia)
  gh workflow run humanness-eval.yml  ───────▶    take the dev lock
  read result                                     place calls (lk), arm off / arm on
  win  -> merge via queue, flag on in dev         judge (Gemini + Claude), stats
  lose -> close PR with reason                    write ledger + results (GCS)
  write daily digest                  ◀────────   post scoreboard to #1377
```

- **Hands: `.github/workflows/humanness-eval.yml`** on `ubuntu-latest`
  (never the self-hosted VM; the merge queue needs it). Inputs: persona,
  flag, scenario set, arms, budget. Uses `scripts/voice-eval/run.sh` and the
  next-turn and judge scripts; no new call-placing code.
- **Brain: a Claude Code cloud routine** (the `schedule` skill), daily and
  on demand. Opens PRs and dispatches the workflow. Its own thinking runs
  under Claude Code, not the $75 budget.
- **State:** results and ledger in a GCS bucket under the dev project;
  the scoreboard and digest as comments on #1377; experiments as PRs with
  the label `humanness-experiment`, all on board 1.

## Shipping

- Every experiment PR merges off by default, through the normal checks
  (PR Flow, CI, the AI review, the verifier for risky ones), via the queue.
- A win turns the flag on in **dev** only.
- **Prod:** the digest lists flags that won and asks Seth to turn them on in
  prod. A flag whose evals are worse on any measure is never proposed
  (operating model, ask-first list).
- Nothing in the loop writes to prod.

## Safety

- **Dev only**, synthetic callers with `voice-eval-` uids (`run.sh` already
  enforces the prefix).
- **Dev lock.** A Firestore doc in the dev project; the workflow takes it
  before touching dev and releases it after. It refuses to start, and
  waits, while any non-eval participant is in a dev room
  (`lk room list`), so it never restarts the agent under a live call.
- **Budget.** Each call's STT, LLM, TTS and judge cost goes in the ledger.
  At $75 spent (UTC day) the workflow stops and the brain waits until the
  next day.
- **Kill switch.** The label `pause` on #1377: the brain and the workflow
  check it first and do nothing while it's there.
- **No secrets in output.** Transcripts and audio stay in GCS; comments on
  #1377 carry only scores, costs and links.

## What Seth sees

- A short daily digest on #1377: experiments run, won, lost (with why),
  score trend per persona, spend.
- Flags ready for prod as board items. Nothing else waits on him.

## Step 0: verify before building

1. `GCP_SA_KEY`'s service account can read the dev LiveKit and Cartesia
   secrets in Secret Manager; if not, grant `roles/secretmanager.secretAccessor`
   on those secrets.
2. A Claude Code routine can push branches, open PRs and run
   `gh workflow run` on this repo.
3. Whether the agent honours per-call flag overrides in dispatch metadata.
4. The cost of one judged call, measured, to size experiments to the budget.

## Out of scope

- Prod experiments or prod flag flips without Seth.
- Human listening panels (can be added later as a periodic check).
- New TTS voices or a new voice stack.
