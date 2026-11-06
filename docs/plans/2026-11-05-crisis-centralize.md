# Crisis checks: one kernel, one read per turn

Owner ask (2026-11-05): "make sure all crisis checks are centralized and rationalized".

## Where we are (main, 2026-11-05)

- 6 deterministic readers, 9 model readers, 14 combiners (docs/plans/2026-11-01-crisis-kernel-map.md).
- The voice turn is decided twice: the reply gate (crisis-gate.ts) and the pipeline (turn-crisis.ts),
  each with its own combiner chain. The gate lacks the blocked-read, minor-abuse and abuse paths.
- Non-test files under src/ outside services/safety define their own crisis regex (tone, pacing,
  laughter, intent routing, memory, coaching, transfer ...) or hard-code a crisis resource. Measured by
  the S0 ratchet on the day it landed (code only, comments excluded): 42 files with 61 crisis regexes,
  30 files with 179 resource literals (988, 911, 741741, hotline, lifeline, crisis line). A plain grep
  finds 51 files outside services/safety that mention 988, the rest only in comments.
- New work keeps adding local copies (a safety-sentence regex in the ledger, local rows in the
  graded shadow, alert screens).

## Target

1. `src/services/safety/kernel/` is the only place that reads crisis words or decides a crisis action.
   - `readTurn(text, call) -> CrisisRead` (all deterministic + model reads, one combiner chain).
   - `decide(read, call) -> CrisisDecision` (replace / guidance / child-safety / soft check / none).
   - `CRISIS_RESOURCES` (988, 911, Childhelp, intl numbers, spoken forms): the only source of those strings.
   - `isSafetyTalk(sentence)` / `isHeavyMoment(read)` for consumers that only need a yes/no.
2. The gate and the pipeline call `decide` once per turn and share the result (no second chain).
3. Every other file asks the kernel; no crisis regex or resource literal outside it.

## Steps (each PR <= 400 lines, never lower: `crisis:baseline --check` byte-identical, must-catch 100%)

- S0 freeze (no runtime change): CI ratchet `scripts/ci/crisis-readers-ratchet.ts` (pattern:
  firestore-database-ratchet.ts). Fails when a non-test file under src/ outside `src/services/safety/`
  adds a crisis-word regex or a 988/911/hotline literal. Baseline = the sites on the day it landed
  (`crisis-readers-allowlist.generated.json`, per file and kind); `--update` can only lower it. Plus this plan.
- S1 resources: one `CRISIS_RESOURCES` module; move every 988/911/hotline string onto it. Mechanical,
  scripted (agent-task-sizing: >= 20 identical edits -> script). Byte-identical prompts.
- S2 yes/no consumers: the 31 regex files call `isSafetyTalk` / `isHeavyMoment` / the read already on the
  turn. Split by subsystem, <= 8 sites per PR.
- S3 one chain: gate and pipeline share one `decide` (merge the combiner lists; the gate gains the
  blocked-read, minor-abuse and abuse paths). Crisis lane, owner yes per PR.
- S3b one client signal: the server sends `crisis_detected` whenever `decide` returns any crisis action
  (today only on a 988 override, turn-handler.ts:1359); web and iOS mark the call from it. The
  humanization `concernLevel: "crisis"` keyword list stops being its own source (it reads the kernel).
  Until then iOS honors both (caretaker's iOS PR after #3495).
- S4 delete: readers with no unique catch (proven by the baseline) are removed with grep proof
  (`assessSafety`, `checkWarnings` crisis words, `detectCrisisSignals` crisis words -> read the kernel).

## Rules for in-flight work (now)

- No new crisis reader, regex or resource literal outside services/safety. Reuse a kernel export;
  if none exists, export one from services/safety and use it.
- Missing catches (third-person collapse, plural subjects, post-question disclosures, spelled digits)
  go into the shared reader as K1 rows, never into a local copy.
