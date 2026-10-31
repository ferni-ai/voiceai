import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  compare,
  failed,
  onlySuites,
  readBaseline,
  rebaseline,
  selectSuites,
  table,
  type Baseline,
} from '../gate-lib.js';
import { measureOffline } from '../offline.js';

const base: Baseline = {
  suite: 'test',
  update: 'pnpm x --write-baseline',
  measuredOn: 'abc',
  metrics: {
    recall: { value: 0.8, maxDrop: 0.02 },
    falsePositives: { value: 2, maxRise: 1 },
  },
};

describe('compare', () => {
  it('passes values inside the band', () => {
    const rows = compare(base, { recall: 0.79, falsePositives: 3 });
    expect(rows.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(failed(rows)).toBe(false);
  });

  it('fails a drop past maxDrop', () => {
    const rows = compare(base, { recall: 0.77, falsePositives: 2 });
    expect(rows[0].status).toBe('REGRESSED');
    expect(failed(rows)).toBe(true);
  });

  it('fails a rise past maxRise', () => {
    const rows = compare(base, { recall: 0.8, falsePositives: 4 });
    expect(rows[1].status).toBe('REGRESSED');
    expect(failed(rows)).toBe(true);
  });

  it('fails a metric the run did not measure, or measured as NaN', () => {
    expect(failed(compare(base, { recall: 0.8 }))).toBe(true);
    expect(failed(compare(base, { recall: Number.NaN, falsePositives: 2 }))).toBe(true);
  });

  it('marks improvements without failing, and the table says how to re-baseline', () => {
    const rows = compare(base, { recall: 0.9, falsePositives: 0 });
    expect(rows.map((r) => r.status)).toEqual(['improved', 'improved']);
    expect(failed(rows)).toBe(false);
    expect(table(base, rows)).toContain('pnpm x --write-baseline');
  });

  it('refuses a baseline metric with no threshold', () => {
    const bad: Baseline = { ...base, metrics: { x: { value: 1 } } };
    expect(() => compare(bad, { x: 1 })).toThrow(/maxDrop or maxRise/);
  });
});

describe('rebaseline', () => {
  it('keeps the bands and takes the new values', () => {
    const next = rebaseline(base, { recall: 0.85, falsePositives: 1 }, 'def');
    expect(next.metrics.recall).toEqual({ value: 0.85, maxDrop: 0.02 });
    expect(next.measuredOn).toBe('def');
  });

  it('refuses when a metric was not measured', () => {
    expect(() => rebaseline(base, { recall: 0.85 }, 'def')).toThrow(/not measured/);
  });
});

const model: Baseline = {
  suite: 'model',
  update: 'pnpm y --write-baseline',
  measuredOn: 'abc',
  metrics: {
    'semantic_recall.hit_rate': { value: 0.8, maxDrop: 0.02 },
    'crisis_classifier.recall': { value: 0.99, maxDrop: 0.01 },
    'crisis_classifier.errors': { value: 0, maxRise: 3 },
    'tool_retrieval.router.recall_at_5': { value: 0.71, maxDrop: 0.03 },
  },
};
const ALL = ['semantic_recall', 'crisis_classifier', 'tool_retrieval'];

describe('selectSuites', () => {
  it('runs every suite when EVAL_GATE_SUITES is unset or blank', () => {
    expect(selectSuites(undefined, ALL)).toEqual(ALL);
    expect(selectSuites(' ', ALL)).toEqual(ALL);
  });

  it('keeps the listed suites in run order', () => {
    expect(selectSuites('tool_retrieval, crisis_classifier', ALL)).toEqual([
      'crisis_classifier',
      'tool_retrieval',
    ]);
  });

  it('refuses a suite it does not know, so a typo cannot read green', () => {
    expect(() => selectSuites('crisis', ALL)).toThrow(/unknown eval suite\(s\): crisis/);
  });
});

describe('onlySuites', () => {
  const crisisOnly = { 'crisis_classifier.recall': 0.99, 'crisis_classifier.errors': 0 };

  it('compares only the suites that ran', () => {
    // The full baseline fails a crisis-only run: the other suites read MISSING.
    expect(failed(compare(model, crisisOnly))).toBe(true);
    const rows = compare(onlySuites(model, ['crisis_classifier']), crisisOnly);
    expect(rows.map((r) => r.metric)).toEqual(Object.keys(crisisOnly));
    expect(failed(rows)).toBe(false);
  });

  it('still fails a regression or a missing metric inside a suite that ran', () => {
    const only = onlySuites(model, ['crisis_classifier']);
    expect(failed(compare(only, { ...crisisOnly, 'crisis_classifier.recall': 0.97 }))).toBe(true);
    expect(failed(compare(only, { 'crisis_classifier.errors': 0 }))).toBe(true);
  });

  it('names the subset in the table, and refuses a suite with no metrics', () => {
    expect(onlySuites(model, ['crisis_classifier']).suite).toBe('model, only crisis_classifier');
    expect(onlySuites(model, ALL).suite).toBe('model');
    expect(() => onlySuites(model, ['memory'])).toThrow(/no baseline metrics for memory/);
  });
});

describe('offline suite against its committed baseline', () => {
  it('measures every baseline metric, and main is inside every band', () => {
    const path = fileURLToPath(new URL('../../../evals/baselines/offline.json', import.meta.url));
    const rows = compare(readBaseline(path), measureOffline());
    expect(rows.filter((r) => r.status === 'MISSING' || r.status === 'REGRESSED')).toEqual([]);
  });
});
