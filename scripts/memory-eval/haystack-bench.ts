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
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getExtractionModel } from '../../src/config/gemini-config.js';
import { getGenerativeModel } from '../../src/config/generative-model.js';
import { getEmbeddingProvider } from '../../src/memory/vectors/embeddings.js';
import { buildHaystack, haystackTurns, type HaystackCases } from './haystack-lib.js';
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
  const texts = new Set<string>();
  for (const caller of callers) {
    for (const m of buildHaystack(caller, cases, MAX_SIZE)) texts.add(m.text);
    for (const t of haystackTurns(caller, cases)) texts.add(t.text);
  }

  const provider = getEmbeddingProvider();
  const model = (provider as { model?: string }).model ?? provider.constructor.name;
  // Local embeddings hash words; a floor measured on them means nothing.
  if (provider.constructor.name === 'LocalEmbeddings') throw new Error('no embedding credentials: set GOOGLE_CLOUD_PROJECT and ADC'); // prettier-ignore
  const cachePath = process.env.HAYSTACK_EMBED_CACHE ?? join(tmpdir(), 'haystack-embeddings.json');
  const cache: Record<string, Record<string, number[]>> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}; // prettier-ignore
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
  const test = 'scripts/memory-eval/__tests__/haystack-bench.test.ts';
  const judgeModel = getExtractionModel();
  const judgeCachePath = process.env.HAYSTACK_JUDGE_CACHE ?? join(tmpdir(), 'haystack-judge.json');
  const judgeCache: Record<string, Record<string, { text: string; ms: number }>> = existsSync(judgeCachePath) ? JSON.parse(readFileSync(judgeCachePath, 'utf8')) : {}; // prettier-ignore
  const replies = (judgeCache[judgeModel] ??= {});
  const repliesFile = join(tmpdir(), `haystack-judge-${process.pid}.json`);
  const vitest = (env: Record<string, string>) =>
    execFileSync('pnpm', ['vitest', 'run', test, '--silent=false', '-t', 'haystack bench'], {
      stdio: 'inherit',
      env: { ...process.env, HAYSTACK_BENCH_VECTORS: vectorsFile, HAYSTACK_JUDGE_REPLIES: repliesFile, ...env }, // prettier-ignore
    });
  writeFileSync(repliesFile, JSON.stringify(replies));
  const promptsFile = join(tmpdir(), `haystack-judge-prompts-${process.pid}.json`);
  vitest({ HAYSTACK_JUDGE_PROMPTS_OUT: promptsFile });
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
  vitest({ HAYSTACK_RESULTS_OUT: tablesFile });
  if (!out) return;
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const command = `GOOGLE_CLOUD_PROJECT=${process.env.GOOGLE_CLOUD_PROJECT ?? ''} pnpm tsx scripts/memory-eval/haystack-bench.ts --out ${out}`; // prettier-ignore
  const header = `# Per-turn memory haystack bench\n\n- run: ${new Date().toISOString()} at ${sha}\n- command: \`${command}\`\n- embeddings: ${model}, ${texts.size} texts (seed ${cases.seed}, near-miss share ${cases.nearShare})\n- judge (TURN_MEMORY_RERANK): ${judgeModel}, ${Object.keys(replies).length} replies, latency recorded from this machine with 6 calls in flight\n- callers: ${callers.map((c) => c.name).join(', ')}; turns per caller = labelled turns + 6 update turns + ${cases.backchannels.length} backchannels\n\n`; // prettier-ignore
  writeFileSync(out, header + readFileSync(tablesFile, 'utf8'));
  console.log(`wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
