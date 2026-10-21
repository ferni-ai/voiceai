/**
 * The eval scripts' --bq switch, through a fake transport: nothing without it, one row per
 * metric with it, env dev, and a failed insert throws so the script exits non-zero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => {
    throw new Error('network must not be touched in tests');
  }),
}));

import { GoogleAuth } from 'google-auth-library';

import { setBqTransportForTests, type BqTable } from '../../../src/services/analytics/bq-events.js';
import { FIELD_VALUE } from '../../../src/services/analytics/bq-fields.js';
import {
  barReports,
  longmemMetrics,
  newRunId,
  recallMetrics,
  reportIfBq,
  type BarRun,
  type EvalReport,
} from '../eval-results-bq.js';
import { rate } from '../../persona-eval/bar-lib.js';

/** Every metric the three scripts write, each with its own value. Written out, not imported. */
const METRICS = {
  distinctness: 0.61,
  insight_natural: 0.5,
  copy_rate: 0.12,
  humanness_win: 0.55,
  humanness_matched_win: 0.52,
  tell_question: 0.3,
  tell_opener: 0.1,
  tell_checkin: 0.05,
  tell_exclaim: 0.02,
  recall_hit: 0.8,
  recall_false: 0.07,
  recall_precision: 0.9,
  longmem_correct: 0.66,
  longmem_evidence: 0.71,
};
const REPORT: EvalReport = {
  runId: 'recall-20261021-a1b2c3',
  arm: 'min-margin',
  scenario: 'recall',
  agentVersion: 'abc123def456',
  metrics: METRICS,
  flags: ['SEMANTIC_RECALL'],
};

let rows: Record<string, unknown>[];
let tables: BqTable[];
beforeEach(() => {
  rows = [];
  tables = [];
  setBqTransportForTests(async (table, sent) => {
    tables.push(table);
    rows.push(...sent);
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  setBqTransportForTests(null);
  vi.restoreAllMocks();
});

describe('reportIfBq', () => {
  it('without --bq sends nothing and never reaches the network', async () => {
    await expect(reportIfBq(false, [REPORT])).resolves.toBe(0);
    expect(rows).toHaveLength(0);
    setBqTransportForTests(null);
    await reportIfBq(false, [REPORT]);
    expect(vi.mocked(GoogleAuth)).not.toHaveBeenCalled();
  });

  it('with --bq sends exactly one eval_results row per metric, values as given, env dev', async () => {
    const n = Object.keys(METRICS).length;
    await expect(reportIfBq(true, [REPORT])).resolves.toBe(n);
    expect(rows).toHaveLength(n);
    expect(new Set(tables)).toEqual(new Set(['eval_results']));
    expect(rows.map((r) => [r.metric, r.value])).toEqual(Object.entries(METRICS));
    for (const r of rows) {
      expect(r).toMatchObject({
        env: 'dev',
        run_id: 'recall-20261021-a1b2c3',
        arm: 'min-margin',
        scenario: 'recall',
        agent_version: 'abc123def456',
        flags: ['SEMANTIC_RECALL'],
      });
    }
  });

  it('env dev reaches the rows through the env argument only: process.env is untouched', async () => {
    const before = { BQ_EVENTS: process.env.BQ_EVENTS, DEPLOY_ENV: process.env.DEPLOY_ENV };
    vi.stubEnv('DEPLOY_ENV', 'production');
    vi.stubEnv('BQ_EVENTS', 'off');
    try {
      await reportIfBq(true, [REPORT]);
      expect(rows[0]?.env).toBe('dev');
      expect(process.env.DEPLOY_ENV).toBe('production');
      expect(process.env.BQ_EVENTS).toBe('off');
    } finally {
      vi.unstubAllEnvs();
    }
    expect({ BQ_EVENTS: process.env.BQ_EVENTS, DEPLOY_ENV: process.env.DEPLOY_ENV }).toEqual(
      before
    );
  });

  it('an off-list metric and a phone-shaped run id are written as other', async () => {
    await reportIfBq(true, [
      { ...REPORT, runId: 'recall-5551234567', metrics: { 'caller said hi': 1 } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ run_id: 'other', metric: 'other', value: 1 });
    expect(JSON.stringify(rows)).not.toMatch(/5551234567|caller said/);
  });

  it('throws when the insert answers with insertErrors, and on a transport error', async () => {
    setBqTransportForTests(async () => ({ insertErrors: [{ index: 0 }] }));
    await expect(reportIfBq(true, [REPORT])).rejects.toThrow(/rows rejected/);
    setBqTransportForTests(async () => {
      throw new Error('403');
    });
    await expect(reportIfBq(true, [REPORT])).rejects.toThrow('403');
  });

  it('a new run id has the shape the allowlist keeps', () => {
    for (const bench of ['bar', 'recall', 'longmem'] as const) {
      const id = newRunId(bench, new Date('2026-10-21T12:00:00Z'));
      expect(id).toMatch(new RegExp(`^${bench}-20261021-[a-f0-9]{6}$`));
      expect(FIELD_VALUE.run_id?.(id)).toBe(id);
    }
  });
});

describe('what each script reports', () => {
  it('recall-bench: the three rates', () => {
    const score = { minMargin: 0.08, hitRate: 0.8, precision: 0.9, falseRecallRate: 0.07 };
    expect(recallMetrics({ ...score, counts: {} as never, results: [] })).toEqual({
      recall_hit: 0.8,
      recall_false: 0.07,
      recall_precision: 0.9,
    });
  });

  it('longmem: accuracy and evidence, leaving out what nothing measured', () => {
    const t = { n: 6, correct: 4, accuracy: 4 / 6, ci95: [0, 1] as [number, number] };
    const tally = { ...t, retrieved: 0.5, judgeFailures: 0, noAnswers: 0 };
    expect(longmemMetrics(tally)).toEqual({ longmem_correct: 4 / 6, longmem_evidence: 0.5 });
    expect(longmemMetrics({ ...tally, n: 0, retrieved: null })).toEqual({});
  });

  it('bar: every metric under the bench, distinctness per persona, empty rates left out', async () => {
    const tells = {
      question: rate(3, 10),
      opener: rate(1, 10),
      checkin: rate(0, 10),
      exclaim: rate(2, 10),
      asks: rate(4, 10),
    };
    const run: BarRun = {
      arm: 'voice',
      sets: { PERSONA_VOICE: 'on', SOME_LEVEL: '3' },
      scored: {
        metrics: {
          distinctness: rate(6, 10),
          insight: rate(0, 0),
          copy: { ...rate(1, 10), top: [] },
          medianWords: 14,
          tells,
        },
        perPersona: {
          ferni: { distinctness: rate(2, 4) },
          'nayan-patel': { distinctness: rate(0, 0) },
        },
      },
      humanness: { overall: rate(11, 20), matched: rate(5, 10) },
    };
    const reports = barReports(run, 'bar-20261021-abcdef');
    expect(reports.map((r) => r.scenario)).toEqual(['bar', 'ferni']);
    expect(reports[0]?.flags).toEqual(['PERSONA_VOICE']);
    await expect(reportIfBq(true, reports)).resolves.toBe(9);
    expect(rows.map((r) => [r.scenario, r.metric, r.value])).toEqual([
      ['bar', 'distinctness', 0.6],
      ['bar', 'copy_rate', 0.1],
      ['bar', 'humanness_win', 0.55],
      ['bar', 'humanness_matched_win', 0.5],
      ['bar', 'tell_question', 0.3],
      ['bar', 'tell_opener', 0.1],
      ['bar', 'tell_checkin', 0],
      ['bar', 'tell_exclaim', 0.2],
      ['ferni', 'distinctness', 0.5],
    ]);
  });
});
