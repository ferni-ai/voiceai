# Tool retrieval: Step 1 results (2026-09-28)

Goal: send each turn only the tools it needs (Toollery, arXiv 2609.22218)
instead of every tool definition. Measured on 1,188 registered tools
(123 domains, ~156k tokens of definitions in total, ~132 tokens each).

## Reproduce

```bash
npx tsx scripts/tool-retrieval/inventory.ts            # out/tools.json
npx tsx scripts/tool-retrieval/router-examples.ts      # out/router-examples.json
node scripts/tool-retrieval/generate.mjs manual --tools scripts/tool-retrieval/out/missing.json --per 6
node scripts/tool-retrieval/generate.mjs test --per 2
python3 scripts/tool-retrieval/build-manual.py --per 12  # src/tools/retrieval/intent-manual.generated.json
npx tsx scripts/tool-retrieval/evaluate.ts               # BM25
node scripts/tool-retrieval/embed.mjs vertex             # or: local Xenova/bge-base-en-v1.5
npx tsx scripts/tool-retrieval/evaluate-dense.ts vertex
npx tsx scripts/tool-retrieval/judge-misses.ts vertex spoken 20 250
```

## Intent manual

- 753 tools have examples in `apps/ml-training/router/data/train_v6.jsonl`
  (the old router's training set); 12 diverse ones per tool are kept.
- 435 tools had none; Gemini wrote 6 spoken-style requests each.
- `validation_v6.jsonl` is NOT a valid test: 93.1% of its requests appear
  verbatim in train_v6 (train has 89.6k unique requests in 432k rows).

## Test sets (never indexed)

| Set | Source | n |
|---|---|---|
| heldout | other train_v6 requests for the same tool | ~2.2k |
| router | hand-written semantic-router examples, mapped to tool names | 683 |
| spoken | gemini-3-flash-preview, different prompt, rambling phrasing | 2,375 |

`heldout` shares the index's source and templates: it overstates recall
(BM25 @10 rose 0.71 → 0.99 from 12 to 60 examples per tool while `router`
stayed at 0.56-0.58). Judge by `router` and `spoken`.

## Strict recall (labelled tool in the top k)

| Method | spoken @10 | spoken @20 | router @10 | router @20 | per query |
|---|---|---|---|---|---|
| BM25 (12/tool) | 0.30 | 0.39 | 0.56 | 0.63 | 0.4 ms |
| local bge-small (384-d) | 0.64 | 0.72 | 0.74 | 0.80 | 1.5 ms embed |
| local bge-base (768-d) | 0.70 | 0.77 | 0.76 | 0.82 | 4.6 ms embed |
| Vertex text-embedding-005 | 0.79 | 0.85 | 0.78 | 0.86 | 190 ms p50 / 400 ms p90 embed (from a laptop) |
| BM25 + Vertex, RRF | 0.58 | 0.78 | 0.70 | 0.80 | |

Dense scoring: brute force over ~14k example vectors, 8-10 ms per query in
JS. 12 vs 30 examples per tool made no difference for Vertex (spoken @10
0.79 vs 0.80). Fusion with BM25 hurts on spoken input, unlike the paper.

## Sufficient recall (a retrieved tool does the job as well as the labelled one)

Many tools are near-duplicates (setReminder / scheduleReminder,
saveLocation / saveMyLocation), so strict recall under-counts. Strict misses
judged by gemini-3.5-flash (strict prompt, up to 250 per row), Vertex, 30/tool:

| Set | k | strict | misses judged equivalent | sufficient |
|---|---|---|---|---|
| spoken | 10 | 0.804 | 51.6% | 0.905 |
| spoken | 20 | 0.858 | 54.0% | 0.935 |
| router | 10 | 0.782 | 57.7% | 0.908 |
| router | 20 | 0.830 | 60.3% | 0.933 |

Tokens: the top 10 tools average ~1.2k tokens, top 20 ~2.5k (vs ~28k for the
338 always-on tools before 2026-09-28).

## What these numbers do not cover

- Real call transcripts: tool-call telemetry (`tool_usage_calls`) does not
  store the user's words, so no real-user test set exists yet.
- The always-on core set, recently used tools and a findTool fallback, which
  the runtime design adds on top of retrieval.
- Multi-turn context ("yes, do that"): the queries here are single turns.

## Specialist tool sets on handoff (SPECIALIST_TOOLS, 2026-10-20)

Does a specialist handed the call choose its tools better with its own set
(`specialist-tool-sets.ts`) than with today's? `eval-choice.ts` with
`TOOL_SET=handoff` (flag off) vs `handoff-persona` (flag on), the persona's own
character prompt (`PERSONA`), gemini-3.5-flash, same requests in both arms.
Both sets are built by the production functions in `agent-setup.ts`'s order
(warmed gateway Tier 0, `withCallJournalTools`, `withAlwaysOnTools`, the cap;
`MULTI_AGENT_SINGLE_SESSION` is on by default, so no post-greeting update). A
`setupPersonaAgent` dump (the branch's test path) gave the same flag-on set for
all six personas; flag off, the eval's set had one extra tool (`setVibe`).

Specialty: 60 requests per seed whose labelled tool is in one of the persona's
specialty domains (`EVAL_DOMAINS=specialty`), seeds 1 and 2. General: the 38
requests for the 20 tools prod calls use most (`EVAL_LABELS=head`). Right =
labelled tool or a judged equivalent. findTools was used 0% in every run.

| persona       | specialty right, off (s1/s2) | on (s1/s2)  | delta | general right off -> on | tools off/on | prompt tokens off/on | ship |
| ------------- | ---------------------------- | ----------- | ----- | ----------------------- | ------------ | -------------------- | ---- |
| maya-santos   | 0.0 / 0.0                    | 40.0 / 35.0 | +37.5 | 47.4 -> 52.6            | 47 / 48      | 5.65k / 6.17k        | yes  |
| alex-chen     | 5.0 / 6.7                    | 25.0 / 31.7 | +22.5 | 47.4 -> 47.4            | 47 / 49      | 5.71k / 6.84k        | yes  |
| jordan-taylor | 5.0 / 3.3                    | 36.7 / 31.7 | +30.0 | 42.1 -> 52.6            | 47 / 47      | 5.75k / 6.44k        | yes  |
| nayan-patel   | 3.3 / 3.3                    | 60.0 / 60.0 | +56.7 | 44.7 -> 57.9            | 47 / 46      | 5.65k / 6.33k        | yes  |
| peter-john    | 0.0 / 0.0                    | 20.0 / 22.0 | +21.0 | 44.7 -> 50.0            | 47 / 48      | 5.83k / 6.38k        | yes  |
| joel-dickson  | 1.7 / 0.0                    | 18.3 / 18.3 | +17.5 | 39.5 -> 60.5            | 47 / 43      | 11.84k / 11.98k      | yes  |

Ship rule: right(on) >= right(off) - 1 point and tools sent <= 64. Seed-to-seed
noise at n=60 was up to 6.7 points; every delta is well above it.

- **Flag off, a specialist cannot do its job**: its specialty tools are never
  sent (right tool sent 0% for all six), and the model calls `processing` or
  `adjustPacing` instead.
- **Flag on, when the specialty tool is in the set it is called**: 35/39
  (Maya), 19/22, 35/36, 67/68, 19/21, 17/19 right. The low totals come from
  domain requests for tools left off the lists (Maya: habitStrategy,
  habitSetback, behaviorArchitecture, bankAccount; Alex: detectCalendarIssues,
  getNotes; Peter: trackHypothesis, budgetPlanner; Joel: the
  security-specific tools, left out on purpose). Repeated in-set misses:
  gentleAccountability -> setReminder (Maya, 4), emotionalSupport ->
  deEscalateAnxiety (Joel, 2).
- **General requests: no persona loses.** Both arms lack getWeatherForecast,
  quickWeather, setTimer, tellJoke, getFunFact, searchWeb, callOnBehalf and
  addRelationship (getWeather and quickTimer stand in). Flag on adds
  connectToHumanExpert and drops getTodaySignificance.
- **Risk**: with `MULTI_AGENT_SINGLE_SESSION=off` (kill switch), the
  post-greeting update re-caps the set to 88 essentials-first, and Maya keeps
  4 of her 18 specialty tools.

Control (Ferni, all requests, seed 1, n=300): `TOOL_SET=today` right 15.1%
(right tool sent 5.0%, 88 tools); `retrieval` 75.2% (sent 77.9%). On the same
300 requests the 2026-09-30 files score 73.0% (`baseline-s1`, all rows) and
82.1% (`base2-s1`, 26 errored rows dropped).

```bash
export GOOGLE_CLOUD_PROJECT=johnb-2025
for P in maya-santos alex-chen jordan-taylor nayan-patel peter-john joel-dickson; do
  for T in handoff handoff-persona; do
    for S in 1 2; do
      TOOL_SET=$T PERSONA=$P EVAL_DOMAINS=specialty npx tsx scripts/tool-retrieval/eval-choice.ts 60 $S sp-$P-$T-s$S
    done
    TOOL_SET=$T PERSONA=$P EVAL_LABELS=head npx tsx scripts/tool-retrieval/eval-choice.ts 60 1 gen-$P-$T
  done
done
TOOL_SET=today npx tsx scripts/tool-retrieval/eval-choice.ts 300 1 ctl-ferni-today
npx tsx scripts/tool-retrieval/eval-choice.ts 300 1 ctl-ferni-retrieval
```

38 runs, 3 in parallel: ~13 min, ~2.4k requests to gemini-3.5-flash.

**List fix, 2026-10-20 (same seed 1, handoff-persona, 60 specialty requests):** added the tools the
misses pointed at (Maya habitStrategy/habitSetback/behaviorArchitecture; Alex detectCalendarIssues/getNotes;
Jordan exploreGrowthAreas/createLearningPath; Nayan protectPresence/assessMindfulness; Peter
trackHypothesis/budgetPlanner; bankAccount left out: it sends a link by text/email). Right-or-equivalent:
Maya 40.0→43.3, Alex 25.0→27.1, Jordan 36.7→41.7, Nayan 60.0→65.0, Peter 20.0→25.0; tools sent ≤ 51.
