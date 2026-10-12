# In-call deliberation: dev A/B plan (2026-10-10)

**Flag:** `DELIBERATION=on` (off by default). Code: `src/agents/personas/deliberation.ts` (PR #686).
**Target:** the judge's `thought` dimension (`scripts/voice-eval/judge.mjs`), stuck at 2.4-2.9 on
dev and prod calls, below a good friend's 3.

## What changes on a call

After each exchange, a caller turn that carries weight (a real share or request of 18+ words, or
8+ words with feeling or stakes; never small talk, look-ups, tool jobs or hard news) is sent with the
last 16 lines and the turn's memory note to Gemini 3.5 Flash with a 1,024-token thinking budget.
It returns at most one thought (insight / question / connection / reframe) with a confidence (kept
at 0.6+), a why-now and a do-not-use condition. The next suitable request carries it as an optional
note (≤80 tokens), at most once every 3 turns; unused for 2 turns, it expires. Never on a crisis
turn (and 3 turns after one), while the caller is venting or hurting, or while support comes first
after hard news. The reply never waits for it.

## Arms

| Arm | Env (dev agent, everything else as dev today) |
|---|---|
| A (control) | `DELIBERATION` unset |
| B | `DELIBERATION=on` |
| C (anticipate, PR #709) | `DELIBERATION=on DELIBERATION_MODE=anticipate` |

C drafts two directions per weighty turn, simulates how this caller would take each (with the
memory note and, when `THEORY_OF_MIND=on` from #684 is also set, the `[HOW THEY ARE]` note), and
keeps the better one; a choice simulated as `defensive` or `hurt` is dropped. Same call, budget
and safety rules as B. Run C only once #709 is deployed to dev. If #684 is live on dev, run C with
`THEORY_OF_MIND=on` for both B and C so the arms differ only in the simulation.

Optional extra arm if B or C wins but costs too much: add `DELIBERATION_THINKING_BUDGET=512`.

## Scenarios (scripts/voice-eval/scenarios)

| Scenario | Why |
|---|---|
| `depth-decision` (new) | a decision whose real stake (mom just moved in) is never named |
| `depth-unstated` (new) | a story (grandpa's watch) whose point is never said |
| `depth-connect` (new) | two remarks (pottery quiets my head / dropping it to work more) that connect |
| `dilemma`, `subtext` | existing depth-adjacent scenarios, checks it doesn't hurt them |
| `hard-news` | safety: B and C must log **0** `DELIBERATION_OFFERED` here |
| `long-day` | venting: offers should be rare and never mid-vent |

5 calls per scenario per arm (35 per arm, 105 with C), fresh user per call (`run.sh dev <scenario> <arm>-<n>`),
interleaved A/B so time of day and model drift hit both arms.

## Measures

- **Primary:** pooled judge `thought` on the three depth scenarios, B minus A, bootstrap 95% CI.
- **Guardrails** (all scenarios): `understanding`, `empathy`, `conduct`, `candor`, `recall` must
  not drop more than 0.2; reply delay (first audio after end of turn) p50/p90 unchanged.
- **Mechanics** from logs: `DELIBERATION` (runs, `kind`, `ms`, `turnsLate`, `usage`),
  `DELIBERATION_OFFERED`, `DELIBERATION_EXPIRED`, and the per-call `DELIBERATION_SUMMARY`
  (`runs`, `none`, `failed`, `offered`, `expired`, `echoed`, token totals). `echoed` (2+ of the
  note's content words in Ferni's next reply) estimates how often a note was actually used.
- **Cost:** from `DELIBERATION_SUMMARY` token totals at $1.50/M input, $9.00/M output (thinking is
  billed as output).

- **C only:** from the `DELIBERATION` log, `options` (kind, simulated reaction, fit), `chose`,
  `because`, `choseBestFit`, and `landsBadly` (also counted per call in `DELIBERATION_SUMMARY`).
  Labels only, no words. Check `choseBestFit` is mostly true (the model keeps what it rated better)
  and how often a thought is dropped for landing badly.

## Decision rule

Ship to prod (flag on) if: `thought` B-A ≥ +0.3 with the CI clear of 0; no guardrail fails;
`hard-news` shows 0 offers; mean cost ≤ $0.10 per call. If `thought` moves but `echoed`/`offered`
is under 20%, the notes are ignored: fix the note wording before more calls, not the deliberator.
If `expired` dominates, notes arrive too late: check `turnsLate` and the trigger.
C replaces B as the default only if C-B on `thought` is ≥ +0.2 with the CI clear of 0 and
`empathy` is no lower; otherwise B (simpler) stays the default.

## Cost estimate (to be replaced by measured tokens)

Per run, at the cap: ~1.0k input tokens (system 1,235 chars + 16 lines + 1,200-char memory note,
~4 chars/token) and ≤1.3k output (1,024 thinking + ≤300 answer): ≈ $0.0016 + $0.012 = **≈$0.013**.
Runs are capped at 10 per call (**≤$0.14**); the trigger and spacing should leave 3-5 on a
10-minute call (**≈$0.04-0.07**). Thinking tokens dominate; `DELIBERATION_THINKING_BUDGET` halves it.
