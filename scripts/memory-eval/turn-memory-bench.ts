#!/usr/bin/env tsx
/**
 * Per-turn memory bench: which memories retrieveForTurn() hands the prompt,
 * with TURN_MEMORY_RRF_SCALE off and on, against hand-labelled turns
 * (recall-cases.json). Embeds the memories and turns with the production
 * model the way the vector leg does (embed(), no task type), then runs the
 * real retrieval path over them in __tests__/turn-memory-bench.test.ts.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/memory-eval/turn-memory-bench.ts
 *
 * Needs Google credentials (ADC). Prints labelled turns' scores only, never
 * anything from a real caller.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEmbeddingProvider } from '../../src/memory/vectors/embeddings.js';
import type { BenchCaller } from './recall-bench-lib.js';

async function main(): Promise<void> {
  const file = new URL('./recall-cases.json', import.meta.url);
  const { callers } = JSON.parse(readFileSync(file, 'utf8')) as { callers: BenchCaller[] };
  const provider = getEmbeddingProvider();
  const vectors: Record<string, { items: number[][]; turns: number[][] }> = {};
  for (const c of callers) {
    vectors[c.name] = {
      items: await provider.embedBatch(c.items.map(([, text]) => text)),
      turns: await provider.embedBatch(c.turns.map(([text]) => text)),
    };
  }
  const out = join(tmpdir(), `turn-memory-bench-${process.pid}.json`);
  writeFileSync(out, JSON.stringify({ model: provider.constructor.name, vectors }));
  const test = 'scripts/memory-eval/__tests__/turn-memory-bench.test.ts';
  execFileSync('pnpm', ['vitest', 'run', test, '--silent=false'], {
    stdio: 'inherit',
    env: { ...process.env, TURN_MEMORY_BENCH_VECTORS: out },
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
