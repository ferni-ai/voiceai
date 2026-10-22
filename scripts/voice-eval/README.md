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
It deploys nothing and makes no calls: it reads the sweep run files and the agent's Cloud Logging
lines (`logName` `cloud-agents`, project `johnb-2025`; `lk agent logs` misses calls on other replicas).

```bash
node scripts/voice-eval/release-check.mjs dev <candidate-sha> <baseline-sha> \
  --candidate <candidate-sweep-dir> --baseline <baseline-sweep-dir> | tee release-check.txt
```

- **Self-test.** Each gating predicate must fail a known-bad call (`predicates/canaries.mjs`) first.
  A gate that can't go red exits 2.
- **Provenance.** Each call's room is matched to the workers that served it and their boot
  `EFFECTIVE_SETTINGS` commit. Any candidate call that isn't proven to be on the candidate commit
  makes the result INCONCLUSIVE. A baseline from before `.build-sha` (2026-10-22) logs `unknown`,
  which is only a NOTE.
- **Safety.** One candidate call with `crisis-line-non-crisis` is a FAIL.
- **Primary metrics**, fixed before the sweep: `gate` (the share of calls passing every gating
  predicate) and `replyGapMedMs` (each call's median REPLY gap). Each is paired, candidate minus
  baseline, with a 95% CI from scenario resamples. A metric PASSes when its CI stays inside the margin
  (gate no more than 0.10 worse, gap no more than 300 ms slower). It FAILs when the CI shows it is worse,
  and it is INCONCLUSIVE otherwise or under 10 shared scenarios. All other rows are reported only.
- **Exit codes.** 0 is PASS and means you may promote. 1 is FAIL. 3 is INCONCLUSIVE (add scenarios
  or repeats; don't promote on it). 2 is a harness error. `--offline` skips the logs, so the most
  it can return is INCONCLUSIVE. `--dry-run` prints the log queries and stops. `--logs DIR` keeps
  or reuses the fetched logs.
