/**
 * For strict misses (the labelled tool is not in the top k), ask Gemini whether
 * a retrieved tool does the user's job as well as the labelled one. Many tools
 * are near-duplicates (setReminder / scheduleReminder), so strict recall
 * under-counts sets that would work.
 *
 * usage: npx tsx scripts/tool-retrieval/judge-misses.ts <embedding-name> <set> <k> [limit]
 */
import { readFileSync } from 'node:fs';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { IntentManual } from '../../src/tools/retrieval/tool-retriever.js';

const [name, set, kArg, limitArg] = process.argv.slice(2);
const k = Number(kArg);
const OUT = 'scripts/tool-retrieval/out';
const meta = JSON.parse(readFileSync(`${OUT}/emb-${name}.json`, 'utf8')) as {
  dim: number;
  items: Array<{ kind: string; tool: string; text: string }>;
};
const buf = readFileSync(`${OUT}/emb-${name}.bin`);
const vecs = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const manual = JSON.parse(
  readFileSync('src/tools/retrieval/intent-manual.generated.json', 'utf8')
) as IntentManual;
const desc = new Map(
  (
    JSON.parse(readFileSync(`${OUT}/tools.json`, 'utf8')) as Array<{
      name: string;
      description: string;
    }>
  ).map((t) => [t.name, t.description.slice(0, 220)])
);
const { dim, items } = meta;
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const indexed = new Set(Object.values(manual.tools).flatMap((e) => e.queries.map(norm)));
const docs = items
  .map((it, i) => ({ ...it, i }))
  .filter((it) => it.kind === 'q' || it.kind === 'spec');

function top(qi: number): string[] {
  const per = new Map<string, { q: number[]; spec: number }>();
  for (const d of docs) {
    let s = 0;
    for (let j = 0; j < dim; j++) s += vecs[qi * dim + j] * vecs[d.i * dim + j];
    let e = per.get(d.tool);
    if (!e) per.set(d.tool, (e = { q: [], spec: 0 }));
    if (d.kind === 'spec') e.spec = s;
    else e.q.push(s);
  }
  return [...per.entries()]
    .map(([t, e]) => {
      const best = e.q.sort((a, b) => b - a).slice(0, 3);
      return [
        t,
        best.reduce((a, b) => a + b, 0) / Math.max(1, best.length) + 0.3 * e.spec,
      ] as const;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([t]) => t);
}

const rows = items
  .map((it, i) => ({ ...it, i }))
  .filter(
    (it) => it.kind === `test:${set}` && manual.tools[it.tool] && !indexed.has(norm(it.text))
  );
const misses = rows
  .map((r) => ({ r, got: top(r.i) }))
  .filter(({ r, got }) => !got.includes(r.tool));
const sample = misses.slice(0, Number(limitArg ?? misses.length));
const ai = new GoogleGenAI({ vertexai: true, project: 'johnb-2025', location: 'global' });

async function judge(query: string, gold: string, got: string[]): Promise<boolean> {
  const prompt = `A user said to a voice assistant: "${query}"
The intended tool was ${gold}: ${desc.get(gold)}
Available tools:
${got.map((t) => `- ${t}: ${desc.get(t)}`).join('\n')}
Would one of the available tools serve this user's request about as well as the intended tool? Be strict: a loosely related tool does not count. Answer JSON {"verdict":"yes"|"no","tool":"<name or none>"}`;
  const r = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return (JSON.parse(r.text ?? '{}') as { verdict?: string }).verdict === 'yes';
}

let yes = 0;
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < sample.length) {
      const { r, got } = sample[next++];
      try {
        if (await judge(r.text, r.tool, got)) yes++;
      } catch {
        /* counted as no */
      }
    }
  })
);
const strict = (rows.length - misses.length) / rows.length;
const rescuedRate = yes / sample.length;
const sufficient = strict + (misses.length / rows.length) * rescuedRate;
console.log(
  JSON.stringify({
    emb: name,
    set,
    k,
    n: rows.length,
    strictRecall: +strict.toFixed(3),
    missesJudged: sample.length,
    judgedEquivalent: +rescuedRate.toFixed(3),
    sufficientRecall: +sufficient.toFixed(3),
  })
);
process.exit(0);
