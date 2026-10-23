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

## Checking a release

`release-check.mjs` runs steps 2 and 3 against an env that already runs the candidate, and decides.
It deploys nothing and calls nobody: it reads the sweep run files and the agent's Cloud Logging
lines (`cloud-agents`, project `johnb-2025`; `lk agent logs` misses other replicas).

```bash
node scripts/voice-eval/release-check.mjs dev <candidate-sha> <baseline-sha> \
  --candidate <candidate-sweep-dir> --baseline <baseline-sweep-dir> --out release-check.txt
```

Use `--out`, not `| tee`: the file ends with the result and the exit code, and a pipe would hide
the exit code and drop errors.

**Not a release gate yet.** Without the liveness and missed-crisis checks (#2475), a sweep of
captionless or empty calls can PASS, so don't promote on this output until those land.

- **Self-test:** each gating predicate must fail a known-bad call, loaded through `loadSweep`.
- **Provenance:** each call's room maps to its workers and the commit on each worker's last boot
  `EFFECTIVE_SETTINGS` before the call. Every candidate call must be on the candidate commit, and
  the baseline needs log lines too. A baseline from before `.build-sha` (2026-10-22) logs
  `"commit":"unknown"`: that is INCONCLUSIVE unless you pass `--allow-unstamped-baseline` (a NOTE).
- **Coverage:** the candidate must run every baseline scenario. Unreadable run files are listed.
  Either one is INCONCLUSIVE.
- **Gates:** a gating predicate's hit on any candidate call is a FAIL, shared scenario or not.
- **Primary metrics**, fixed before the sweep: `gate` (share of calls passing every gate, margin
  0.10) and `replyGapMedMs` (median REPLY gap per call, margin 300 ms), paired with a 95% CI from
  scenario resamples. PASS when the CI stays inside the margin (a NOTE if it is worse but inside),
  FAIL when the CI shows it worse, INCONCLUSIVE otherwise or under 10 shared scenarios.
- **Exit:** 0 PASS, 1 FAIL, 3 INCONCLUSIVE (add scenarios or repeats), 2 harness
  error, 4 `--dry-run` (prints the log queries; nothing checked). `--offline` skips the logs, so it
  can't PASS. `--logs DIR` caches the logs, keyed by query.

## Realistic callers

Cooperative scripted callers in clean TTS made every number so far. `run.sh --realistic` (options in
its header) adds ums, restarts, a varied rate and 400–1500 ms mid-thought pauses (`caller-realism.mjs`,
`caller-personas.json`); `realistic-*` scenarios are low-cooperation callers (#2333, #2289, #2422).
Each run writes `<run>.realism.json`: takeover and false-end rates, gap and barge-in stop p50/p90
(see `realism-metrics.mjs`). An unanswered turn counts as 15 s, so a short call's gap p90 mostly says
whether any turn went unanswered: read `rt:unanswered-rate` beside it. `values` (`rt:*`) are
`pairedCompare` input: `realism-metrics.mjs paired <A> <B>`, or add `realismValues(dir)` to `sweepValues(dir)`.
