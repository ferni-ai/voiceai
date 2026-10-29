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

# Tool-count sweep: Phase 0 (2026-10-29)

Question: is gemini-3.5-flash more accurate at choosing a tool from 40 tools than from 96 (the
prod median offered per turn)? Kill criterion (`SOTA tool routing for voice agents`, Phase 0): if
40 is not at least 2 points better than 96, paired and beyond noise, pruning is hygiene, not an
accuracy fix.

## Method

- `TOOL_SET=count TOOL_COUNT=<k> TOOL_SEED=1 EVAL_NEGATIVES=1 eval-choice.ts 300 <seed>`.
  Each request gets `k` tools: the 20 prod head tools (`HEAD`; `askForTeammate` is not
  registered, so 19), then the registry (the 1,165 tools `inventory.ts` lists) in one seeded
  shuffle, plus the request's labelled tool in its own place. The same `TOOL_SEED` for every
  size, so a request's 40-tool set is a subset of its 64-, 96- and 130-tool sets
  (`tool-count-set.mjs`, unit-tested). Comparisons are paired on the same requests.
- 300 spoken requests x 2 sample seeds (the frozen v1 set, the same draws as September's 82%
  runs), 2 runs per size, plus 60 fictional no-tool small-talk lines
  (`fixtures/no-tool-negatives-v1.json`) in every file. 200 of 6,000 request rows have a label that
  is no longer registered (gitDiff, Sonos, movies...) and are not scored.
- Scores (`tool-count-sweep.mjs`): right-or-equivalent (labelled tool, or one the strict judge
  says serves as well); missed call (no tool); lookalike (another tool the judge rejected); false
  call (any tool on a no-tool line). Paired diff with a request-resampled 95% CI
  (`pairedChoice`); exact McNemar per run (pooling both runs would count each request twice).
- 7,200 rows, about 8,100 model calls (plus 1,610 for the second distractor draw below). 4
  errored rows (1 more in the second draw), all a pre-existing harness gap (the model returned two parallel calls after a
  lookup and the harness answered one: Vertex 400); no quota errors.

Reproduce (about 2.5 min per file at the harness's concurrency of 6):

```bash
for run in 1 2; do for seed in 1 2; do for k in 20 40 64 96 130; do
  TOOL_SET=count TOOL_COUNT=$k TOOL_SEED=1 EVAL_NEGATIVES=1 \
    npx tsx scripts/tool-retrieval/eval-choice.ts 300 $seed count$k-r$run-s$seed
done; done; done
node scripts/tool-retrieval/tool-count-sweep.mjs scripts/tool-retrieval/out 40:96 20:130
```

## Results (gemini-3.5-flash, Ferni character prompt, distractor draw TOOL_SEED=1)

| tools | right-or-equiv, mean (run 1 / run 2) | missed call | lookalike | false call on negatives (run 1 / run 2) |
| ----- | ------------------------------------ | ----------- | --------- | --------------------------------------- |
| 20    | **94.1%** (94.0 / 94.1)              | 4.1%        | 1.8%      | 2.5% (2.5 / 2.5)                        |
| 40    | **91.7%** (91.4 / 92.1)              | 3.4%        | 4.9%      | 1.7% (1.7 / 1.7)                        |
| 64    | **90.3%** (90.5 / 90.0)              | 3.2%        | 6.6%      | 0.8% (1.7 / 0.0)                        |
| 96    | **88.7%** (88.6 / 88.8)              | 1.8%        | 9.5%      | 1.7% (1.7 / 1.7)                        |
| 130   | **86.2%** (86.0 / 86.3)              | 2.9%        | 11.0%     | 3.8% (4.2 / 3.3)                        |

n = 1,157-1,160 scored rows per size (580 per run); rerun noise is 0.1-0.7 points.

| pair      | paired diff [95% CI]     | McNemar run 1      | McNemar run 2      |
| --------- | ------------------------ | ------------------ | ------------------ |
| 40 vs 96  | **+2.6 pts [0.3, 4.8]**  | b=35 c=20, p=0.058 | b=34 c=15, p=0.009 |
| 20 vs 130 | **+7.8 pts [5.1, 10.7]** | b=60 c=14, p<1e-7  | b=61 c=16, p<1e-6  |
| 20 vs 40  | +2.5 pts [0.4, 4.6]      |                    |                    |
| 64 vs 96  | +1.0 pts [-1.2, 3.2]     |                    |                    |
| 96 vs 130 | +2.8 pts [0.7, 5.0]      |                    |                    |

(b = right only at the smaller size, c = right only at the larger.)

**Second distractor draw** (`TOOL_SEED=2`, 40 and 96 only, 1 run): 93.1% vs 89.3%, **+3.3 pts
[0.9, 5.7]**, McNemar b=34 c=13, p=0.003; lookalike 4.5% vs 9.7%. The slope does not depend on
which random tools pad the set.

Top lookalikes (label → called, count over both runs):

- 20: checkCameoOpportunity→handoffToPeter 4; flagConnectionConcernForMaya→addRelationship 3;
  riskAnalysis→handoffToPeter 2; setBirthday→addRelationship 2; makeRestaurantReservation→searchWeb 2
- 40: remindThesis→getTheses 4; flagProcrastinationPatternForMaya→rememberAboutUser 4;
  deleteCalendarEvent→searchWeb 4; motivationCoaching→getStarted 2; suggestEventTiming→getTheses 2
- 64: flagProcrastinationPatternForMaya→rememberAboutUser 4; bankAccount→saveContactInfo 2;
  scheduleJoy→detectCalendarIssues 2; getGameHistory→getTheses 2; checkRelationshipHealth→listRelationships 2
- 96: identifyAngerTriggers→understandAnger 4; remindThesis→getTheses 4;
  flagConnectionConcernForMaya→addRelationship 4; proactiveInsights→getMorningBriefing 3;
  deleteCalendarEvent→detectCalendarIssues 3
- 130: perfectionismTriggers→understandPerfectionism 5; boundaryCoaching→identifyBoundaryNeeds 4;
  proactiveInsights→getMorningBriefing 4; readSMS→searchWeb 3; triggerAutomation→listWebhooks 3

False calls on negatives are almost all `getTodaySignificance` (a head tool) on openers like
"what's new with you?"; at 130, `startTextGame` and `getWeather` join in.

## Verdict: PASS (pruning helps), with a small margin

40 tools beat 96 by 2.6 points on one distractor draw and 3.3 on another. Both clear the 2-point
bar as point estimates, and both CIs exclude zero, so the gain is beyond the ~1-point rerun noise.
The curve falls steadily from 94% at 20 to 86% at 130, about 1 point per 14 tools. The mechanism is
lookalikes: their rate doubles from 40 to 96 (4.9% → 9.5%) as more near-duplicates land in the set,
while missed calls fall slightly (3.4% → 1.8%). The CI lower bounds (0.3, 0.9) are under 2, so the
true 40-vs-96 gain could be as small as about 1 point. Read this as "pruning is an accuracy lever
of about 2-4 points", not as a guaranteed 2.

Caveats:

- Distractors are random registry tools. Prod's 96 is not random: it is the essential domains plus
  keyword topics, which hold more same-domain lookalikes (setReminder / scheduleReminder). The
  absolute rates here (86-94%) are higher than the retrieval-mode 82% for that reason and because
  the label is always present. A persona set is not random either, so measure the real Phase 1 sets
  on this harness before claiming a number for them.
- Requests are single spoken turns from the synthetic v1 set, with no ASR noise and no
  multi-turn context.
- The negatives are 60 lines written for this run; false-call rates of 1-4% rest on 1-5 calls per
  run.
