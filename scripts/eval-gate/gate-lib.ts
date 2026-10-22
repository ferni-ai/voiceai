/**
 * Eval gate: compare measured metrics with a committed baseline
 * (evals/baselines/*.json). Each metric carries its band: `maxDrop` where
 * higher is better, `maxRise` where lower is better. A baseline metric the run
 * did not measure fails, so a suite that stops reporting cannot read green.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export interface BaselineMetric {
  value: number;
  maxDrop?: number;
  maxRise?: number;
}

export interface Baseline {
  suite: string;
  /** The command that rewrites this file, shown when a metric improves. */
  update: string;
  measuredOn: string;
  metrics: Record<string, BaselineMetric>;
}

export type Status = 'ok' | 'improved' | 'REGRESSED' | 'MISSING';
export interface Row {
  metric: string;
  baseline: number;
  current?: number;
  band: string;
  status: Status;
}

/** Values are stored to 4 places; anything finer is not a change. */
const EPS = 1e-4;

export function compare(baseline: Baseline, current: Record<string, number>): Row[] {
  return Object.entries(baseline.metrics).map(([metric, b]) => {
    const { maxDrop: drop, maxRise: rise } = b;
    if (drop === undefined && rise === undefined)
      throw new Error(`${baseline.suite}.${metric}: a baseline metric needs maxDrop or maxRise`);
    const band = drop !== undefined ? `drop <= ${drop}` : `rise <= ${rise}`;
    const value = current[metric];
    if (value === undefined || !Number.isFinite(value))
      return { metric, baseline: b.value, band, status: 'MISSING' };
    const delta = value - b.value;
    const regressed =
      (drop !== undefined && delta < -drop - EPS) || (rise !== undefined && delta > rise + EPS);
    const better = (drop !== undefined && delta > EPS) || (rise !== undefined && delta < -EPS);
    const status: Status = regressed ? 'REGRESSED' : better ? 'improved' : 'ok';
    return { metric, baseline: b.value, current: value, band, status };
  });
}

export const failed = (rows: Row[]): boolean =>
  rows.some((r) => r.status === 'REGRESSED' || r.status === 'MISSING');

const fmt = (x?: number): string =>
  x === undefined ? '-' : Number.isInteger(x) ? String(x) : x.toFixed(3);

/** A markdown table, for the terminal and the job summary. */
export function table(baseline: Baseline, rows: Row[]): string {
  return [
    `### ${baseline.suite} ${failed(rows) ? 'FAILED' : 'passed'}`,
    '',
    '| metric | baseline | this PR | allowed | status |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.metric} | ${fmt(r.baseline)} | ${fmt(r.current)} | ${r.band} | ${r.status} |`), // prettier-ignore
    '',
    rows.some((r) => r.status === 'improved') ? `Improved: re-baseline deliberately with \`${baseline.update}\`.\n` : '', // prettier-ignore
  ].join('\n');
}

export const readBaseline = (path: string): Baseline =>
  JSON.parse(readFileSync(path, 'utf8')) as Baseline;

/** New values, same bands: a re-baseline never loosens a threshold. */
export function rebaseline(
  old: Baseline,
  current: Record<string, number>,
  commit: string
): Baseline {
  const metrics: Record<string, BaselineMetric> = {};
  for (const [name, m] of Object.entries(old.metrics)) {
    const value = current[name];
    if (value === undefined) throw new Error(`cannot re-baseline: ${name} was not measured`);
    metrics[name] = { ...m, value: Math.round(value * 1e4) / 1e4 };
  }
  return { ...old, measuredOn: commit, metrics };
}

/** One metric per line, so a re-baseline reads as a short diff. */
export function serialize(b: Baseline): string {
  const head = JSON.stringify(
    { suite: b.suite, update: b.update, measuredOn: b.measuredOn },
    null,
    2
  );
  const one = (m: BaselineMetric): string => JSON.stringify(m).replace(/^\{(.*)\}$/, '{ $1 }').replace(/([:,])/g, '$1 '); // prettier-ignore
  const rows = Object.entries(b.metrics).map(([k, m]) => `    ${JSON.stringify(k)}: ${one(m)}`);
  return `${head.slice(0, -2)},\n  "metrics": {\n${rows.join(',\n')}\n  }\n}\n`;
}

/** Print and summarize the comparison (or rewrite the baseline); 1 on any regression. */
export function report(
  path: string,
  current: Record<string, number>,
  args: readonly string[]
): number {
  const baseline = readBaseline(path);
  if (args.includes('--write-baseline')) {
    writeFileSync(
      path,
      serialize(rebaseline(baseline, current, process.env.GITHUB_SHA ?? 'local'))
    );
    console.log(`wrote ${path}`);
    return 0;
  }
  const rows = compare(baseline, current);
  const text = table(baseline, rows);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return failed(rows) ? 1 : 0;
}
