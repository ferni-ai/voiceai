#!/usr/bin/env node
// Compare arms of next-turn-vs-human: each arm's close-friend win rate against the real friend
// (the seeded first-order pick, averaged over an arm's samples per moment), with a 95% CI that
// resamples whole conversations, and every arm's paired difference against each earlier one on the
// same moments. Main, held-out and both together; AI-tell rate and median words alongside.
//
//   node scripts/voice-eval/next-turn/compare-arms.mjs [--judge gemini] [--out <dir>] \
//     --arms 'prod=base,rep lt=lt,lt2,lt3'
//
// Each arm name maps to the runs (generate.ts --arm) whose verdicts it pools.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { estimate, intervalAt } from '../judge-stats.mjs';
import { runDir, words } from './corpus.mjs';
import { firstOrder, viewOf } from './judge.mjs';

const opt = { type: 'string' };
const { values: a } = parseArgs({ options: { judge: opt, out: opt, arms: opt } });
const judge = a.judge ?? 'gemini';
const read = (f) =>
  existsSync(join(runDir(a.out), f))
    ? JSON.parse(readFileSync(join(runDir(a.out), f), 'utf8'))
    : null;
const sfx = (run) => (run === 'base' ? '' : `.${run}`);
const arms = Object.fromEntries(
  (a.arms ?? 'prod=base')
    .split(/\s+/)
    .map((s) => s.split('='))
    .map(([k, v]) => [k, v.split(',')])
);
const runs = [...new Set(Object.values(arms).flat())];
const V = Object.fromEntries(runs.map((r) => [r, read(`judge.${judge}${sfx(r)}.json`)]));
const F = Object.fromEntries(runs.map((r) => [r, read(`ferni${sfx(r)}.json`)]));
const moments = read('moments.json');

const pick = (r, m) => V[r]?.[m.id]?.pairs?.find((p) => p.order[0] === firstOrder(m.id)[0]);
/** An arm's score on a moment: the share of its samples the judge gave to Ferni. */
const score = (arm, m) => {
  const ps = arms[arm].map((r) => pick(r, m)).filter((p) => p?.closeFriend);
  return ps.length ? ps.filter((p) => p.closeFriend === 'ferni').length / ps.length : null;
};
const ci = (rows, seed) => {
  const est = estimate(
    rows.map((r) => r.s),
    rows.map((r) => r.f),
    { seed }
  );
  const [lo, hi] = intervalAt(est, 0.05);
  return {
    m: rows.reduce((s, r) => s + r.s, 0) / rows.length,
    lo: Math.max(-1, lo),
    hi: Math.min(1, hi),
    n: rows.length,
  };
};
const pct = (x) => Math.round(100 * x);
const names = Object.keys(arms);
for (const split of ['main', 'holdout', 'all']) {
  const ms = moments.filter((m) => split === 'all' || m.split === split);
  console.log(`\n== ${judge}, ${split}: close-friend win rate against the real friend`);
  for (const [i, arm] of names.entries()) {
    const own = ms.filter((m) => score(arm, m) !== null);
    if (!own.length) continue;
    const r = ci(
      own.map((m) => ({ s: score(arm, m), f: m.file })),
      1
    );
    const samples = own.flatMap((m) => arms[arm].map((run) => pick(run, m)).filter(Boolean));
    const tell = samples.filter((p) => p.tell?.ferni).length / samples.length;
    const lens = own.flatMap((m) =>
      arms[arm]
        .filter((run) => F[run]?.[m.id])
        .map((run) => words(viewOf(m, F[run][m.id].reply).ferni))
    );
    const median = lens.sort((x, y) => x - y)[lens.length >> 1];
    const diffs = names.slice(0, i).map((ref) => {
      const both = own.filter((m) => score(ref, m) !== null);
      const d = ci(
        both.map((m) => ({ s: score(arm, m) - score(ref, m), f: m.file })),
        9
      );
      return `vs ${ref} ${pct(d.m) >= 0 ? '+' : ''}${pct(d.m)} [${pct(d.lo)}, ${pct(d.hi)}]`;
    });
    console.log(
      `${arm.padEnd(8)} ${pct(r.m)}% [${pct(r.lo)}, ${pct(r.hi)}] n=${r.n} x${arms[arm].length} | AI tell ${pct(tell)}% | median words ${median}  ${diffs.join('  ')}`
    );
  }
}
