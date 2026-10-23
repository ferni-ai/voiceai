import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { notBehindSetupOnly, outcomes, quantile, report, runnerWait, wallMinutes } from '../ci/ci-speed.mjs';

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
      { name: 'Unit Tests (2/4)', started_at: '2026-10-18T18:37:00Z' },
      { name: 'Lint & Type Check', started_at: '2026-10-18T18:10:00Z' },
      { name: 'Build', started_at: '2026-10-18T19:30:00Z' },
      { name: 'Overlay Gallery', conclusion: 'skipped', started_at: '2026-10-18T19:59:00Z' },
    ];
    // 5 min for Setup, then a unit shard waited 30 min after Setup finished; Build
    // (which waits on the tests) and skipped jobs don't count.
    expect(runnerWait(run, jobs)).toBe(35);
    expect(runnerWait(run, jobs.slice(0, 1))).toBeNull();
    expect(runnerWait(run, [{ name: 'Unit Tests (2/4)', started_at: '2026-10-18T18:37:00Z' }])).toBeNull();
  });

  // The "Unit Tests" gate needs its shards, so it starts ~11 min after Setup only
  // because the shards ran that long; counting it called shard run time runner wait.
  it('leaves out jobs that need more than Setup (the Unit Tests gate, Build)', () => {
    const run = { created_at: '2026-10-23T08:00:00Z' };
    const jobs = [
      {
        name: 'Setup & Cache Dependencies',
        started_at: '2026-10-23T08:01:00Z',
        completed_at: '2026-10-23T08:02:00Z',
      },
      { name: 'Unit Tests (1/4)', started_at: '2026-10-23T08:03:00Z' },
      { name: 'Unit Tests (2/4)', started_at: '2026-10-23T08:02:30Z' },
      { name: 'Lint & Type Check', started_at: '2026-10-23T08:02:00Z' },
      { name: 'Unit Tests', started_at: '2026-10-23T08:14:00Z' },
      { name: 'Build', started_at: '2026-10-23T08:20:00Z' },
    ];
    // 1 min for Setup + 1 min until the last shard started; the gate's 08:14 start is not wait.
    expect(runnerWait(run, jobs)).toBe(2);
    // The same run with the gate counted, which is what the old rule did.
    expect(runnerWait(run, jobs, [/^Build$/])).toBe(13);
  });

  it('reads which jobs need more than Setup from the workflow', () => {
    const wf = [
      'name: CI',
      'jobs:',
      '  setup:',
      '    name: Setup',
      '  lint:',
      '    name: Lint',
      '    needs: setup',
      '  shard:',
      '    name: Unit Tests (${{ matrix.shard }}/4)',
      '    needs: setup',
      '  gate:',
      '    name: Unit Tests',
      '    needs: [setup, shard]',
      '  build:',
      '    name: Build',
      '    needs:',
      '      - setup',
      '      - lint',
      '',
    ].join('\n');
    const ex = notBehindSetupOnly(wf);
    const hit = (n) => ex.some((re) => re.test(n));
    expect(['Unit Tests', 'Build'].every(hit)).toBe(true);
    expect(['Setup', 'Lint', 'Unit Tests (1/4)'].some(hit)).toBe(false);
    // and from the real ci.yml: the gate and Build, not the shards or Lint
    const real = notBehindSetupOnly(
      readFileSync(join(__dirname, '../../.github/workflows/ci.yml'), 'utf8')
    );
    const realHit = (n) => real.some((re) => re.test(n));
    expect(realHit('Unit Tests') && realHit('Build')).toBe(true);
    expect(
      realHit('Unit Tests (3/4)') ||
        realHit('Lint & Type Check') ||
        realHit('Integration Tests (1/3)')
    ).toBe(false);
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
