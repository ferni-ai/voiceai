/**
 * How long a caller waits on searchWeb with WEB_SEARCH=on: real Vertex
 * grounding requests, end to end through runWebSearch (caps on the in-memory
 * store, source names resolved). Each query is billed as one or more Grounding
 * Queries ($14 per 1,000 past the monthly free 5,000).
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm tsx scripts/web-search/latency.ts [query...]
 */
import { runWebSearch } from '../../src/tools/domains/information/web-search.js';

const DEFAULT_QUERIES = [
  'latest news on the Artemis moon program',
  'how did the Philadelphia Eagles do in their last game',
  'price of bitcoin today',
  'who won the most recent World Series',
  'hours for the main public library in St. Petersburg Florida',
];

async function main(): Promise<void> {
  process.env.WEB_SEARCH = 'on';
  const queries = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_QUERIES;
  const times: number[] = [];
  for (const [i, query] of queries.entries()) {
    const start = performance.now();
    const out = await runWebSearch(query, `user:latency-script-${Date.now()}-${i}`);
    const ms = Math.round(performance.now() - start);
    times.push(ms);
    const data = out.split('\n').find((l) => l.startsWith('web_data: '));
    process.stdout.write(`${ms} ms  ${query}\n  ${data ?? out}\n`);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) / 2)];
  process.stdout.write(
    `\nn=${times.length} p50=${p50} ms max=${sorted[sorted.length - 1]} ms min=${sorted[0]} ms\n`
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  }
);
