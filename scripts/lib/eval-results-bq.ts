/**
 * The eval scripts' `--bq` switch: their headline numbers as rows of
 * johnb-2025.ferni_events.eval_results, one row per metric, env 'dev'. Off
 * unless a script is given --bq; without it nothing is built or sent.
 *
 * Unlike the product producers (emitEvent buffers, logs a failed insert and
 * drops it), this throws on any insert error, so a run that asked for --bq
 * exits non-zero rather than looking reported. Every string passes the
 * column allowlists in src/services/analytics/bq-fields.ts: a metric, scenario
 * or arm off its list, or a run id not shaped like one, is written as 'other'.
 * Only numbers leave: never a caller line, a reply or a judge's text.
 *
 * @module scripts/lib/eval-results-bq
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { insertRowsOrThrow, type BqRow } from '../../src/services/analytics/bq-events.js';
import type { BenchScore } from '../memory-eval/recall-bench-lib.js';
import type { Tally } from '../memory-eval/longmem-lib.js';
import type { Humanness, Metrics, Rate } from '../persona-eval/bar-lib.js';

export type Bench = 'bar' | 'recall' | 'longmem' | 'live';

export interface EvalReport {
  runId: string;
  arm: string;
  scenario: string;
  /** A short commit hash; the checkout's HEAD when left out. */
  agentVersion?: string;
  metrics: Readonly<Record<string, number>>;
  /** Flags the arm turned on (flag-manifest names). */
  flags?: readonly string[];
}

/** `<bench>-<yyyymmdd>-<6 hex>`, the shape bq-fields lets through. */
export function newRunId(bench: Bench, now: Date = new Date()): string {
  return `${bench}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`;
}

/** HEAD as a 12-character hash, or '' outside a git checkout (then written as 'other'). */
export function gitVersion(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** One row per metric, sent now. Throws on a refused row or any insert error. */
export async function reportEvalMetrics(report: EvalReport): Promise<number> {
  const { runId, arm, scenario, metrics, flags = [] } = report;
  const agentVersion = report.agentVersion ?? gitVersion();
  const rows: Array<BqRow<'eval_results'>> = Object.entries(metrics).map(([metric, value]) => ({
    run_id: runId,
    scenario,
    arm,
    agent_version: agentVersion,
    metric,
    value,
    flags,
  }));
  // The env argument only: this process's own env (and every module reading it) stays as it was.
  return insertRowsOrThrow('eval_results', rows, {
    ...process.env,
    BQ_EVENTS: 'on',
    DEPLOY_ENV: 'dev',
  });
}

/** What a script calls after its results: nothing without --bq, else every report. Rows sent. */
export async function reportIfBq(bq: boolean, reports: readonly EvalReport[]): Promise<number> {
  if (!bq) return 0;
  let sent = 0;
  for (const report of reports) sent += await reportEvalMetrics(report);
  console.log(`--bq: ${sent} eval_results rows sent (run ${reports[0]?.runId ?? 'none'})`);
  return sent;
}

/** A rate's share, or nothing when it rests on no samples (a 0 there would read as a result). */
const share = (r: Rate | undefined): number | undefined => (r && r.n > 0 ? r.p : undefined);
const defined = (m: Record<string, number | undefined>): Record<string, number> =>
  Object.fromEntries(Object.entries(m).filter((e): e is [string, number] => e[1] !== undefined));

/** recall-bench at MIN_MARGIN. */
export function recallMetrics(score: BenchScore): Record<string, number> {
  return {
    recall_hit: score.hitRate,
    recall_false: score.falseRecallRate,
    recall_precision: score.precision,
  };
}

/** longmem, one arm: accuracy, and the share of notes that held the evidence when judged. */
export function longmemMetrics(t: Tally): Record<string, number> {
  return defined({
    longmem_correct: t.n > 0 ? t.accuracy : undefined,
    longmem_evidence: t.retrieved ?? undefined,
  });
}

/** What bar.ts saves per run that this reads. */
export interface BarRun {
  arm: string;
  sets: Readonly<Record<string, string>>;
  mode?: 'multi-turn';
  scored: { metrics: Metrics; perPersona: Readonly<Record<string, { distinctness: Rate }>> };
  humanness?: Humanness;
}

/** One bar run: the arm's metrics under scenario bar, and each persona's distinctness. */
export function barReports(run: BarRun, runId: string = newRunId('bar')): EvalReport[] {
  const m = run.scored.metrics;
  const flags = Object.entries(run.sets)
    .filter(([, v]) => v === 'on')
    .map(([k]) => k);
  const base = { runId, arm: run.arm, flags };
  const overall = defined({
    distinctness: share(m.distinctness),
    insight_natural: share(m.insight),
    copy_rate: share(m.copy),
    humanness_win: share(run.humanness?.overall),
    humanness_matched_win: share(run.humanness?.matched),
    tell_question: share(m.tells?.question),
    tell_opener: share(m.tells?.opener),
    tell_checkin: share(m.tells?.checkin),
    tell_exclaim: share(m.tells?.exclaim),
  });
  const scenario = run.mode === 'multi-turn' ? 'bar_multi_turn' : 'bar';
  return [
    { ...base, scenario, metrics: overall },
    ...Object.entries(run.scored.perPersona).map(([persona, s]) => ({
      ...base,
      scenario: persona,
      metrics: defined({ distinctness: share(s.distinctness) }),
    })),
  ].filter((r) => Object.keys(r.metrics).length > 0);
}
