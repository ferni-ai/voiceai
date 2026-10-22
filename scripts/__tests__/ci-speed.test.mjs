import { describe, expect, it } from 'vitest';
import { outcomes, quantile, report, runnerWait, wallMinutes } from '../ci/ci-speed.mjs';

describe('ci-speed', () => {
  it('takes nearest-rank quantiles and ignores non-numbers', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(quantile([NaN, 7], 0.5)).toBe(7);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('measures runner wait as Setup\'s wait plus the slowest wait behind it', () => {
    const run = { created_at: '2026-10-18T18:00:00Z' };
    const jobs = [
      { name: 'Setup & Cache Dependencies', started_at: '2026-10-18T18:05:00Z', completed_at: '2026-10-18T18:07:00Z' },
      { name: 'Unit Tests', started_at: '2026-10-18T18:37:00Z' },
      { name: 'Lint & Type Check', started_at: '2026-10-18T18:10:00Z' },
      { name: 'Build', started_at: '2026-10-18T19:30:00Z' },
      { name: 'Overlay Gallery', conclusion: 'skipped', started_at: '2026-10-18T19:59:00Z' },
    ];
    // 5 min for Setup, then Unit Tests waited 30 min after Setup finished; Build
    // (which waits on the tests) and skipped jobs don't count.
    expect(runnerWait(run, jobs)).toBe(35);
    expect(runnerWait(run, jobs.slice(0, 1))).toBeNull();
    expect(runnerWait(run, [{ name: 'Unit Tests', started_at: '2026-10-18T18:37:00Z' }])).toBeNull();
  });

  it('times a run from creation to its last update', () => {
    expect(wallMinutes({ created_at: '2026-10-18T18:00:00Z', updated_at: '2026-10-18T18:45:00Z' })).toBe(45);
  });

  it('counts failures only among runs that reached a verdict', () => {
    const o = outcomes([
      { conclusion: 'failure' },
      { conclusion: 'failure' },
      { conclusion: 'success' },
      { conclusion: 'cancelled' },
      { conclusion: null, status: 'queued' },
    ]);
    expect(o.by).toEqual({ failure: 2, success: 1, cancelled: 1, queued: 1 });
    expect(o.failureRate).toBeCloseTo(2 / 3);
    expect(outcomes([{ conclusion: 'cancelled' }]).failureRate).toBeNull();
  });

  it('reports the numbers and the 15 minute target', () => {
    const s = (p50) => ({ p50, p90: p50 * 2, n: 3 });
    const text = report({
      hours: 24, prWait: s(30), mgWait: s(45), mgPass: s(40), merge: s(120),
      mg: outcomes([{ conclusion: 'failure' }, { conclusion: 'success' }]), mgRuns: 2, merged: 1,
    });
    expect(text).toContain('| Merge queue CI: wait for a runner | 45 min | 90 min | 3 |');
    expect(text).toContain('**50% of verdicts failed**');
    expect(text).toContain('2.0 queue runs per merge');
    expect(text).toContain('under 15 min');
  });
});
