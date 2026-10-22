#!/usr/bin/env node
// Build A vs build B on the same scenarios (README.md). Per metric: diff of scenario means with a
// 95% CI from 10,000 scenario resamples, per-call SD, A/B correlation, and MDE80.
// usage: paired.mjs [--scenarios N] [--seed S] <sweep-A-dir> <sweep-B-dir>
import { existsSync, readFileSync } from 'node:fs';
import { MIN_BOOT_CLUSTERS, clusterBootstrap, tQuantile } from './judge-stats.mjs';
import { gateSweep } from './gate.mjs';
import { loadSweep } from './predicates/call.mjs';
import { PREDICATES } from './predicates/index.mjs';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ss = (xs, m = mean(xs)) => xs.reduce((a, x) => a + (x - m) ** 2, 0);
const sd = (xs) => (xs.length < 2 ? null : Math.sqrt(ss(xs) / (xs.length - 1)));

export function pearson(x, y) {
  const [mx, my] = [mean(x), mean(y)];
  const sxy = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - my), 0);
  return ss(x) && ss(y) ? sxy / Math.sqrt(ss(x) * ss(y)) : null;
}

/** MDE at 80% power, two-sided .05, for n paired scenarios whose diffs have this SD. */
export const mde = (sdDiff, n) =>
  n < 2 || sdDiff === null ? null : ((tQuantile(0.975, n - 1) + tQuantile(0.8, n - 1)) * sdDiff) / Math.sqrt(n);

/** calls: [{ scenario, values: { metric: number|null } }] per build. A row per metric on 2+ shared scenarios. */
export function pairedCompare(callsA, callsB, { B = 10000, seed = 20261022, scenarios = null } = {}) {
  const byScenario = (calls, m) => {
    const out = new Map();
    for (const { scenario: s, values: v } of calls) if (typeof v[m] === 'number') out.set(s, [...(out.get(s) ?? []), v[m]]);
    return out;
  };
  const metrics = [...new Set([...callsA, ...callsB].flatMap((c) => Object.keys(c.values)))];
  return metrics.flatMap((metric) => {
    const [a, b] = [byScenario(callsA, metric), byScenario(callsB, metric)];
    const shared = [...a.keys()].filter((s) => b.has(s)).sort();
    if (shared.length < 2) return [];
    const [ma, mb] = [shared.map((s) => mean(a.get(s))), shared.map((s) => mean(b.get(s)))];
    const diffs = shared.map((_, i) => mb[i] - ma[i]);
    const draws = clusterBootstrap(diffs, shared, { B, seed });
    // A single call's spread around its build's mean: what one unpaired call is worth.
    const [ca, cb] = [shared.flatMap((s) => a.get(s)), shared.flatMap((s) => b.get(s))];
    const dfCalls = ca.length + cb.length - 2;
    const n = scenarios ?? shared.length;
    const row = { metric, scenarios: shared.length, calls: [ca.length, cb.length], meanA: mean(ma), meanB: mean(mb) };
    return [
      Object.assign(row, {
        diff: mean(diffs),
        ci: [draws[Math.floor(0.025 * B)], draws[Math.floor(0.975 * B)]],
        sdPerCall: dfCalls > 0 ? Math.sqrt((ss(ca) + ss(cb)) / dfCalls) : null,
        r: pearson(ma, mb),
        sdDiff: sd(diffs),
        mde80: mde(sd(diffs), n),
        mdeScenarios: n,
      }),
    ];
  });
}

/** A sweep dir as pairedCompare input: gate pass, each predicate's pass, each judge dimension. */
export function sweepValues(dir) {
  return gateSweep(loadSweep(dir)).rows.map(({ call, hits, gated }) => {
    const values = { gate: +gated };
    for (const p of PREDICATES) values[`pred:${p.id}`] = +!hits[p.id].length;
    const judge = call.file.replace(/\.json$/, '.judge.json');
    const scores = existsSync(judge) ? (JSON.parse(readFileSync(judge, 'utf8')).scores ?? {}) : {};
    for (const [k, v] of Object.entries(scores)) if (typeof v === 'number') values[`judge:${k}`] = v;
    return { scenario: call.scenario, values };
  });
}

const f = (x) => (x == null ? '-' : x.toFixed(2));
const COLS = {
  scen: (r) => r.scenarios,
  'calls A/B': (r) => r.calls.join('/'),
  A: (r) => f(r.meanA),
  B: (r) => f(r.meanB),
  diff: (r) => f(r.diff),
  '95% CI': (r) => `[${f(r.ci[0])}, ${f(r.ci[1])}]`,
  'sd/call': (r) => f(r.sdPerCall),
  'r(A,B)': (r) => f(r.r),
  MDE80: (r) => f(r.mde80),
};

export function formatPaired(rows) {
  const table = [['metric', ...Object.keys(COLS)], ...rows.map((r) => [r.metric, ...Object.values(COLS).map((c) => `${c(r)}`)])];
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
  const lines = table.map((row) => row.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  '));
  lines.push(`MDE80 assumes ${rows[0]?.mdeScenarios ?? '-'} paired scenarios next sweep (--scenarios N).`);
  if (rows.some((r) => r.scenarios < MIN_BOOT_CLUSTERS))
    lines.push(`Under ${MIN_BOOT_CLUSTERS} shared scenarios the CI runs narrow: a direction, not a verdict.`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? Number(args.splice(args.indexOf(name), 2)[1]) : undefined);
  const [scenarios, seed] = [opt('--scenarios'), opt('--seed')];
  if (args.length !== 2) {
    console.error('usage: paired.mjs [--scenarios N] [--seed S] <sweep-A-dir> <sweep-B-dir>');
    process.exit(2);
  }
  console.log(formatPaired(pairedCompare(sweepValues(args[0]), sweepValues(args[1]), { scenarios, seed })));
}
