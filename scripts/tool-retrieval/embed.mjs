// Embed the intent manual and the test sets, for evaluating dense retrieval.
//
// usage: node scripts/tool-retrieval/embed.mjs <vertex|local> [modelId]
//   vertex: Vertex AI text-embedding-005 (network, 768-d)
//   local:  a sentence-embedding model run in-process with @huggingface/transformers
//           (default Xenova/bge-small-en-v1.5, 384-d)
// Output: scripts/tool-retrieval/out/emb-<name>.bin (Float32, L2-normalised)
//         and emb-<name>.json (the texts, in order, with their kind and tool).
import { readFileSync, writeFileSync } from 'node:fs';

const provider = process.argv[2];
const OUT = 'scripts/tool-retrieval/out';
const manual = JSON.parse(readFileSync('src/tools/retrieval/intent-manual.generated.json', 'utf8'));
const split = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

const items = [];
for (const [tool, e] of Object.entries(manual.tools)) {
  for (const q of e.queries) items.push({ kind: 'q', tool, text: q });
  items.push({ kind: 'spec', tool, text: `${split(tool)}: ${e.description}` });
}
for (const [set, file] of [
  ['router', 'router-examples.json'],
  ['spoken', 'generated-test.json'],
  ['heldout', 'test-heldout.json'],
]) {
  for (const r of JSON.parse(readFileSync(`${OUT}/${file}`, 'utf8')))
    items.push({ kind: `test:${set}`, tool: r.tool, text: r.query });
}

let embedBatch;
let name;
let batchSize;
if (provider === 'vertex') {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    location: 'us-central1',
  });
  name = 'vertex';
  batchSize = 100;
  embedBatch = async (texts) => {
    const r = await ai.models.embedContent({
      model: 'text-embedding-005',
      contents: texts,
      config: { taskType: 'SEMANTIC_SIMILARITY' },
    });
    return r.embeddings.map((e) => e.values);
  };
} else {
  const modelId = process.argv[3] || 'Xenova/bge-small-en-v1.5';
  const { pipeline } = await import('@huggingface/transformers');
  const extract = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
  name = `local-${modelId.split('/').pop()}`;
  batchSize = 64;
  embedBatch = async (texts) =>
    (await extract(texts, { pooling: 'mean', normalize: true })).tolist();
}

const vectors = new Array(items.length);
const batches = [];
for (let i = 0; i < items.length; i += batchSize) batches.push(i);
let next = 0;
let done = 0;
async function worker() {
  while (next < batches.length) {
    const start = batches[next++];
    const texts = items.slice(start, start + batchSize).map((it) => it.text.slice(0, 1000));
    for (let attempt = 0; ; attempt++) {
      try {
        const vs = await embedBatch(texts);
        vs.forEach((v, j) => (vectors[start + j] = v));
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (++done % 50 === 0) console.error(`${done}/${batches.length}`);
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: provider === 'vertex' ? 8 : 1 }, worker));
const dim = vectors[0].length;
const flat = new Float32Array(items.length * dim);
vectors.forEach((v, i) => {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < dim; d++) flat[i * dim + d] = v[d] / norm;
});
writeFileSync(`${OUT}/emb-${name}.bin`, Buffer.from(flat.buffer));
writeFileSync(`${OUT}/emb-${name}.json`, JSON.stringify({ dim, items }));
console.log(
  JSON.stringify({ name, items: items.length, dim, seconds: Math.round((Date.now() - t0) / 1000) })
);
process.exit(0);
