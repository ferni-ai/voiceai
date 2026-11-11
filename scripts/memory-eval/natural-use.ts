#!/usr/bin/env tsx
/**
 * Natural-use eval runner: rows through the live path (natural-use-path.ts) with
 * the cascade's model call (thinking MINIMAL, temperature 0.8); crisis gate live,
 * patterns only. No tools are replayed: rows must not ask for live data (weather).
 * Judge: gemini-2.5-flash on us-central1 (a US endpoint, never another region).
 *   GOOGLE_CLOUD_PROJECT=<p> pnpm tsx scripts/memory-eval/natural-use.ts [--rows f.json]
 *     [--sealed] [--samples 3] [--only id,...] [--set FLAG=value ...] [--out f.json]
 * --rows reads a file kept outside the repo; --sealed prints and writes counts only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    rows: { type: 'string' },
    sealed: { type: 'boolean', default: false },
    only: { type: 'string' },
    samples: { type: 'string', default: '3' },
    set: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
  },
});

// Before the memory code loads: its logs would put row text on the console.
const flags: Record<string, string> = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
for (const [k, v] of (values.set ?? []).map((kv) => kv.split('='))) if (k && v) flags[k] = v;
Object.assign(process.env, flags, { LOG_LEVEL: values.sealed ? 'error' : 'warn' });

const { initializeLogger } = await import('@livekit/agents');
initializeLogger({ pretty: false, level: 'warn' }); // the SDK's chat formatting logs
const { replyFor } = await import('./natural-use-path.js');
const { generate, tokensByModel } = await import('../first-call-eval/vertex.js');
const lib = await import('./natural-use-lib.js');
type Turn = { role: 'user' | 'model'; parts: Array<{ text: string }> };
type Extra = { systemMessages?: string[] };

const REPLY_MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const JUDGE = { model: 'gemini-2.5-flash', location: 'us-central1' };

/** gatedReply's model: the request as the LiveKit Google plugin sends it. */
async function model(request: { toProviderFormat(f: 'google'): Promise<unknown> }) {
  const [contents, extra] = (await request.toProviderFormat('google')) as [Turn[], Extra];
  const system = (extra.systemMessages ?? []).join('\n\n');
  const opts = { model: REPLY_MODEL, system, contents, temperature: 0.8 };
  let text = ''; // generate() returns '' once its 429 retries run out: try the turn again
  for (let i = 0; !text && i < 3; i++) text = await generate({ ...opts, thinkingLevel: 'MINIMAL' });
  return new ReadableStream({ start: (c) => (c.enqueue(text), c.close()) });
}

async function judge(row: import('./natural-use-lib.js').Row, reply: string, used: string[]) {
  const text = await generate({
    ...JUDGE,
    system: 'You are a strict, careful grader. Answer with JSON only.',
    contents: [{ role: 'user', parts: [{ text: lib.judgePrompt(row, reply, used) }] }],
    temperature: 0,
    maxOutputTokens: 2048,
    json: true,
  }).catch(() => '');
  return lib.parseJudge(text, used);
}

const started = Date.now();
const file = values.rows ?? new URL('./fixtures/natural-use-dev.json', import.meta.url);
const only = values.only?.split(',');
const all = lib.parseRows(JSON.parse(readFileSync(file, 'utf8')));
const rows = all.filter((r) => only?.includes(r.id) ?? true);
const samples = Number(values.samples);
const queue = rows.flatMap((row) => Array<typeof row>(samples).fill(row));
const results: import('./natural-use-lib.js').RowResult[] = [];
async function worker() {
  for (let row = queue.shift(); row; row = queue.shift()) {
    const reply = await replyFor(row, model as never);
    const used = lib.matchedIds(reply, row);
    const judged = used.length ? await judge(row, reply, used) : null;
    results.push({ id: row.id, reply, used, judged });
    process.stderr.write('.');
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const score = lib.scoreRun(rows, results);
const cost = Object.values(tokensByModel).reduce((s, t) => s + t.in * 0.5 + t.out * 3, 0) / 1e6; // $/Mtok, approx
const run = { rows: rows.length, samples, seconds: Math.round((Date.now() - started) / 1000) };
console.log(lib.formatCounts(score));
console.log(
  `${run.rows} rows x ${samples}, ${run.seconds}s, ~$${cost.toFixed(2)} ${JSON.stringify(tokensByModel)}`
);
if (!values.sealed) for (const id of score.leaks.ids) console.log(`LEAK ${id}`);
const body = values.sealed
  ? { run, score: { ...score, leaks: { ...score.leaks, ids: [] } } }
  : { run: { ...run, models: { reply: REPLY_MODEL, judge: JUDGE }, flags }, score, results };
if (values.out) writeFileSync(values.out, JSON.stringify(body, null, 2));
process.exit(score.pass ? 0 : 1);
