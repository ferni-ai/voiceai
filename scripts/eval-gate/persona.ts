#!/usr/bin/env tsx
/**
 * Eval gate, persona suite: the persona bar (scripts/persona-eval/bar.ts) once,
 * single-turn, one Gemini judge, under the prod persona flags in
 * evals/persona-flags.json, compared with evals/baselines/persona.json. A
 * prompt edit that flattens the voices or brings back the model's generic
 * habits fails the PR instead of merging green.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> CRISIS_MEANS_IN_HAND=<prod> MINOR_CARE=<prod> \
 *     pnpm tsx scripts/eval-gate/persona.ts [--json | --write-baseline --runs 5]
 *
 * bar runs as a child process: it reads flags at import time and runs one arm
 * per process. A child that fails, times out or writes no result.json fails
 * this script; it never passes on nothing.
 *
 * --write-baseline runs bar N times (N >= 3) on an unchanged tree: each value
 * is the mean, each band the larger of the widest spread between runs and the
 * 95% gap two runs at that sample size allow (bar-lib's samplingGap), so a
 * lucky close pair of runs can't set a band tighter than sampling noise.
 * Use 5 runs: with 3, the rare tells (exclaim ~2%) came within one reply of
 * their band on an unchanged tree (2026-11-11).
 *
 * Not gated yet: humanness (pairwise against stored baseline replies) and
 * multi-turn (director and deliberation between turns).
 * Per run (2026-11-11): 552 counted Flash calls, 215-559 s.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { samplingGap, TELL_KEYS, type Metrics, type Rate } from '../persona-eval/bar-lib.js';
import { report, serialize, type Baseline, type BaselineMetric } from './gate-lib.js';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
export const BASELINE = here('../../evals/baselines/persona.json');
export const FLAGS = here('../../evals/persona-flags.json');
const BAR = here('../persona-eval/bar.ts');
const ARM = 'gate';
/** gpt-oss, bar's second judge, serves ~11 calls a minute: too slow for CI. */
const JUDGE = 'gemini-3.5-flash';
/** A run took 215-559 s locally (2026-11-11); this fails it before the job's 20 min timeout. */
const CHILD_TIMEOUT_MS = 12 * 60_000;
/** Failed calls (empty replies, unparsable judgments) a run may add before it reads as an outage. */
const COUNT_FLOOR = 5;
const UPDATE = 'GOOGLE_CLOUD_PROJECT=<project> CRISIS_MEANS_IN_HAND=<prod> MINOR_CARE=<prod> pnpm tsx scripts/eval-gate/persona.ts --write-baseline --runs 5'; // prettier-ignore

/**
 * Protections bar reads whose prod values stay out of this public repo: the workflow maps each
 * from a repository variable (PERSONA_GATE_<name>). They reach bar through the environment, not
 * --set, so bar's printed overrides never show them.
 */
export const PROTECTIONS = ['CRISIS_MEANS_IN_HAND', 'MINOR_CARE'] as const;

/** The protections from `env`, unchanged; a missing one throws: no default stands in for prod. */
export function protectionsFrom(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    PROTECTIONS.map((name) => {
      const value = env[name];
      if (!value?.trim())
        throw new Error(
          `${name} is not set: the persona step maps it from the repository variable PERSONA_GATE_${name}, which must be set (the gate never falls back to a default)`
        );
      return [name, value];
    })
  );
}

/** The part of bar's result.json the gate reads. */
export interface BarResult {
  scored?: { metrics: Metrics; forced: Rate; judgeFailures: number; emptyReplies: number };
}

/** Higher is better here; every other metric is lower-is-better. */
const HIGHER = new Set(['persona.distinctness', 'persona.insight_natural']);

/** The rate metrics of one run, by gate metric name. */
export function ratesOf(r: BarResult): Record<string, Rate> {
  const s = r.scored;
  const tells = s?.metrics.tells;
  if (!s || !tells) throw new Error('bar result has no scored metrics with tells');
  return {
    'persona.distinctness': s.metrics.distinctness,
    'persona.insight_natural': s.metrics.insight,
    'persona.insight_forced': s.forced,
    'persona.copy': s.metrics.copy,
    ...Object.fromEntries(TELL_KEYS.map((k) => [`persona.tell_${k}`, tells[k]])),
  };
}

/** Failed calls in one run: a run that measured little must not read as a quiet one. */
export function countsOf(r: BarResult): Record<string, number> {
  if (!r.scored) throw new Error('bar result has no scored metrics');
  return {
    'persona.empty_replies': r.scored.emptyReplies,
    'persona.judge_failures': r.scored.judgeFailures,
  };
}

/** What the gate compares: each rate's share, and the counts. */
export function metricsOf(r: BarResult): Record<string, number> {
  const shares = Object.entries(ratesOf(r)).map(([k, v]): [string, number] => [k, v.p]);
  return { ...Object.fromEntries(shares), ...countsOf(r) };
}

const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const ceil4 = (x: number): number => Math.ceil(x * 1e4 - 1e-9) / 1e4;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: readonly number[]): number => Math.max(...xs) - Math.min(...xs);
const pairs = <T>(xs: readonly T[]): Array<[T, T]> =>
  xs.flatMap((a, i) => xs.slice(i + 1).map((b): [T, T] => [a, b]));

/**
 * A baseline from N runs on an unchanged tree: value = the mean; band = the
 * larger of the widest spread between runs and the widest samplingGap of any
 * two runs (counts: the spread, at least COUNT_FLOOR).
 */
export function baselineFrom(runs: readonly BarResult[], commit: string): Baseline {
  if (runs.length < 3) throw new Error('a persona baseline needs at least 3 runs');
  const rates = runs.map(ratesOf);
  const counts = runs.map(countsOf);
  const metrics: Record<string, BaselineMetric> = {};
  for (const name of Object.keys(rates[0])) {
    const per = rates.map((r) => r[name]);
    const ps = per.map((r) => r.p);
    const gap = Math.max(spread(ps), ...pairs(per).map(([a, b]) => samplingGap(a, b)));
    const band = HIGHER.has(name) ? { maxDrop: ceil4(gap) } : { maxRise: ceil4(gap) };
    metrics[name] = { value: round4(mean(ps)), ...band, runs: ps.map(round4) };
  }
  for (const name of Object.keys(counts[0])) {
    const cs = counts.map((c) => c[name]);
    metrics[name] = { value: round4(mean(cs)), maxRise: Math.max(COUNT_FLOOR, spread(cs)), runs: cs }; // prettier-ignore
  }
  return {
    suite: `persona: bar single-turn, judge ${JUDGE} (Vertex)`,
    update: UPDATE,
    measuredOn: commit,
    runs: runs.length,
    metrics,
  };
}

/** The result bar wrote under `out`, or a throw: no result is never a pass. */
export function readResult(out: string): BarResult {
  const file = join(out, ARM, 'run1', 'result.json');
  if (!existsSync(file)) throw new Error(`bar.ts wrote no ${file}`);
  return JSON.parse(readFileSync(file, 'utf8')) as BarResult;
}

type Spawn = (cmd: string, args: string[], opts: object) => SpawnSyncReturns<Buffer>;

/** One bar run in a child process; a failed, killed or silent child throws. */
export function runBar(out: string, spawn: Spawn = spawnSync, env = process.env): BarResult {
  const args = ['--arm', ARM, '--flags', FLAGS, '--out', out, '--runs', '1', '--judges', JUDGE];
  const child = spawn(process.execPath, ['--import', 'tsx', BAR, ...args], {
    stdio: 'inherit',
    timeout: CHILD_TIMEOUT_MS,
    env: { ...env, ...protectionsFrom(env) },
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`bar.ts failed: ${child.signal ?? `exit ${String(child.status)}`}`);
  return readResult(out);
}

/** Run bar `n` times, each in its own temp dir (removed after it is read). */
function measure(n: number): BarResult[] {
  return Array.from({ length: n }, (_, i) => {
    const out = mkdtempSync(join(tmpdir(), 'persona-gate-'));
    const t0 = Date.now();
    try {
      return runBar(out);
    } finally {
      console.error(
        `persona gate: bar run ${i + 1}/${n} took ${Math.round((Date.now() - t0) / 1000)} s`
      );
      rmSync(out, { recursive: true, force: true });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!process.env.GOOGLE_CLOUD_PROJECT) throw new Error('Set GOOGLE_CLOUD_PROJECT (Vertex, ADC)');
  protectionsFrom(process.env); // fail before any model call
  if (args.includes('--write-baseline')) {
    const runs = Number(args[args.indexOf('--runs') + 1]);
    if (!args.includes('--runs') || !Number.isInteger(runs) || runs < 3)
      throw new Error('--write-baseline needs --runs N with N >= 3');
    writeFileSync(BASELINE, serialize(baselineFrom(measure(runs), process.env.GITHUB_SHA ?? 'local'))); // prettier-ignore
    console.log(`wrote ${BASELINE}`);
    process.exit(0);
  }
  const current = metricsOf(measure(1)[0]);
  if (args.includes('--json')) console.log(JSON.stringify(current, null, 2));
  process.exit(report(BASELINE, current, args));
}
