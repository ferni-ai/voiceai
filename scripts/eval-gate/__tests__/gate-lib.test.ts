import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compare, failed, readBaseline, rebaseline, table, type Baseline } from '../gate-lib.js';
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

describe('offline suite against its committed baseline', () => {
  it('measures every baseline metric, and main is inside every band', () => {
    const path = fileURLToPath(new URL('../../../evals/baselines/offline.json', import.meta.url));
    const rows = compare(readBaseline(path), measureOffline());
    expect(rows.filter((r) => r.status === 'MISSING' || r.status === 'REGRESSED')).toEqual([]);
  });
});
