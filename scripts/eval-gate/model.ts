#!/usr/bin/env tsx
/**
 * Eval gate, model suites: production code on committed synthetic cases
 * against Vertex AI, compared with evals/baselines/model.json.
 *   semantic_recall    recall-cases.json via embedForRetrieval + standouts() (deterministic)
 *   crisis_classifier  the four crisis sets via classifyCrisis(), production prompt, x3
 *   tool_retrieval     router examples (never indexed) via the live dense tool index
 *
 *   pnpm tsx scripts/tool-retrieval/router-examples.ts
 *   GOOGLE_CLOUD_PROJECT=<p> pnpm tsx scripts/eval-gate/model.ts [--json] [--write-baseline]
 *
 * EVAL_GATE_SUITES=crisis_classifier,... runs and compares only those suites
 * (CI picks them with suites.mjs from the changed paths); unset runs all three.
 *
 * ADC only, and never on the local embedding fallback (no semantic meaning).
 * Per run: ~1,260 flash-lite calls and ~16k embeddings, a few cents, ~1-2 min.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CRISIS_CONTEXTUAL } from '../../src/agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../src/agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import { getEmbeddingProvider, VertexAIEmbeddings } from '../../src/memory/vectors/embeddings.js';
import { embedForRetrieval } from '../../src/memory/vectors/retrieval-embeddings.js';
import {
  classifyCrisis,
  createGeminiCrisisGenerate,
  crisisClassifierPrompt,
  type CrisisVerdict,
} from '../../src/services/safety/crisis-classifier.js';
import { createVertexEmbedder, getSharedToolIndex } from '../../src/tools/retrieval/dense-index.js';
import { embedCallers } from '../memory-eval/recall-bench.js';
import { scoreAt, type BenchCaller } from '../memory-eval/recall-bench-lib.js';
import { report, selectSuites } from './gate-lib.js';

const CRISIS_REPS = 3;
const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

async function semanticRecall(): Promise<Record<string, number>> {
  const file = here('../memory-eval/recall-cases.json');
  const { callers } = JSON.parse(readFileSync(file, 'utf8')) as { callers: BenchCaller[] };
  const s = scoreAt(await embedCallers(callers, embedForRetrieval));
  return {
    'semantic_recall.hit_rate': s.hitRate,
    'semantic_recall.precision': s.precision,
    'semantic_recall.false_recall_rate': s.falseRecallRate,
  };
}

interface CrisisCase {
  text: string;
  label: 'block' | 'crisis' | 'none';
  earlier?: string[];
  companion?: string;
}

async function crisisClassifier(): Promise<Record<string, number>> {
  const set: CrisisCase[] = [...CRISIS_HELDOUT, ...CRISIS_TEST_BLIND, ...CRISIS_CONTEXTUAL, ...CRISIS_RELAY]; // prettier-ignore
  // Temperature 0 still varies by 1-3 lines a run; three passes shrink that
  // noise enough for a 1-point band to catch a softened prompt (measured).
  const cases = Array.from({ length: CRISIS_REPS }, () => set).flat();
  const generate = createGeminiCrisisGenerate();
  const prompt = crisisClassifierPrompt();
  const verdicts: Array<CrisisVerdict | null> = new Array(cases.length).fill(null);
  let next = 0;
  // Null is a timeout or an unusable reply; retry twice, then count it as an error.
  const worker = async (): Promise<void> => {
    for (let i = next++; i < cases.length; i = next++) {
      const c = cases[i];
      const input = { latest: c.text, earlier: c.earlier ?? [], companion: c.companion };
      for (let attempt = 0; attempt < 3 && !verdicts[i]; attempt++)
        verdicts[i] = await classifyCrisis(input, generate, 15_000, prompt);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  const n = { risk: 0, caught: 0, none: 0, fp: 0, block: 0, imminent: 0, errors: 0 };
  cases.forEach((c, i) => {
    const risk = verdicts[i]?.risk;
    if (!risk) return void n.errors++;
    const flagged = risk !== 'none';
    if (c.label === 'none') {
      n.none++;
      n.fp += Number(flagged);
      return;
    }
    n.risk++;
    n.caught += Number(flagged);
    n.block += Number(c.label === 'block');
    n.imminent += Number(c.label === 'block' && risk === 'imminent');
  });
  return {
    'crisis_classifier.recall': n.caught / n.risk,
    'crisis_classifier.false_positive_rate': n.fp / n.none,
    'crisis_classifier.imminent_recall': n.imminent / n.block,
    'crisis_classifier.errors': n.errors,
  };
}

async function toolRetrieval(): Promise<Record<string, number>> {
  const file = here('../tool-retrieval/out/router-examples.json');
  if (!existsSync(file))
    throw new Error('Run pnpm tsx scripts/tool-retrieval/router-examples.ts first');
  const all = JSON.parse(readFileSync(file, 'utf8')) as Array<{ query: string; tool: string }>;
  const embedder = createVertexEmbedder();
  const index = await getSharedToolIndex(embedder);
  // Score only examples whose tool is in the index (as RESULTS.md does); a tool
  // dropped from the manual shows up as lost coverage instead.
  const indexed = new Set(index.tools);
  const rows = all.filter((r) => indexed.has(r.tool));
  const vectors: Float32Array[] = [];
  for (let i = 0; i < rows.length; i += 100)
    vectors.push(...(await embedder.embed(rows.slice(i, i + 100).map((r) => r.query))));
  if (vectors.length !== rows.length) throw new Error('embedding count mismatch');
  const at = { 1: 0, 5: 0, 10: 0 };
  rows.forEach((r, i) => {
    const rank = index.search(vectors[i], 10).findIndex((t) => t.tool === r.tool);
    for (const k of [1, 5, 10] as const) if (rank >= 0 && rank < k) at[k]++;
  });
  return {
    'tool_retrieval.router.coverage': rows.length / all.length,
    'tool_retrieval.router.recall_at_1': at[1] / rows.length,
    'tool_retrieval.router.recall_at_5': at[5] / rows.length,
    'tool_retrieval.router.recall_at_10': at[10] / rows.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Set GOOGLE_CLOUD_PROJECT (Vertex, ADC)');
  if (!(getEmbeddingProvider() instanceof VertexAIEmbeddings))
    throw new Error('Embeddings are not Vertex: refusing to compare another backend');
  const runners: Record<string, () => Promise<Record<string, number>>> = {
    semantic_recall: semanticRecall,
    crisis_classifier: crisisClassifier,
    tool_retrieval: toolRetrieval,
  };
  const suites = selectSuites(process.env.EVAL_GATE_SUITES, Object.keys(runners));
  const parts = await Promise.all(suites.map((s) => runners[s]()));
  const current = Object.assign({}, ...parts) as Record<string, number>;
  if (args.includes('--json')) console.log(JSON.stringify(current, null, 2));
  process.exit(report(here('../../evals/baselines/model.json'), current, args, suites));
}
