#!/usr/bin/env node
// next-turn-vs-human, step 4. Ferni's win rate against the real friend per judge and split (a pair
// scores 1 or 0, 0.5 when Gemini's two orders disagree) with a 95% CI resampling whole
// conversations and an exact sign test; AI tells; alone ratings; Cohen's kappa between judges;
// close-friend wins by type and by length. "Better than human" needs BOTH judges' close-friend CI
// above 50% on the main sample AND the held-out one.
//
//   node scripts/voice-eval/next-turn/report.mjs [--out <dir>]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { estimate, intervalAt } from '../judge-stats.mjs';
import { TYPES, runDir, words } from './corpus.mjs';
import { RUBRIC, firstOrder, viewOf } from './judge.mjs';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (typeof x === 'number' ? `${Math.round(100 * x)}%` : '-');
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : '-');
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
const say = (s) => console.log(s);

/** Exact two-sided binomial sign test at p = 0.5. */
export function signTest(wins, losses) {
  const [n, k] = [wins + losses, Math.min(wins, losses)];
  let [tail, c] = [0, 1];
  for (let i = 0; i <= k; c = (c * (n - i)) / (i + 1), i++) tail += c / 2 ** n;
  return Math.min(1, 2 * tail);
}

/** Cohen's kappa for two raters labelling the same items. */
export function kappa(a, b) {
  const share = (xs, l) => xs.filter((x) => x === l).length / xs.length;
  const po = mean(a.map((x, i) => +(x === b[i])));
  const pe = [...new Set([...a, ...b])].reduce((s, l) => s + share(a, l) * share(b, l), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Mean of {score, file} rows with a 95% CI that resamples whole conversations. */
export function ci(rows, seed = 1) {
  const est = estimate(
    rows.map((r) => r.score),
    rows.map((r) => r.file),
    { seed }
  );
  const [lo, hi] = intervalAt(est, 0.05);
  // The pooled mean: under 10 conversations `estimate` centres on conversation means.
  return { n: rows.length, rate: mean(rows.map((r) => r.score)), lo, hi };
}

/** Win rate (scores 0, 0.5, 1) with its CI and the sign test; ties are dropped from the test. */
export function winRate(rows, seed = 1) {
  if (!rows.length) return { n: 0 };
  const [wins, losses] = [rows.filter((r) => r.score > 0.5), rows.filter((r) => r.score < 0.5)];
  const [w, l] = [wins.length, losses.length];
  const { n, rate, lo, hi } = ci(rows, seed);
  const clamp = (x) => (x === null ? null : Math.min(1, Math.max(0, x))); // small-n t intervals overshoot
  return {
    n,
    rate,
    lo: clamp(lo),
    hi: clamp(hi),
    wins: w,
    losses: l,
    ties: n - w - l,
    p: signTest(w, l),
  };
}
const fmt = (r) =>
  r.n
    ? `${pct(r.rate)} [${pct(r.lo)}, ${pct(r.hi)}] n=${r.n} W${r.wins}/L${r.losses}/T${r.ties} sign p=${r.p.toFixed(3)}`
    : 'n=0';

function main() {
  const out = runDir(parseArgs({ options: { out: { type: 'string' } } }).values.out);
  const read = (f) => JSON.parse(readFileSync(join(out, f), 'utf8'));
  const ferni = read('ferni.json');
  const judges = ['gemini', 'qwen'].filter((j) => existsSync(join(out, `judge.${j}.json`)));
  const V = Object.fromEntries(judges.map((j) => [j, read(`judge.${j}.json`)]));
  const all = read('moments.json').filter((m) => ferni[m.id]);
  for (const m of all) {
    const v = viewOf(m, ferni[m.id].reply);
    Object.assign(m, { fw: words(v.ferni), hw: words(v.human) });
  }
  const pairs = (j, m) => V[j][m.id]?.pairs ?? [];
  // A moment's score: the share of this judge's verdicts on it that picked Ferni.
  const scores = (j, q, ms) =>
    ms.flatMap((m) => {
      const ps = pairs(j, m).filter((p) => p[q]);
      return ps.length ? [{ score: mean(ps.map((p) => +(p[q] === 'ferni'))), file: m.file }] : [];
    });
  let claim = judges.length === 2;
  for (const j of judges)
    for (const split of ['main', 'holdout']) {
      const ms = all.filter((m) => m.split === split);
      const close = winRate(scores(j, 'closeFriend', ms));
      claim &&= close.lo > 0.5;
      say(`\n### ${j}, ${split}\n- close friend: Ferni wins ${fmt(close)}`);
      say(`- responds better: Ferni wins ${fmt(winRate(scores(j, 'responds', ms)))}`);
      const tell = (a) => pct(mean(ms.flatMap((m) => pairs(j, m)).map((p) => +!!p.tell?.[a])));
      const two = ms.map((m) => pairs(j, m)).filter((ps) => ps.length === 2);
      const same = mean(two.map(([a, b]) => +(a.closeFriend === b.closeFriend)));
      say(`- AI tell quoted: Ferni ${tell('ferni')}, human ${tell('human')}`);
      if (same !== null) say(`- same close-friend pick in both orders: ${pct(same)}`);
      for (const k of RUBRIC) {
        const alone = (m, arm) => V[j][m.id]?.alone?.[arm]?.[k];
        const rated = ms.filter((m) => alone(m, 'ferni') && alone(m, 'human'));
        if (!rated.length) continue;
        const d = ci(
          rated.map((m) => ({ score: alone(m, 'ferni') - alone(m, 'human'), file: m.file })),
          7
        );
        const [f, h] = ['ferni', 'human'].map((a) =>
          mean(rated.map((m) => alone(m, a))).toFixed(2)
        );
        say(
          `- alone ${k}: Ferni ${f}, human ${h}, diff ${f2(d.rate)} [${f2(d.lo)}, ${f2(d.hi)}] n=${d.n}`
        );
      }
    }
  if (judges.length === 2) say('\n### Judge agreement on the first-order pick');
  for (const q of judges.length === 2 ? ['closeFriend', 'responds'] : []) {
    const first = (j, m) => pairs(j, m).find((p) => p.order[0] === firstOrder(m.id)[0])?.[q];
    const both = all.map((m) => [first('gemini', m), first('qwen', m)]).filter(([a, b]) => a && b);
    const k = kappa(
      both.map((p) => p[0]),
      both.map((p) => p[1])
    );
    say(
      `- ${q}: kappa ${k.toFixed(2)}, agree ${pct(mean(both.map(([a, b]) => +(a === b))))}, n=${both.length}`
    );
  }
  const [fw, hw] = [median(all.map((m) => m.fw)), median(all.map((m) => m.hw))];
  say(
    `\n### Close friend, main + held-out, by type and length (median words: Ferni ${fw}, human ${hw})`
  );
  const groups = Object.entries({
    ...Object.fromEntries(TYPES.map((t) => [t, (m) => m.type === t])),
    'Ferni over 2x longer': (m) => m.fw > 2 * m.hw,
    'lengths within 2x': (m) => m.fw <= 2 * m.hw && m.hw <= 2 * m.fw,
    'Ferni over 2x shorter': (m) => m.hw > 2 * m.fw,
  });
  for (const j of judges)
    for (const [g, f] of groups)
      say(`- ${j} ${g}: ${fmt(winRate(scores(j, 'closeFriend', all.filter(f)), 3))}`);
  say(
    `\n**Verdict:** ${claim ? 'better than the real friend: both judges, main and held-out' : 'no "better than human" claim (needs both judges above 50% on main and held-out)'}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
