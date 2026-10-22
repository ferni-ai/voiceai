#!/usr/bin/env node
// Tool choice as a tracked metric: pools eval-choice.ts output over seeds, checks it against a
// floor, and (with --baseline) compares two builds paired on the same requests.
// usage: choice-score.mjs [--floor 0.78] [--baseline a.json,b.json] [--out FILE] <choice-*.json>...
//   Run eval-choice.ts with 2+ seeds per build (same seeds for both builds) first. The metric is
//   right-or-equivalent: the labelled tool, or a tool the strict judge says serves as well.
// Exit: 0 at or above the floor, 1 below it, 2 bad input or INVALID (too many errored rows, under
// MIN_ROWS scored rows, or fewer than MIN_FILES seed files).
import { readFileSync, writeFileSync } from 'node:fs';
import { clusterBootstrap } from '../voice-eval/judge-stats.mjs';

// Set 2026-10-22, 4 pts under September's 82% (out/choice-base2-*). That run dropped 49 errored
// rows, but on the 510 requests it answered 8981d4f03 is still 6.5 pts lower. Below the floor
// someone looks.
export const FLOOR = 0.78;
const B = 10000;

/** Errored rows are dropped, so above this share the rate covers a biased subset: September's
 *  82% dropped 49 of 600 (thought_signature errors on multi-step turns), and 8981d4f03 got those
 *  requests right only 35-65% of the time against 75-77% on the rest. */
export const MAX_ERROR_SHARE = 0.02;
/** Under these the rate is too noisy to hold to a floor: 2 seeds of 300 give about +-3.5 pts. */
export const MIN_ROWS = 400;
export const MIN_FILES = 2;
/** One build's rows from its seed files, each tagged with its file. */
export function readRows(files) {
  return files.flatMap((f) => {
    const rows = JSON.parse(readFileSync(f, 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${f} is not an eval-choice.ts row array`);
    return rows.map((r) => ({ ...r, seedFile: f }));
  });
}
const right = (r) => +(r.final === r.label || r.sufficient === true);
const ci = (values, clusters) => {
  const d = clusterBootstrap(values, clusters, { B, seed: 20261022 });
  return [d[Math.floor(0.025 * B)], d[Math.floor(0.975 * B)]];
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Pooled right-or-equivalent and label-sent rates, the rate with a 95% CI that resamples whole
 *  requests (seeds overlap, so one request can appear more than once), and the worst case: every
 *  errored row counted wrong. FAIL when either rate is under the floor. */
export function scoreChoice(all, floor = FLOOR) {
  const rows = all.filter((r) => !r.error);
  if (!rows.length) throw new Error('no scored rows');
  const errors = all.length - rows.length;
  const q = rows.map((r) => r.query);
  const rate = mean(rows.map(right));
  const worst = rows.filter((r) => right(r)).length / all.length;
  const files = new Set(all.map((r) => r.seedFile)).size;
  const invalid =
    errors > MAX_ERROR_SHARE * all.length || rows.length < MIN_ROWS || files < MIN_FILES;
  return {
    n: rows.length,
    requests: new Set(q).size,
    rate,
    worst,
    ci: ci(rows.map(right), q),
    labelSent: mean(rows.map((r) => +r.labelSent)),
    errors,
    seedFiles: files,
    floor,
    verdict: invalid ? 'INVALID' : rate < floor || worst < floor ? 'FAIL' : 'PASS',
  };
}

/** Candidate - baseline on the requests both builds answered, resampled by request. */
export function pairedChoice(candAll, baseAll) {
  const [cand, base] = [candAll, baseAll].map((rows) => rows.filter((r) => !r.error));
  const byQ = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.query, [...(m.get(r.query) ?? []), right(r)]);
    return m;
  };
  const [c, b] = [byQ(cand), byQ(base)];
  const shared = [...c.keys()].filter((k) => b.has(k));
  if (!shared.length) return null;
  const diffs = shared.map((k) => mean(c.get(k)) - mean(b.get(k)));
  const baseErrors = baseAll.length - base.length;
  return { requests: shared.length, diff: mean(diffs), ci: ci(diffs, shared), baseErrors };
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
function main(argv) {
  const opt = (k) => (argv.includes(k) ? argv.splice(argv.indexOf(k), 2)[1] : undefined);
  const floor = Number(opt('--floor') ?? FLOOR);
  const [baseline, out] = [opt('--baseline'), opt('--out')];
  if (!argv.length || !(floor > 0 && floor < 1))
    throw new Error(
      'usage: choice-score.mjs [--floor 0.78] [--baseline a.json,b.json] [--out FILE] <choice-*.json>...'
    );
  const rows = readRows(argv);
  const s = scoreChoice(rows, floor);
  const baseRows = baseline ? readRows(baseline.split(',')) : null;
  const p = baseRows ? pairedChoice(rows, baseRows) : null;
  console.log(
    `tool choice right-or-equivalent ${pct(s.rate)} [${pct(s.ci[0])}, ${pct(s.ci[1])}] over ${s.n} rows ` +
      `(${s.requests} requests, ${s.seedFiles} seed files, ${s.errors} errored, worst case ${pct(s.worst)}); right tool sent ${pct(s.labelSent)}; floor ${pct(floor)}: ${s.verdict}`
  );
  if (baseRows) {
    const b = scoreChoice(baseRows, floor);
    console.log(
      `baseline ${pct(b.rate)} over ${b.n} rows, ${b.errors} errored: ${b.verdict}` +
        (b.verdict === 'INVALID' ? ' (the diff below covers only the requests it answered)' : '')
    );
  }
  if (p)
    console.log(
      `candidate - baseline ${(100 * p.diff).toFixed(1)} pts [${(100 * p.ci[0]).toFixed(1)}, ${(100 * p.ci[1]).toFixed(1)}] over ${p.requests} shared requests`
    );
  if (out)
    writeFileSync(out, `${JSON.stringify({ ...s, paired: p, files: argv.length }, null, 1)}\n`);
  return { PASS: 0, FAIL: 1, INVALID: 2 }[s.verdict];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`choice-score: ${e.message}`);
    process.exit(2);
  }
}
