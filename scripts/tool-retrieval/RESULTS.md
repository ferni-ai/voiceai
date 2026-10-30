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

# Persona toolsets: Phase 1 (2026-10-29)

Question: with `PERSONA_TOOLSETS` (each persona one fixed set of 40 or fewer:
`src/agents/multi-agent/persona-toolsets.ts`), does the model pick the right tool more often than
with the 96-tool sets of Phase 0 and with today's prod set, and what does the set leave out?

## Method

- The set the harness offers is the production builder's (`personaToolset`) over the registry,
  with the registry's handoffs cut to the persona's teammates: 38 tools (the cap of 40 keeps 2
  slots for `findTools` and `endCall`). Every arm of a persona uses that persona's prompt.
- **In set, paired:** `TOOL_PERSONA=<id> EVAL_LABELS=persona` keeps every frozen-set request whose
  label is in the persona's set: 74 requests (37 tools x 2) per persona. Each runs once with the
  persona set (`TOOL_SET=persona`), with the Phase 0 96-tool set (`TOOL_SET=count TOOL_COUNT=96
TOOL_SEED=1`: the 20 head tools, random registry distractors, the label always in), and for
  Ferni and Maya with today's prod set (`TOOL_SET=today`: the capped essentials plus the
  post-greeting update, 88 tools, which omits some labels; a label it omits is its miss).
- **Out of set:** a uniform sample of the frozen set (seed 1, as Phase 0 drew it: 300 for Ferni,
  150 for Maya) plus the 60 negatives. A request whose label the 96 baseline offered but the
  persona set does not is the coverage cost.
- Scored by `persona-toolset-score.mjs`. About 2,450 model calls in all (one interrupted run
  included), 1 run per arm. With n = 74 a paired CI is about ±10 points, so only large
  differences are visible.

```bash
for p in ferni maya-santos; do
  for set in persona today; do
    TOOL_SET=$set TOOL_PERSONA=$p EVAL_LABELS=persona npx tsx scripts/tool-retrieval/eval-choice.ts 10000 1 inset-$p-${set/persona/set}
  done
  TOOL_SET=count TOOL_COUNT=96 TOOL_SEED=1 TOOL_PERSONA=$p EVAL_LABELS=persona \
    npx tsx scripts/tool-retrieval/eval-choice.ts 10000 1 inset-$p-96
done
TOOL_SET=persona TOOL_PERSONA=ferni EVAL_NEGATIVES=1 npx tsx scripts/tool-retrieval/eval-choice.ts 300 1 persona-ferni-r1-s1
node scripts/tool-retrieval/persona-toolset-score.mjs scripts/tool-retrieval/out
```

## Results (gemini-3.5-flash)

In set, paired, 74 requests per row:

| persona | baseline   | right-or-equiv: set / base | lookalike: set / base | missed: set / base | paired diff [95% CI]  | McNemar           |
| ------- | ---------- | -------------------------- | --------------------- | ------------------ | --------------------- | ----------------- |
| Ferni   | today (88) | **77.0 / 66.2**            | 12.2 / 29.7           | 10.8 / 4.1         | **+10.8 [0.0, 21.6]** | b=12 c=4, p=0.077 |
| Maya    | today (88) | **82.4 / 65.8**            | 6.8 / 23.3            | 10.8 / 11.0        | **+16.4 [5.5, 27.4]** | b=16 c=4, p=0.012 |
| Ferni   | 96         | 77.0 / 85.1                | 12.2 / 9.5            | 10.8 / 5.4         | -8.1 [-18.9, 2.7]     | b=5 c=11, p=0.21  |
| Maya    | 96         | 82.4 / 85.1                | 6.8 / 8.1             | 10.8 / 6.8         | -2.7 [-10.8, 5.4]     | b=4 c=6, p=0.75   |
| Alex*   | 96         | 75.7 / 85.1                | 9.5 / 8.1             | 14.9 / 6.8         | -9.5 [-18.9, 0.0]     | b=4 c=11, p=0.12  |
| Jordan* | 96         | 81.1 / 82.4                | 6.8 / 10.8            | 12.2 / 6.8         | -1.4 [-10.8, 8.1]     | b=6 c=7, p=1.0    |
| Nayan*  | 96         | 81.1 / 83.8                | 6.8 / 6.8             | 12.2 / 9.5         | -2.7 [-12.2, 6.8]     | b=5 c=7, p=0.77   |
| Peter*  | 96         | 78.4 / 83.8                | 5.4 / 8.1             | 16.2 / 8.1         | -5.4 [-14.9, 4.1]     | b=4 c=8, p=0.39   |

\* The 96 arm ran with Ferni's prompt and the set arm with the persona's own, so these rows mix
prompt and tools.

Out of set (uniform sample of the synthetic set):

| persona | sampled | out of set  | served anyway | handed off | no call | other tool | false call on negatives |
| ------- | ------- | ----------- | ------------- | ---------- | ------- | ---------- | ----------------------- |
| Ferni   | 288     | 283 (98.3%) | 7.4%          | 7.8%       | 66.4%   | 22.3%      | 0 of 60                 |
| Maya    | 144     | 141 (97.9%) | 7.1%          | 8.5%       | 73.8%   | 14.2%      | 0 of 60                 |

## Reading

- **Against today's prod set the persona sets win** for both personas measured: Ferni +10.8, Maya
  +16.4 (p=0.012), with lookalike calls down from 23-30% to 7-12%. Most of Maya's gain is her own
  tools, which today's set doesn't offer (13 of her 16 wins: `habitSetback`, `celebrateTinyWin`,
  `logExercise`...).
- **Against Phase 0's random 96 they do not win** (point estimates -1 to -10, no CI excludes 0).
  A random 96 seldom holds the label's lookalikes; a persona set always does, because its shared
  core keeps them: `connectToHumanExpert` lost to `evaluateHumanTransfer` and `updateMemory` to
  `rememberAboutUser` on every persona. That is the caveat Phase 0 recorded (a persona set is not
  random). Missed calls also rise, mostly handoffs the persona didn't make.
- **The coverage cost is large on this set:** 98% of its labels are outside any one persona's
  set, because the synthetic set spreads evenly over ~1,160 tools. Out of set, the model mostly
  makes no call (66-74%) or hands off (8%); it serves 7% with an equivalent tool. Real traffic is
  concentrated on the head (prod 2026-10-05..18: about 20 tools made every call), so this is an
  upper bound; the prod reading is shadow retrieval's coverage (routing report, part 4).
- Next, before a cohort: split the lookalike pairs inside the shared core (or give them
  facades, Phase 2), and run the today-arm for the other four personas with their prompts.
