#!/usr/bin/env tsx
/**
 * Haystack bench: does the per-turn cosine floor (TURN_MEMORY_RRF_SCALE) hold
 * up when a caller has hundreds of memories, not the 12-18 it was set on?
 * Pads each labelled caller (recall-cases.json) to 15, 100, 300 and 1,000
 * memories with seeded near-miss and everyday distractors
 * (fixtures/haystack-cases.json, haystack-lib.ts), embeds everything with the
 * production embedding model, then runs the real retrieval path over it in
 * __tests__/haystack-bench.test.ts, sweeping the floor 0.45-0.70 and the cap
 * (TURN_MEMORY_MAX_INJECT).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/haystack-bench.ts \
 *     --out <dir>/RESULTS.md
 *
 * Needs Google credentials (ADC). Every memory and turn is synthetic. Vectors
 * are cached by model and text (HAYSTACK_EMBED_CACHE, default in tmpdir), so a
 * rerun embeds only what changed.
 *
 * The TURN_MEMORY_RERANK rows need the judge model, which tests cannot reach
 * (src/tests/gcp-test-guard.ts). So a first vitest run records the judge
 * prompts the real path builds, this script asks the extraction model each one
 * and records the reply and its latency (HAYSTACK_JUDGE_CACHE, by model and
 * prompt), and the second run replays them after that latency.
 *
 * Then the RECALL_VECTOR_INDEX arm (__tests__/vector-index-haystack.test.ts):
 * each caller's dynamic_facts at 300 and 1,000, their own facts oldest or
 * newest, recall off and on the nearest-facts search. Its texts are embedded
 * as recall embeds them (embedForRetrieval, document or query), cached in the
 * same file under "<model>#<role>". `--only vector-index` runs just that arm.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getExtractionModel } from '../../src/config/gemini-config.js';
import { getGenerativeModel } from '../../src/config/generative-model.js';
import { getEmbeddingProvider } from '../../src/memory/vectors/embeddings.js';
import {
  embedForRetrieval,
  retrievalModel,
  type RetrievalRole,
} from '../../src/memory/vectors/retrieval-embeddings.js';
import {
  buildHaystack,
  haystackTurns,
  vectorIndexTexts,
  type FollowUps,
  type HaystackCases,
} from './haystack-lib.js';
import type { BenchCaller } from './recall-bench-lib.js';

const MAX_SIZE = 1000;

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')) as T;
}

async function main(): Promise<void> {
  const outArg = process.argv.indexOf('--out');
  const out = outArg > 0 ? process.argv[outArg + 1] : undefined;
  const { callers } = readJson<{ callers: BenchCaller[] }>('recall-cases.json');
  const cases = readJson<HaystackCases>('fixtures/haystack-cases.json');
  const only = process.argv.indexOf('--only') > 0 ? process.argv[process.argv.indexOf('--only') + 1] : undefined; // prettier-ignore
  if (only && only !== 'vector-index') throw new Error(`--only takes vector-index, not ${only}`);
  const provider = getEmbeddingProvider();
  // Local embeddings hash words; a floor measured on them means nothing.
  if (provider.constructor.name === 'LocalEmbeddings') throw new Error('no embedding credentials: set GOOGLE_CLOUD_PROJECT and ADC'); // prettier-ignore
  const cachePath = process.env.HAYSTACK_EMBED_CACHE ?? join(tmpdir(), 'haystack-embeddings.json');
  const cache: Record<string, Record<string, number[]>> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}; // prettier-ignore
  const tables: string[] = [];
  const notes: string[] = [];
  if (!only) {
    const r = await turnMemoryArms(callers, cases, provider, cache, cachePath);
    tables.push(r.tables);
    notes.push(...r.notes);
  }
  tables.push(await vectorIndexArm(callers, cases, cache, cachePath, notes));
  if (!out) return;
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const command = `GOOGLE_CLOUD_PROJECT=${process.env.GOOGLE_CLOUD_PROJECT ?? ''} pnpm tsx scripts/memory-eval/haystack-bench.ts --out ${out}${only ? ` --only ${only}` : ''}`; // prettier-ignore
  const header = `# Per-turn memory haystack bench\n\n- run: ${new Date().toISOString()} at ${sha}\n- command: \`${command}\`\n${notes.map((n) => `- ${n}\n`).join('')}- callers: ${callers.map((c) => c.name).join(', ')} (seed ${cases.seed}, near-miss share ${cases.nearShare}); turns per caller = labelled turns + 6 update turns + ${cases.backchannels.length} backchannels\n\n`; // prettier-ignore
  writeFileSync(out, header + tables.join('\n\n') + '\n');
  console.log(`wrote ${out}`);
}

const test = (name: string) => `scripts/memory-eval/__tests__/${name}`;
const vitest = (file: string, filter: string, env: Record<string, string>) =>
  execFileSync('pnpm', ['vitest', 'run', file, '--silent=false', '-t', filter], { stdio: 'inherit', env: { ...process.env, ...env } }); // prettier-ignore

/** The RECALL_VECTOR_INDEX arm: embed its texts by role, then run its bench describe. */
async function vectorIndexArm(
  callers: BenchCaller[],
  cases: HaystackCases,
  cache: Record<string, Record<string, number[]>>,
  cachePath: string,
  notes: string[]
): Promise<string> {
  const model = retrievalModel();
  const texts = vectorIndexTexts(callers, cases);
  const embedded: Record<string, Record<string, number[]>> = {};
  for (const role of ['document', 'query'] as RetrievalRole[]) {
    const vectors = (cache[`${model}#${role}`] ??= {});
    const missing = texts[role].filter((t) => !vectors[t]);
    console.log(`vector index: ${texts[role].length} ${role} texts, ${missing.length} to embed with ${model}`); // prettier-ignore
    for (let i = 0; i < missing.length; i += 250) {
      const batch = missing.slice(i, i + 250);
      const vs = await embedForRetrieval(batch, role);
      batch.forEach((t, j) => (vectors[t] = vs[j] ?? []));
    }
    writeFileSync(cachePath, JSON.stringify(cache));
    embedded[role] = Object.fromEntries(texts[role].map((t) => [t, vectors[t] ?? []]));
  }
  const vectorsFile = join(tmpdir(), `haystack-vector-index-${process.pid}.json`);
  writeFileSync(vectorsFile, JSON.stringify({ model, ...embedded }));
  const tableFile = join(tmpdir(), `haystack-vector-index-${process.pid}.md`);
  vitest(test('vector-index-haystack.test.ts'), 'haystack bench: vector index', { HAYSTACK_VECTOR_INDEX_VECTORS: vectorsFile, HAYSTACK_VECTOR_INDEX_OUT: tableFile }); // prettier-ignore
  notes.push(`vector index arm: ${model} via embedForRetrieval, ${texts.document.length} document + ${texts.query.length} query texts`); // prettier-ignore
  return readFileSync(tableFile, 'utf8');
}

/** The floor, cap and TURN_MEMORY_RERANK arms over the conversation-memory store. */
async function turnMemoryArms(
  callers: BenchCaller[],
  cases: HaystackCases,
  provider: ReturnType<typeof getEmbeddingProvider>,
  cache: Record<string, Record<string, number[]>>,
  cachePath: string
): Promise<{ tables: string; notes: string[] }> {
  const texts = new Set<string>();
  for (const caller of callers) {
    for (const m of buildHaystack(caller, cases, MAX_SIZE)) texts.add(m.text);
    for (const t of haystackTurns(caller, cases)) texts.add(t.text);
  }
  const followUps = readJson<FollowUps>('fixtures/haystack-followups.json');
  for (const pairs of Object.values(followUps.callers))
    for (const [, next] of pairs) texts.add(next);

  const model = (provider as { model?: string }).model ?? provider.constructor.name;
  const vectors = (cache[model] ??= {});
  const missing = [...texts].filter((t) => !vectors[t]);
  console.log(`${texts.size} texts, ${missing.length} to embed with ${model}`);
  for (let i = 0; i < missing.length; i += 250) {
    const batch = missing.slice(i, i + 250);
    const embedded = await provider.embedBatch(batch);
    batch.forEach((t, j) => (vectors[t] = embedded[j] ?? []));
  }
  writeFileSync(cachePath, JSON.stringify(cache));

  const vectorsFile = join(tmpdir(), `haystack-bench-${process.pid}.json`);
  writeFileSync(vectorsFile, JSON.stringify({ model, vectors: Object.fromEntries([...texts].map((t) => [t, vectors[t]])) })); // prettier-ignore
  const tablesFile = join(tmpdir(), `haystack-bench-${process.pid}.md`);
  const judgeModel = getExtractionModel();
  const judgeCachePath = process.env.HAYSTACK_JUDGE_CACHE ?? join(tmpdir(), 'haystack-judge.json');
  const judgeCache: Record<string, Record<string, { text: string; ms: number }>> = existsSync(judgeCachePath) ? JSON.parse(readFileSync(judgeCachePath, 'utf8')) : {}; // prettier-ignore
  const replies = (judgeCache[judgeModel] ??= {});
  const repliesFile = join(tmpdir(), `haystack-judge-${process.pid}.json`);
  const run = (env: Record<string, string>) =>
    vitest(test('haystack-bench.test.ts'), 'haystack bench', { HAYSTACK_BENCH_VECTORS: vectorsFile, HAYSTACK_JUDGE_REPLIES: repliesFile, ...env }); // prettier-ignore
  writeFileSync(repliesFile, JSON.stringify(replies));
  const promptsFile = join(tmpdir(), `haystack-judge-prompts-${process.pid}.json`);
  run({ HAYSTACK_JUDGE_PROMPTS_OUT: promptsFile });
  const prompts = JSON.parse(readFileSync(promptsFile, 'utf8')) as string[];
  console.log(`${prompts.length} judge prompts to ask ${judgeModel}`);
  const judgeClient = await getGenerativeModel({ model: judgeModel, generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json' } }); // prettier-ignore
  if (!judgeClient && prompts.length)
    throw new Error('no Gemini client: set GOOGLE_CLOUD_PROJECT and ADC');
  let next = 0;
  const ask = async () => {
    for (let i = next++; i < prompts.length; i = next++) {
      const prompt = prompts[i] as string;
      const started = performance.now();
      const text = (await judgeClient?.generateContent(prompt))?.response.text() ?? '';
      replies[prompt] = { text, ms: Math.round(performance.now() - started) };
    }
  };
  await Promise.all(Array.from({ length: 6 }, ask)); // the latency recorded is one call's wall time
  writeFileSync(judgeCachePath, JSON.stringify(judgeCache));
  writeFileSync(repliesFile, JSON.stringify(replies));
  run({ HAYSTACK_RESULTS_OUT: tablesFile });
  const notes = [
    `embeddings: ${model}, ${texts.size} texts`,
    `judge (TURN_MEMORY_RERANK): ${judgeModel}, ${Object.keys(replies).length} replies, latency recorded from this machine with 6 calls in flight`, // prettier-ignore
  ];
  return { tables: readFileSync(tablesFile, 'utf8'), notes };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
