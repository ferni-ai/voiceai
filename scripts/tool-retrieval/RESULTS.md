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
