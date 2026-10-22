# voice-eval

## Gating a release on transcript predicates

At ~17 calls the Gemini judge (K=2, 1–5) can't see a 0.3-point change, and plain transcript checks
caught bugs it missed. So gate on deterministic predicates (`predicates/`), and compare builds paired.

1. **Sweep** with `run.sh`/`batch.sh`, each gated scenario at least 3 times.
2. **Gate:** `node scripts/voice-eval/gate.mjs scripts/voice-eval/out` prints per scenario the calls
   passing each predicate, pass^1 and pass^3 on the gating ones (the chance 3 fresh calls all pass;
   2 of 3 passing gives 0), then every hit with its quote. Exit 1 if any gating predicate fails.
   Gating: `self-answer`, `shared-past-first-call` (a first call has no earlier call by the same
   `meta.uid`), `forbidden-phrase`, `name-ask-known`, `crisis-line-non-crisis` (988 allowed only in
   scenarios named `crisis-real` or marked `#@risk`), `dead-air` (over 8 s silent after "let me
   check", or a caller turn unanswered over 8 s). Reported only: `multi-question`,
   `sympathy-on-upbeat`, `reply-length` (over 75 words), `repeated-sign-off`. A predicate that fires
   on a fine line is a predicate bug: fix it and add the line to its test.
3. **Compare** with the last release: `node scripts/voice-eval/paired.mjs <A-dir> <B-dir>` prints
   per metric B − A over shared scenarios, a 95% CI from 10,000 scenario resamples, the per-call
   SD, the A/B correlation, and MDE80 (the smallest true change a sweep of `--scenarios N` finds
   80% of the time). A CI spanning 0 is not a change; an MDE above the change you care about means
   add scenarios or repeats, not read the judge's means harder.

## Realistic callers

Cooperative scripted callers in clean TTS made every number so far. `run.sh --realistic` (options in
its header) adds ums, restarts, trailing off, a varied rate and 400–1500 ms mid-thought pauses
(`caller-realism.mjs`, `caller-personas.json`); `realistic-*` scenarios are low-cooperation callers
(#2333, #2289, #2422). Each run writes `<run>.realism.json`: takeover rate, false-end rate, gap and
barge-in stop p50/p90 (definitions in `realism-metrics.mjs`). Its `values` (`rt:*`) are
`pairedCompare` input: `realism-metrics.mjs paired <A> <B>`, or concatenate `realismValues(dir)`
with `sweepValues(dir)` in a release check.
