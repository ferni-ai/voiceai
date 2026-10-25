/**
 * The remembered-fact secret gate (#2514 round 3) on the builder's synthetic
 * set, live: the word rules first (rememberedFactDoc), then the production
 * model read (readSecret, with the agent process's own Gemini call and
 * timeout). Vertex AI at GEMINI_LOCATION (global), ADC.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/memory-eval/secret-check-eval.ts
 *
 * A secret line leaks when the gate keeps it; a benign line is a false drop
 * when the gate drops it. A failed read (timeout, error, no answer) drops, as
 * in production. The model is also read on the lines the word rules caught, to
 * show what it does alone. SECRET_EVAL_REPS repeats the whole set.
 */

import { readFileSync } from 'node:fs';
import { CLASSIFICATION_MODEL } from '../../src/config/gemini-config.js';
import { rememberedFactDoc } from '../../src/memory/dynamic/remembered-facts.js';
import { readSecret, SECRET_CHECK_TIMEOUT_MS, type SecretRead } from '../../src/memory/secret-check.js'; // prettier-ignore
import { createGeminiCrisisGenerate } from '../../src/services/safety/crisis-classifier.js';

interface Case {
  shape: string;
  text: string;
}
const cases = JSON.parse(
  readFileSync('scripts/memory-eval/fixtures/secret-check-cases.json', 'utf8')
) as { secret: Case[]; benign: Case[] };
if (!process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const model = createGeminiCrisisGenerate(CLASSIFICATION_MODEL);
const REPS = Number(process.env.SECRET_EVAL_REPS) || 1;
const AT = new Date().toISOString();

interface Row {
  label: 'secret' | 'benign';
  shape: string;
  text: string;
  lexical: boolean;
  read: SecretRead;
  ms: number;
}

async function run(label: Row['label'], c: Case): Promise<Row> {
  const lexical = rememberedFactDoc({ fact: c.text }, AT) === null;
  const start = performance.now();
  const read = await readSecret(c.text, { model });
  return { label, ...c, lexical, read, ms: performance.now() - start };
}

const rows: Row[] = [];
for (let rep = 0; rep < REPS; rep++) {
  for (const [label, set] of [
    ['secret', cases.secret],
    ['benign', cases.benign],
  ] as const) {
    for (const c of set) rows.push(await run(label, c)); // one at a time: latency as one call sees it
  }
}

const kept = (r: Row) => !r.lexical && r.read === 'clear';
const pct = (n: number, d: number) => `${n}/${d} (${((100 * n) / d).toFixed(1)}%)`;
const secrets = rows.filter((r) => r.label === 'secret');
const benign = rows.filter((r) => r.label === 'benign');
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const q = (p: number) => Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0);

console.log(`model ${CLASSIFICATION_MODEL}, timeout ${SECRET_CHECK_TIMEOUT_MS} ms, reps ${REPS}`);
console.log(`gate leaks (secret kept):      ${pct(secrets.filter(kept).length, secrets.length)}`);
console.log(
  `gate false drops (benign):     ${pct(benign.filter((r) => !kept(r)).length, benign.length)}`
);
console.log(`word rules alone, leaks:       ${pct(secrets.filter((r) => !r.lexical).length, secrets.length)}`); // prettier-ignore
console.log(`word rules alone, false drops: ${pct(benign.filter((r) => r.lexical).length, benign.length)}`); // prettier-ignore
console.log(`model alone, leaks:            ${pct(secrets.filter((r) => r.read !== 'secret').length, secrets.length)}`); // prettier-ignore
console.log(`model alone, false drops:      ${pct(benign.filter((r) => r.read !== 'clear').length, benign.length)}`); // prettier-ignore
console.log(`failed reads (timeout/error):  ${pct(rows.filter((r) => r.read === 'failed').length, rows.length)}`); // prettier-ignore
console.log(`latency per check: p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${q(1)} ms`);
const missed = (x: Row) => (x.label === 'secret' ? kept(x) : !kept(x));
for (const r of rows.filter(
  (x) => missed(x) || x.read !== (x.label === 'secret' ? 'secret' : 'clear')
)) {
  const tag = missed(r) ? (r.label === 'secret' ? 'LEAK' : 'DROP') : 'model';
  console.log(`  ${tag} [${r.label}/${r.shape}] lexical=${r.lexical} read=${r.read} ${Math.round(r.ms)}ms: ${r.text}`); // prettier-ignore
}
process.exit(0);
