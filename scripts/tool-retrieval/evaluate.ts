/**
 * Measure tool retrieval against held-out requests.
 *
 * usage: npx tsx scripts/tool-retrieval/evaluate.ts [--set name] [--opt key=value ...]
 * Test sets (scripts/tool-retrieval/out/):
 *   heldout   other requests from the router training data (same source as the index)
 *   router    hand-written semantic-router examples (never indexed)
 *   spoken    requests written by a different model and prompt (never indexed)
 *   notool    conversational lines that need no tool (false-alarm check)
 */
import { readFileSync } from 'node:fs';
import {
  ToolRetriever,
  type IntentManual,
  type RetrieverOptions,
} from '../../src/tools/retrieval/tool-retriever.js';

const OUT = 'scripts/tool-retrieval/out';
const KS = [1, 3, 5, 10, 15, 20, 30];
const manual = JSON.parse(
  readFileSync('src/tools/retrieval/intent-manual.generated.json', 'utf8')
) as IntentManual;
const catalogue = JSON.parse(readFileSync(`${OUT}/tools.json`, 'utf8')) as Array<{
  name: string;
  tokens: number;
  domain: string;
}>;
const tokensOf = new Map(catalogue.map((t) => [t.name, t.tokens]));
const domainOf = new Map(catalogue.map((t) => [t.name, t.domain]));

const opts: Partial<RetrieverOptions> = {};
process.argv.forEach((a, i) => {
  if (process.argv[i - 1] === '--opt') {
    const [k, v] = a.split('=');
    (opts as Record<string, number>)[k] = Number(v);
  }
});
const retriever = new ToolRetriever(manual, opts);
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const indexed = new Set(Object.values(manual.tools).flatMap((e) => e.queries.map(norm)));

function load(name: string): Array<{ query: string; tool: string }> {
  const file = {
    heldout: 'test-heldout.json',
    router: 'router-examples.json',
    spoken: 'generated-test.json',
  }[name]!;
  const rows = JSON.parse(readFileSync(`${OUT}/${file}`, 'utf8')) as Array<{
    query: string;
    tool: string;
  }>;
  // Never score a request that is itself in the index.
  return rows.filter((r) => manual.tools[r.tool] && !indexed.has(norm(r.query)));
}

function evaluate(name: string): void {
  const rows = load(name);
  const hit = Object.fromEntries(KS.map((k) => [k, 0]));
  const domainHit10 = { n: 0 };
  let rr = 0;
  const t0 = performance.now();
  for (const { query, tool } of rows) {
    const got = retriever.retrieve(query, 30).map((r) => r.tool);
    const rank = got.indexOf(tool);
    for (const k of KS) if (rank >= 0 && rank < k) hit[k]++;
    if (rank >= 0) rr += 1 / (rank + 1);
    if (got.slice(0, 10).some((t) => domainOf.get(t) === domainOf.get(tool))) domainHit10.n++;
  }
  const ms = (performance.now() - t0) / rows.length;
  const recall = Object.fromEntries(KS.map((k) => [`@${k}`, +(hit[k] / rows.length).toFixed(3)]));
  console.log(
    JSON.stringify({
      set: name,
      n: rows.length,
      recall,
      mrr: +(rr / rows.length).toFixed(3),
      domainRecall10: +(domainHit10.n / rows.length).toFixed(3),
      msPerQuery: +ms.toFixed(2),
    })
  );
}

function tokensAtK(): void {
  // Mean definition tokens of the tools retrieved at each k, over the spoken set.
  const rows = load('spoken').slice(0, 500);
  const out: Record<string, number> = {};
  for (const k of [5, 10, 15, 20, 30]) {
    let sum = 0;
    for (const { query } of rows)
      sum += retriever.retrieve(query, k).reduce((a, r) => a + (tokensOf.get(r.tool) ?? 0), 0);
    out[`@${k}`] = Math.round(sum / rows.length);
  }
  console.log(JSON.stringify({ toolTokensAtK: out }));
}

function noTool(): void {
  const lines = new Set<string>();
  for (const l of readFileSync('apps/ml-training/router/data/train_v6.jsonl', 'utf8').split('\n')) {
    if (!l) continue;
    const r = JSON.parse(l) as { query: string; selected_tools: string[] };
    if (r.selected_tools.length === 0) lines.add(r.query);
  }
  const sample = [...lines]
    .sort()
    .filter((_, i) => i % 13 === 0)
    .slice(0, 2000);
  const top = sample.map((q) => retriever.retrieve(q, 1)[0]?.score ?? 0).sort((a, b) => a - b);
  const q = (p: number): number => +top[Math.floor(p * (top.length - 1))].toFixed(2);
  console.log(
    JSON.stringify({
      set: 'notool',
      n: sample.length,
      top1Score: { p50: q(0.5), p90: q(0.9), p99: q(0.99) },
      noMatch: top.filter((s) => s === 0).length,
    })
  );
}

const only = process.argv.includes('--set')
  ? process.argv[process.argv.indexOf('--set') + 1]
  : null;
console.log(JSON.stringify({ tools: retriever.toolCount, options: opts }));
for (const s of ['heldout', 'router', 'spoken']) if (!only || only === s) evaluate(s);
if (!only) {
  tokensAtK();
  noTool();
}
process.exit(0);
