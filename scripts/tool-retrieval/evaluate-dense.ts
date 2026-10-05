/**
 * Dense and hybrid (BM25 + dense, reciprocal-rank fusion) retrieval against
 * the same held-out sets as evaluate.ts.
 *
 * usage: npx tsx scripts/tool-retrieval/evaluate-dense.ts <embedding-name>
 *   (reads out/emb-<name>.bin/.json written by embed.mjs)
 */
import { readFileSync } from 'node:fs';
import { ToolRetriever, type IntentManual } from '../../src/tools/retrieval/tool-retriever.js';

const OUT = 'scripts/tool-retrieval/out';
const name = process.argv[2];
const meta = JSON.parse(readFileSync(`${OUT}/emb-${name}.json`, 'utf8')) as {
  dim: number;
  items: Array<{ kind: string; tool: string; text: string }>;
};
const buf = readFileSync(`${OUT}/emb-${name}.bin`);
const vecs = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const { dim, items } = meta;
const manual = JSON.parse(
  readFileSync('src/tools/retrieval/intent-manual.generated.json', 'utf8')
) as IntentManual;
const catalogue = JSON.parse(readFileSync(`${OUT}/tools.json`, 'utf8')) as Array<{
  name: string;
  domain: string;
}>;
const domainOf = new Map(catalogue.map((t) => [t.name, t.domain]));
const bm25 = new ToolRetriever(manual);
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const indexed = new Set(Object.values(manual.tools).flatMap((e) => e.queries.map(norm)));

const docIdx: number[] = [];
items.forEach((it, i) => {
  if (it.kind === 'q' || it.kind === 'spec') docIdx.push(i);
});

function denseRank(qi: number, topC = 3, specWeight = 0.3): string[] {
  const per = new Map<string, { q: number[]; spec: number }>();
  for (const di of docIdx) {
    let s = 0;
    const a = qi * dim;
    const b = di * dim;
    for (let d = 0; d < dim; d++) s += vecs[a + d] * vecs[b + d];
    const it = items[di];
    let e = per.get(it.tool);
    if (!e) per.set(it.tool, (e = { q: [], spec: 0 }));
    if (it.kind === 'spec') e.spec = s;
    else e.q.push(s);
  }
  const scored: Array<[string, number]> = [];
  for (const [tool, e] of per) {
    e.q.sort((x, y) => y - x);
    const best = e.q.slice(0, topC);
    const qs = best.length ? best.reduce((x, y) => x + y, 0) / best.length : 0;
    scored.push([tool, qs + specWeight * e.spec]);
  }
  scored.sort((x, y) => y[1] - x[1]);
  return scored.slice(0, 60).map(([t]) => t);
}

function rrf(lists: string[][], k = 60): string[] {
  const s = new Map<string, number>();
  for (const l of lists) l.forEach((t, r) => s.set(t, (s.get(t) ?? 0) + 1 / (k + r + 1)));
  return [...s.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

const KS = [1, 5, 10, 20, 30];
for (const set of ['heldout', 'router', 'spoken']) {
  const rows = items
    .map((it, i) => ({ ...it, i }))
    .filter(
      (it) => it.kind === `test:${set}` && manual.tools[it.tool] && !indexed.has(norm(it.text))
    );
  const res: Record<string, { hit: Record<number, number>; dom: number }> = {};
  const t0 = performance.now();
  for (const r of rows) {
    const dense = denseRank(r.i);
    const lex = bm25.retrieve(r.text, 60).map((x) => x.tool);
    const lists: Record<string, string[]> = { dense, hybrid: rrf([dense, lex]) };
    for (const [m, got] of Object.entries(lists)) {
      const e = (res[m] ??= { hit: Object.fromEntries(KS.map((k) => [k, 0])), dom: 0 });
      const rank = got.indexOf(r.tool);
      for (const k of KS) if (rank >= 0 && rank < k) e.hit[k]++;
      if (got.slice(0, 10).some((t) => domainOf.get(t) === domainOf.get(r.tool))) e.dom++;
    }
  }
  const ms = (performance.now() - t0) / rows.length;
  for (const [m, e] of Object.entries(res)) {
    console.log(
      JSON.stringify({
        emb: name,
        set,
        method: m,
        n: rows.length,
        recall: Object.fromEntries(KS.map((k) => [`@${k}`, +(e.hit[k] / rows.length).toFixed(3)])),
        domainRecall10: +(e.dom / rows.length).toFixed(3),
        msPerQuery: +ms.toFixed(1),
      })
    );
  }
}
process.exit(0);
