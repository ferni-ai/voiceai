# Nightly flag arms: let the nightly decide which flags graduate

Status: proposed 2026-11-26 (thread "Raise Ferni's quality bar further"), for Seth.

## Why

Since 2026-10-20 about 1,450 PRs merged and 241 flag files were added
(`src/config/flags/`), 221 of them off by default. Four were removed and one
PR promoted any (#3248, seven voice flags). The nightly capability sweep
(`scripts/voice-eval/nightly/run-nightly.sh`, results on #2407) tests whatever
dev has set, so a fix that ships off is never scored. From 11-15 to 11-24 the
scores did not move: humanLikelihood 0.31 to 0.38 (bar 0.7), recall-ledger
0.12 to 0.36 (bar 0.8), 4 to 9 non-crisis calls given 988 each night, 0 of 23
"better than human" targets met.

Work is done but not heard. This plan makes the nightly the place where a flag
earns its way on, or gets deleted.

Live state, 2026-11-26 (`pnpm ops:secrets-parity`, exit 1 DRIFT; dev build
7865fb642, prod build 5a27ac21f, about ten days behind main):

- Of the 221 default-off flag files, 35 are on or shadow in dev and 17 in prod.
- 21 are on or shadow in dev but off in prod. 13 of them need only a flag change
  in prod (CALLER_CARD, CALL_KNOWS_RECENT_TEXTS, CALL_REPORT_REACHES_YOU,
  CALL_RESULT_LIVE_REPORT, CONTACT_PICK_V2, FACTS_DUAL_WRITE, FACT_SUBJECT_GUARD,
  FORGET_EVERY_READER, MEMORY_FACTS, PAUSE_HOLD_PHONE_CAP, PREEMPT_STABLE_CONTEXT,
  REMEMBER_TO_RECALL, SCHEDULE_CALL_WHO); three are crisis shadows that need the
  crisis owner; five need a prod deploy first.
- Three were on in prod but off in dev (BARGE_IN_FAST_STOP, KEEP_LAST_SUMMARY,
  WORKER_RECYCLE), so the nightly was not testing what prod runs.
- `COHORT_FLAGS` is on in dev and prod, so the per-caller arm below works today.
- The nightly reports none of this, so nobody sees the drift.

## What exists

- Per-caller flags: cohorts and per-person overrides
  (`src/services/platform/cohort-flags.ts`, `scripts/cohorts.ts`), applied at
  call start when `COHORT_FLAGS=on`. Only the 93 names in `COHORT_FLAGS` can be
  set this way; 25 of the 221 off flags are among them.
- `scripts/voice-eval/ab-receipts.mjs`: latency comparison of arms from
  TURN_RECEIPT, with bootstrap intervals.
- `pnpm ops:secrets-parity`: dev vs prod flag words from each agent's
  `EFFECTIVE_SETTINGS` boot lines (LiveKit never returns secret values).
- `scorecard.mjs` / `superhuman.mjs`: per-capability verdicts and trends.

## Design

Two arms, chosen per flag by how it can be set.

1. **Per-caller arm (cohort-settable flags).** `NIGHTLY_ARM_FLAGS="A=on B=on"`
   makes the sweep run each lane-B scenario a second time under a uid that is a
   member of a dev cohort `nightly-arm` holding those flags (created and emptied
   by the sweep, dev only). Same night, same build: the scorecard reports each
   capability for arm off and arm on side by side.
2. **Whole-agent arm (everything else).** `NIGHTLY_AGENT_FLAGS="A=on B=on"`
   sets those flags on the dev agent before the sweep (one `--secrets` per key,
   inside the sweep's existing dev claim and empty-room wait) and restores the
   previous values after. The comparison is against the previous night's
   baseline on the same scenarios, so the verdict needs two arm nights out of
   three before it counts (night-to-night noise: 988 false alarms ran 4 to 8 on
   unchanged builds).
3. **Verdict per flag**, in the #2407 comment: keep (no capability worse beyond
   its noise band, at least one better), discard (any FAIL that baseline did
   not have, or a safety row worse), or inconclusive (rerun). Safety rows
   (crisis-real missed crises, crisis-false-alarm) veto: a flag that adds a
   missed crisis is discarded whatever else it improves.
4. **Promotion** stays a human-visible step: a kept flag goes to prod through
   the deploy-agent skill after two clean dev nights (five for crisis paths,
   matching epic #4466), then its flag file and off branch are deleted.
5. **Live state in every report:** the sweep runs `ops:secrets-parity` and
   appends dev vs prod flag words, so anyone can see what is actually on.

## Order of work (each its own PR, flag-free since it is eval tooling)

1. Sweep appends the parity report to its comment (small), and flags any flag
   on in prod but off in dev as a FAIL of the sweep's own setup.
2. Scorecard takes two arms and prints per-capability deltas and the verdict.
3. `NIGHTLY_AGENT_FLAGS` (whole-agent arm), since it covers all 221 flags.
4. `NIGHTLY_ARM_FLAGS` (cohort arm) for same-night comparisons.
5. A queue file (`scripts/voice-eval/nightly/arm-queue.txt`): which batch runs
   next, most valuable first (crisis false alarms, recall, turn-taking).

## Anti-goals

- Any prod change from the sweep. It stays dev only.
- A flag judged on one night.
- Crisis flags batched with others: they run alone, with the crisis eval.
- Arms that leave dev in a different state than they found it.
