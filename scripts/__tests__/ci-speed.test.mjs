import { describe, expect, it, vi } from 'vitest';
import {
  DELAYS_MS,
  gh,
  GhUnavailable,
  outcomes,
  quantile,
  report,
  runnerWait,
  waits,
  wallMinutes,
} from '../ci/ci-speed.mjs';

/** What execFileSync throws when gh exits non-zero: stderr carries gh's message. */
function ghFailure(stderr) {
  return Object.assign(new Error(`Command failed: gh api x\n${stderr}`), { status: 1, stderr });
}

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

  describe('gh calls', () => {
    const quiet = { warn: () => {} };

    it('retries a 502 and returns the next answer', () => {
      const run = vi
        .fn()
        .mockImplementationOnce(() => {
          throw ghFailure('gh: Server Error (HTTP 502)\n');
        })
        .mockReturnValueOnce('{"jobs":[]}');
      const wait = vi.fn();
      expect(gh(['api', 'x'], { run, wait, ...quiet })).toEqual({ jobs: [] });
      expect(run).toHaveBeenCalledTimes(2);
      expect(wait.mock.calls).toEqual([[2000]]);
    });

    it('gives up after 3 tries, 2 s then 6 s apart', () => {
      const run = vi.fn(() => {
        throw ghFailure('gh: Server Error (HTTP 503)\n');
      });
      const wait = vi.fn();
      expect(() => gh(['api', 'x'], { run, wait, ...quiet })).toThrow(GhUnavailable);
      expect(run).toHaveBeenCalledTimes(3);
      expect(wait.mock.calls).toEqual([[2000], [6000]]);
      expect(DELAYS_MS).toEqual([2000, 6000]);
    });

    it('retries a network error', () => {
      const run = vi
        .fn()
        .mockImplementationOnce(() => {
          throw ghFailure('error connecting to api.github.com\n');
        })
        .mockReturnValueOnce('[]');
      expect(gh(['api', 'x'], { run, wait: () => {}, ...quiet })).toEqual([]);
    });

    it('fails at once on an auth error or bad JSON', () => {
      const denied = vi.fn(() => {
        throw ghFailure('gh: Bad credentials (HTTP 401)\n');
      });
      expect(() => gh(['api', 'x'], { run: denied, wait: () => {}, ...quiet })).toThrow('HTTP 401');
      expect(denied).toHaveBeenCalledTimes(1);

      const garbled = vi.fn(() => '<html>');
      expect(() => gh(['api', 'x'], { run: garbled, wait: () => {}, ...quiet })).toThrow(SyntaxError);
      expect(garbled).toHaveBeenCalledTimes(1);
    });

    it('leaves out a run GitHub will not serve, names it, and fails on anything else', () => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = { id: 7, created_at: '2026-10-18T18:00:00Z' };
      const jobs = [
        { name: 'Setup', started_at: '2026-10-18T18:05:00Z', completed_at: '2026-10-18T18:07:00Z' },
        { name: 'Unit Tests', started_at: '2026-10-18T18:10:00Z' },
      ];
      const call = vi.fn((args) => {
        if (args[1].includes('/runs/8/')) throw new GhUnavailable(args, ghFailure('HTTP 502'));
        return { jobs };
      });
      const skipped = [];
      expect(waits('o/r', [run, { ...run, id: 8 }], 60, skipped, call)).toEqual([8, null]);
      expect(skipped).toEqual([8]);
      expect(stderr.mock.calls[0][0]).toMatch(/^::warning::CI speed: left out run 8: /);
      stderr.mockRestore();

      const text = report({
        hours: 24, prWait: { p50: 8, p90: 8, n: 1 }, mgWait: { p50: null, p90: null, n: 0 },
        mgPass: { p50: null, p90: null, n: 0 }, merge: { p50: null, p90: null, n: 0 },
        mg: outcomes([]), mgRuns: 0, merged: 0, skipped,
      });
      expect(text).toContain('**Warning:** 1 run(s) left out');
      expect(text).toContain('(8)');

      const broken = () => {
        throw new SyntaxError('Unexpected token');
      };
      expect(() => waits('o/r', [run], 60, [], broken)).toThrow(SyntaxError);
    });
  });
});
