#!/usr/bin/env node
// Two arms of generate.ts head to head on moments that need a real answer (TURN_LENGTH=adaptive,
// turn-substance.ts): which reply gives the caller the substance they needed, and which sounds
// more like a real close friend, both orders; and each reply alone, 1-5, on substance. Moments are
// fixtures/substantive-moments.json (written for this eval, no real calls) copied to
// <out>/moments.json.
//
//   node scripts/voice-eval/next-turn/judge-substance.mjs --out <dir> --a lt --b adaptive [--report]
//
// --report prints arm b against arm a, split by whether b's reminder asked for substance.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { estimate, intervalAt } from '../judge-stats.mjs';
import { runDir, words } from './corpus.mjs';
import { viewOf } from './judge.mjs';
import { geminiJson, pool } from './models.mjs';

const HEADER = `Two people who know each other well are talking on the phone. The lines are transcribed speech, all lowercase with no punctuation. "sam" and "jo" are stand-in names.`;

const pairPrompt = (context, [r1, r2]) => `${HEADER}

CONVERSATION SO FAR:
${context}

Two possible next turns for jo.
REPLY 1: ${r1}
REPLY 2: ${r2}

Answer JSON only:
{"substance": <1 or 2: which actually gives sam what sam needed here (a real answer, advice or explanation), rather than a reaction or a dodge>,
 "closeFriend": <1 or 2: which sounds more like a real close friend talking>,
 "why": "<one sentence>"}`;

const alonePrompt = (context, reply) => `${HEADER}

CONVERSATION SO FAR:
${context}

JO'S NEXT TURN: ${reply}

From 1 to 5: does jo actually give sam what sam needed here (a real answer, advice or explanation)? 1 = dodges or only reacts, 3 = a partial answer, 5 = a full, useful answer a good friend would give, said naturally.
Answer JSON only: {"substance": n}`;

const opt = { type: 'string' };
const flag = { type: 'boolean' };
const { values: a } = parseArgs({ options: { out: opt, a: opt, b: opt, report: flag } });
const dir = runDir(a.out);
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const [A, B] = [read(`ferni.${a.a}.json`), read(`ferni.${a.b}.json`)];
const moments = read('moments.json').filter((m) => A[m.id] && B[m.id]);
const file = join(dir, `substance.${a.a}-${a.b}.json`);
const verdicts = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const view = (m, arm) => viewOf({ ...m, human: '' }, arm[m.id].reply);

if (!a.report) {
  const jobs = moments.flatMap((m) => [
    { m, order: ['a', 'b'] },
    { m, order: ['b', 'a'] },
    { m, alone: 'a' },
    { m, alone: 'b' },
  ]);
  const todo = jobs.filter(({ m, order, alone }) => {
    const v = verdicts[m.id];
    return order ? !v?.pairs?.some((p) => p.order[0] === order[0]) : v?.alone?.[alone] == null;
  });
  console.log(`${todo.length} judge calls to make`);
  await pool(todo, 6, async ({ m, order, alone }) => {
    const arms = { a: A, b: B };
    const rec = (verdicts[m.id] ??= { pairs: [], alone: {} });
    const context = view(m, A).context;
    if (order) {
      const r = await geminiJson(
        pairPrompt(
          context,
          order.map((x) => view(m, arms[x]).ferni)
        )
      );
      const [substance, closeFriend] = [r.substance, r.closeFriend].map((x) => order[x - 1]);
      rec.pairs.push({ order, substance, closeFriend, why: r.why });
    } else {
      const r = await geminiJson(alonePrompt(context, view(m, arms[alone]).ferni));
      rec.alone[alone] = Number(r.substance) || null;
    }
    writeFileSync(file, JSON.stringify(verdicts, null, 1));
  });
} else {
  const pct = (x) => Math.round(100 * x);
  const ci = (rows) => {
    const est = estimate(
      rows.map((r) => r.v),
      rows.map((r) => r.id),
      { seed: 7 }
    );
    const [lo, hi] = intervalAt(est, 0.05);
    return { m: est.mean, lo, hi, n: rows.length };
  };
  const lifted = (m) => B[m.id].extras?.some((e) => e.startsWith('substance_'));
  for (const [name, ms] of [
    ['asked for substance', moments.filter(lifted)],
    ['not asked (same rules)', moments.filter((m) => !lifted(m))],
    ['all', moments],
  ]) {
    if (!ms.length) continue;
    console.log(`\n== ${name}: ${ms.length} moments, arm ${a.b} vs ${a.a}`);
    for (const axis of ['substance', 'closeFriend']) {
      const rows = ms.flatMap((m) =>
        (verdicts[m.id]?.pairs ?? []).map((p) => ({ id: m.id, v: p[axis] === 'b' ? 1 : 0 }))
      );
      const r = ci(rows);
      console.log(`${axis.padEnd(12)} ${a.b} preferred ${pct(r.m)}% [${pct(r.lo)}, ${pct(r.hi)}] (50% = no difference)`); // prettier-ignore
    }
    const alone = (x) => ms.map((m) => ({ id: m.id, v: verdicts[m.id]?.alone?.[x] })).filter((r) => r.v); // prettier-ignore
    const diff = ms
      .filter((m) => verdicts[m.id]?.alone?.a && verdicts[m.id]?.alone?.b)
      .map((m) => ({ id: m.id, v: verdicts[m.id].alone.b - verdicts[m.id].alone.a }));
    const [ra, rb, rd] = [ci(alone('a')), ci(alone('b')), ci(diff)];
    const median = (arm) => ms.map((m) => words(arm[m.id].reply)).sort((x, y) => x - y)[ms.length >> 1]; // prettier-ignore
    console.log(
      `substance 1-5: ${a.a} ${ra.m.toFixed(2)}, ${a.b} ${rb.m.toFixed(2)}, diff ${rd.m.toFixed(2)} [${rd.lo?.toFixed(2)}, ${rd.hi?.toFixed(2)}] | median words ${median(A)} -> ${median(B)}`
    );
  }
}
