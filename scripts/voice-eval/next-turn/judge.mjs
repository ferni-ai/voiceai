#!/usr/bin/env node
// next-turn-vs-human, step 3: blind judging. The judge sees the conversation and both next turns
// (Ferni's, the real friend's) in a seeded order, every line normalised alike, and says which
// sounds like a real close friend, which better responds, and quotes any AI tell. It also rates
// each reply alone (1-5). Gemini judges each pair in both orders; qwen3 in the first order only.
//
//   node scripts/voice-eval/next-turn/judge.mjs --judge gemini|qwen [--pairs N] [--alone N] [--out <dir>]
//
// --pairs N: a type-stratified N main + N/2 held-out moments instead of all; --alone N: N main.
// Resumable: <out>/judge.<judge>.json is saved after every call.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { hashSeed } from '../judge-stats.mjs';
import { neutralise, normalise, runDir, stratified } from './corpus.mjs';
import { geminiJson, pool, qwenJson } from './models.mjs';

export const RUBRIC = ['warmth', 'specificity', 'listening', 'naturalness'];
const JUDGES = {
  gemini: { ask: geminiJson, orders: 2, parallel: Number(process.env.GEMINI_PARALLEL ?? 6) },
  qwen: { ask: qwenJson, orders: 1, parallel: Number(process.env.QWEN_PARALLEL ?? 1) },
};
const HEADER = `Two people who know each other well are talking. The lines are transcribed speech, all lowercase with no punctuation; that is how every line is shown, so it says nothing about who said it. "sam" and "jo" are stand-in names.`;

export const pairPrompt = (v, [a, b]) => `${HEADER}

CONVERSATION SO FAR:
${v.context}

Two possible next turns for jo. One may have been written by an AI.
REPLY 1: ${v[a]}
REPLY 2: ${v[b]}

Answer JSON only:
{"closeFriend": <1 or 2: which sounds more like jo is a real close friend of sam's>,
 "responds": <1 or 2: which better responds to what sam just said>,
 "aiTell": {"1": "<words in reply 1 that sound machine-written, or empty>", "2": "<same for reply 2>"},
 "why": "<one sentence>"}`;

export const alonePrompt = (v, arm) => `${HEADER}

CONVERSATION SO FAR:
${v.context}

JO'S NEXT TURN: ${v[arm]}

Rate jo's next turn from 1 to 5 on each, where 3 is what a typical close friend would say here, 5 is the best a close friend could do, 1 is clearly off:
warmth (care and liking come through), specificity (about this exact thing, not generic), listening (picks up what sam actually said or meant), naturalness (sounds like real spontaneous speech).
Answer JSON only: {"warmth": n, "specificity": n, "listening": n, "naturalness": n}`;

/** A moment as a judge sees it: normalised, the friend's seat called jo, the other speaker sam. */
export function viewOf(m, ferniReply) {
  const as = (t) =>
    normalise(neutralise(t, m.names, { friend: 'jo', caller: 'sam' }).replace(/\bferni\b/gi, 'jo'));
  const lines = [];
  for (const t of m.context.slice(-8)) {
    const who = t.who === 'friend' ? 'jo' : 'sam';
    if (lines.at(-1)?.who === who) lines.at(-1).text += ` ${as(t.text)}`;
    else lines.push({ who, text: as(t.text) });
  }
  return {
    context: lines.map((l) => `${l.who}: ${l.text}`).join('\n'),
    ferni: as(ferniReply),
    human: as(m.human),
  };
}

/** The first order a moment is shown in, seeded, so both judges see it the same way round. */
export const firstOrder = (id) => (hashSeed(id) % 2 ? ['ferni', 'human'] : ['human', 'ferni']);

async function main() {
  const opt = { type: 'string' };
  const { values: a } = parseArgs({ options: { judge: opt, pairs: opt, alone: opt, out: opt } });
  const judge = JUDGES[a.judge];
  if (!judge) throw new Error(`--judge must be one of ${Object.keys(JUDGES)}`);
  const read = (f) => JSON.parse(readFileSync(join(runDir(a.out), f), 'utf8'));
  const [ferni, file] = [read('ferni.json'), join(runDir(a.out), `judge.${a.judge}.json`)];
  const moments = read('moments.json').filter((m) => ferni[m.id]);
  const verdicts = existsSync(file) ? read(`judge.${a.judge}.json`) : {};
  const split = (s) => moments.filter((m) => m.split === s);
  const some = (s, n, seed) => (n ? stratified(split(s), n, { seed }) : split(s));
  const n = Number(a.pairs ?? 0);
  const forPairs = [...some('main', n, 3), ...some('holdout', Math.ceil(n / 2), 3)];
  const orders = (m) => [firstOrder(m.id), firstOrder(m.id).toReversed()].slice(0, judge.orders);
  const jobs = [
    ...forPairs.flatMap((m) => orders(m).map((order) => ({ m, order }))),
    ...some('main', Number(a.alone ?? 0), 4).flatMap((m) => [
      { m, arm: 'ferni' },
      { m, arm: 'human' },
    ]),
    ...(a.alone
      ? []
      : split('holdout').flatMap((m) => [
          { m, arm: 'ferni' },
          { m, arm: 'human' },
        ])),
  ].filter(({ m, order, arm }) => {
    const v = verdicts[m.id];
    return order ? !v?.pairs?.some((p) => p.order[0] === order[0]) : !v?.alone?.[arm];
  });
  console.log(`${a.judge}: ${jobs.length} calls to make`);
  await pool(jobs, judge.parallel, async ({ m, order, arm }) => {
    const v = viewOf(m, ferni[m.id].reply);
    const rec = (verdicts[m.id] ??= { pairs: [], alone: {} });
    const r = await judge.ask(order ? pairPrompt(v, order) : alonePrompt(v, arm));
    const tell =
      order && Object.fromEntries(order.map((x, i) => [x, `${r.aiTell?.[i + 1] ?? ''}`]));
    const [closeFriend, responds] = [r.closeFriend, r.responds].map((x) => order?.[x - 1] ?? null);
    if (order) rec.pairs.push({ order, closeFriend, responds, tell, why: r.why });
    else rec.alone[arm] = Object.fromEntries(RUBRIC.map((k) => [k, Number(r[k]) || null]));
    writeFileSync(file, JSON.stringify(verdicts, null, 1));
  });
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => (console.error(e), process.exit(1)));
