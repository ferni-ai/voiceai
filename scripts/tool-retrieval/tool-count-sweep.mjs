#!/usr/bin/env node
// Scores the tool-count sweep (eval-choice.ts with TOOL_SET=count EVAL_NEGATIVES=1), one file per
// size, run and sample seed: out/choice-count<size>-r<run>-s<seed>.json.
// usage: tool-count-sweep.mjs <dir> [sizeA:sizeB ...]   (default pairs 40:96 20:130)
// Requests whose labelled tool is not registered (27 of 1,188 v1 labels) are not scored.
// Per size and run: right-or-equivalent, missed call (no tool), lookalike (another tool the judge
// rejected), false call on the no-tool negatives. Pairs: exact McNemar on the same requests (each
// run and seed apart) and the paired difference with a request-resampled 95% CI.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pairedChoice } from './choice-score.mjs';

const right = (r) => r.final === r.label || r.sufficient === true;
/** Scored requests: answered, and the labelled tool is registered (so it was offered). */
const positive = (r) => !r.error && r.label !== null && r.labelSent;

/** Exact two-sided McNemar p from the discordant counts b and c (binomial, p = 0.5). */
export function mcnemar(b, c) {
  const n = b + c;
  if (!n) return 1;
  let logP = -n * Math.log(2); // P(X = 0)
  let tail = 0;
  for (let i = 0; i <= Math.min(b, c); i++) {
    tail += Math.exp(logP);
    logP += Math.log(n - i) - Math.log(i + 1);
  }
  return Math.min(1, 2 * tail);
}

/** Rates over one set of rows (errored rows dropped). */
export function rates(rows) {
  const pos = rows.filter(positive);
  const neg = rows.filter((r) => !r.error && r.label === null);
  const share = (xs, f) => xs.filter(f).length / Math.max(1, xs.length);
  return {
    n: pos.length,
    right: share(pos, right),
    missed: share(pos, (r) => !r.final),
    lookalike: share(pos, (r) => r.final && !right(r)),
    falseCall: share(neg, (r) => r.final),
    negatives: neg.length,
    errors: rows.filter((r) => r.error).length,
  };
}

/** b: right at A, wrong at B; c: the reverse; over requests answered at both (same run, seed). */
export function discordant(a, b) {
  const key = (r) => `${r.run}|${r.seed}|${r.query}`;
  const at = new Map(b.filter(positive).map((r) => [key(r), r]));
  let [nb, nc, n] = [0, 0, 0];
  for (const r of a.filter(positive)) {
    const o = at.get(key(r));
    if (!o) continue;
    n++;
    if (right(r) && !right(o)) nb++;
    if (!right(r) && right(o)) nc++;
  }
  return { n, b: nb, c: nc, p: mcnemar(nb, nc) };
}

function load(dir) {
  const bySize = new Map();
  for (const f of readdirSync(dir)) {
    const m = /^choice-count(\d+)-r(\d+)-s(\d+)\.json$/.exec(f);
    if (!m) continue;
    const rows = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const [size, run, seed] = m.slice(1).map(Number);
    bySize.set(size, [...(bySize.get(size) ?? []), ...rows.map((r) => ({ ...r, run, seed }))]);
  }
  return bySize;
}

function main([dir, ...pairs]) {
  const bySize = load(dir);
  const pct = (x) => (100 * x).toFixed(1);
  console.log(
    '| tools | right-or-equiv (r1 / r2) | missed call | lookalike | false call (negatives) | n | errors |'
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const size of [...bySize.keys()].sort((x, y) => x - y)) {
    const rows = bySize.get(size);
    const runs = [...new Set(rows.map((r) => r.run))].sort();
    const per = runs.map((k) => rates(rows.filter((r) => r.run === k)));
    const all = rates(rows);
    console.log(
      `| ${size} | ${pct(all.right)} (${per.map((p) => pct(p.right)).join(' / ')}) | ${pct(all.missed)} | ` +
        `${pct(all.lookalike)} | ${pct(all.falseCall)} (${per.map((p) => pct(p.falseCall)).join(' / ')}) | ${all.n} | ${all.errors} |`
    );
  }
  for (const pair of pairs.length ? pairs : ['40:96', '20:130']) {
    const [a, b] = pair.split(':').map(Number);
    if (!bySize.has(a) || !bySize.has(b)) continue;
    const pos = (s) => bySize.get(s).filter(positive);
    const p = pairedChoice(pos(a), pos(b));
    // McNemar per run: pooling runs would count each request twice.
    const runs = [...new Set(bySize.get(a).map((r) => r.run))].sort();
    const per = runs.map((run) => {
      const d = discordant(...[a, b].map((s) => bySize.get(s).filter((r) => r.run === run)));
      return `run ${run} b=${d.b} c=${d.c} of ${d.n}, p=${d.p.toPrecision(2)}`;
    });
    console.log(
      `${a} vs ${b}: ${pct(p.diff)} pts [${pct(p.ci[0])}, ${pct(p.ci[1])}] over ${p.requests} requests; ` +
        `McNemar (b right only at ${a}, c only at ${b}): ${per.join('; ')}`
    );
  }
  for (const size of [...bySize.keys()].sort((x, y) => x - y)) {
    const counts = new Map();
    for (const r of bySize.get(size).filter((x) => positive(x) && x.final && !right(x))) {
      const k = `${r.label}→${r.final}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts].sort((x, y) => y[1] - x[1]).slice(0, 10);
    console.log(`${size} top lookalikes: ${top.map(([k, v]) => `${k} ${v}`).join('; ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
