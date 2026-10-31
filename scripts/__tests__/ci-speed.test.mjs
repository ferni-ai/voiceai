import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DELAYS_MS,
  gh,
  GhUnavailable,
  MAX_SKIP_STREAK,
  newSkips,
  notBehindSetupOnly,
  outcomes,
  quantile,
  report,
  runnerWait,
  tooManySkipped,
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

  it("measures runner wait as Setup's wait plus the slowest wait behind it", () => {
    const run = { created_at: '2026-10-18T18:00:00Z' };
    const jobs = [
      {
        name: 'Setup & Cache Dependencies',
        started_at: '2026-10-18T18:05:00Z',
        completed_at: '2026-10-18T18:07:00Z',
      },
      { name: 'Unit Tests (2/4)', started_at: '2026-10-18T18:37:00Z' },
      { name: 'Lint & Type Check', started_at: '2026-10-18T18:10:00Z' },
      { name: 'Build', started_at: '2026-10-18T19:30:00Z' },
      { name: 'Overlay Gallery', conclusion: 'skipped', started_at: '2026-10-18T19:59:00Z' },
    ];
    // 5 min for Setup, then a unit shard waited 30 min after Setup finished; Build
    // (which waits on the tests) and skipped jobs don't count.
    expect(runnerWait(run, jobs)).toBe(35);
    expect(runnerWait(run, jobs.slice(0, 1))).toBeNull();
    expect(
      runnerWait(run, [{ name: 'Unit Tests (2/4)', started_at: '2026-10-18T18:37:00Z' }])
    ).toBeNull();
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
    expect(
      wallMinutes({ created_at: '2026-10-18T18:00:00Z', updated_at: '2026-10-18T18:45:00Z' })
    ).toBe(45);
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
      hours: 24,
      prWait: s(30),
      mgWait: s(45),
      mgPass: s(40),
      merge: s(120),
      mg: outcomes([{ conclusion: 'failure' }, { conclusion: 'success' }]),
      mgRuns: 2,
      merged: 1,
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
      expect(() => gh(['api', 'x'], { run: garbled, wait: () => {}, ...quiet })).toThrow(
        SyntaxError
      );
      expect(garbled).toHaveBeenCalledTimes(1);
    });

    it('leaves out a run GitHub will not serve, names it, and fails on anything else', () => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const run = { id: 7, created_at: '2026-10-18T18:00:00Z' };
      const jobs = [
        { name: 'Setup', started_at: '2026-10-18T18:05:00Z', completed_at: '2026-10-18T18:07:00Z' },
        { name: 'Unit Tests (1/4)', started_at: '2026-10-18T18:10:00Z' },
      ];
      const call = vi.fn((args) => {
        if (args[1].includes('/runs/8/')) throw new GhUnavailable(args, ghFailure('HTTP 502'));
        return { jobs };
      });
      const skips = newSkips();
      expect(waits('o/r', [run, { ...run, id: 8 }], 60, skips, call)).toEqual([8, null]);
      expect(skips.skipped).toEqual([8]);
      expect(stderr.mock.calls[0][0]).toMatch(/^::warning::CI speed: left out run 8: /);
      stderr.mockRestore();

      const text = report({
        hours: 24,
        prWait: { p50: 8, p90: 8, n: 1 },
        mgWait: { p50: null, p90: null, n: 0 },
        mgPass: { p50: null, p90: null, n: 0 },
        merge: { p50: null, p90: null, n: 0 },
        mg: outcomes([]),
        mgRuns: 0,
        merged: 0,
        skips,
      });
      expect(text).toContain('**Warning:** 1 run(s) left out');
      expect(text).toContain('(8)');

      const broken = () => {
        throw new SyntaxError('Unexpected token');
      };
      expect(() => waits('o/r', [run], 60, newSkips(), broken)).toThrow(SyntaxError);
    });

    // GitHub's jobs API down for the whole run: the lists load, every jobs call 5xxs.
    const runs = (n) =>
      Array.from({ length: n }, (_, i) => ({ id: i + 1, created_at: '2026-10-18T18:00:00Z' }));
    const unavailable = (args) => {
      throw new GhUnavailable(args, ghFailure('HTTP 502'));
    };
    const jobsOk = () => ({
      jobs: [
        { name: 'Setup', started_at: '2026-10-18T18:05:00Z', completed_at: '2026-10-18T18:07:00Z' },
        { name: 'Unit Tests (1/4)', started_at: '2026-10-18T18:10:00Z' },
      ],
    });

    it("stops trying after 3 runs in a row fail, so it can't outlast the job", () => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const call = vi.fn(unavailable);
      const skips = newSkips();
      // Shared across both lists, as main() measures PR runs then queue runs.
      waits('o/r', runs(2), 60, skips, call);
      waits('o/r', runs(4), 60, skips, call);
      expect(MAX_SKIP_STREAK).toBe(3);
      expect(call).toHaveBeenCalledTimes(3);
      expect(skips).toMatchObject({ attempted: 3, notAttempted: 3 });

      // A run that loads resets the streak.
      const flaky = vi.fn((args) => (args[1].includes('/runs/3/') ? jobsOk() : unavailable(args)));
      const k = newSkips();
      waits('o/r', runs(7), 60, k, flaky);
      expect(flaky).toHaveBeenCalledTimes(6); // 1, 2 fail; 3 loads; 4, 5, 6 fail; 7 not tried
      expect(k).toMatchObject({ attempted: 6, notAttempted: 1, skipped: [1, 2, 4, 5, 6] });
      stderr.mockRestore();
    });

    it('calls the report incomplete, and the job failed, when more than half the runs are missing', () => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const all = newSkips();
      waits('o/r', runs(5), 60, all, unavailable);
      expect(tooManySkipped(all)).toBe(true); // every attempted run skipped

      const some = newSkips();
      waits('o/r', runs(3), 60, some, (args) =>
        args[1].includes('/runs/2/') ? unavailable(args) : jobsOk()
      );
      expect(tooManySkipped(some)).toBe(false); // 1 of 3
      const most = newSkips();
      waits('o/r', runs(3), 60, most, (args) =>
        args[1].includes('/runs/1/') ? jobsOk() : unavailable(args)
      );
      expect(tooManySkipped(most)).toBe(true); // 2 of 3
      expect(tooManySkipped(newSkips())).toBe(false);
      stderr.mockRestore();

      const none = { p50: null, p90: null, n: 0 };
      const text = report({
        hours: 24,
        prWait: none,
        mgWait: none,
        mgPass: none,
        merge: none,
        mg: outcomes([]),
        mgRuns: 0,
        merged: 0,
        skips: all,
      });
      expect(text).toContain('stopped after 3 runs in a row failed; 2 more run(s) not measured');
      expect(text).toContain('more than half the runs could not be read');
    });
  });

  describe('more than half missing, at the edges', () => {
    const runs = (n, from = 1) =>
      Array.from({ length: n }, (_, i) => ({ id: from + i, created_at: '2026-10-18T18:00:00Z' }));
    const ok = () => ({
      jobs: [
        { name: 'Setup', started_at: '2026-10-18T18:05:00Z', completed_at: '2026-10-18T18:07:00Z' },
        { name: 'Unit Tests (1/4)', started_at: '2026-10-18T18:10:00Z' },
      ],
    });
    /** Jobs calls for these run ids are unavailable; every other run loads. */
    const failing = (ids) => (args) => {
      if (ids.some((id) => args[1].includes(`/runs/${id}/`))) {
        throw new GhUnavailable(args, ghFailure('HTTP 502'));
      }
      return ok();
    };
    const measure = (list, ids) => {
      const k = newSkips();
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
      waits('o/r', list, 1000, k, failing(ids));
      stderr.mockRestore();
      return k;
    };

    it('counts runs it stopped trying as missing: 20 read, 3 failed, 100 untried', () => {
      const k = measure(runs(123), [21, 22, 23]);
      expect(k).toMatchObject({ attempted: 23, notAttempted: 100 });
      expect(k.skipped).toEqual([21, 22, 23]);
      // 103 of 123 missing; counting only tried runs it would be 3 of 23.
      expect(tooManySkipped(k)).toBe(true);
    });

    it('exactly half missing is not more than half', () => {
      const k = measure(runs(4), [1, 3]); // not in a row, so all 4 are tried
      expect(k).toMatchObject({ attempted: 4, notAttempted: 0, skipped: [1, 3] });
      expect(tooManySkipped(k)).toBe(false);
    });

    it('between a third and a half missing passes', () => {
      const k = measure(runs(5), [1, 3]); // 2 of 5 = 40%
      expect(k).toMatchObject({ attempted: 5, skipped: [1, 3] });
      expect(tooManySkipped(k)).toBe(false);
      expect(tooManySkipped(measure(runs(5), [1, 3, 5]))).toBe(true); // 3 of 5
    });
  });

  describe('the script, run as the workflow runs it', () => {
    // A stub gh on PATH: one PR run, no merge-queue runs, and the run's jobs call
    // answers per GH_STUB. One run keeps the outage case to one retry cycle (8 s).
    const script = fileURLToPath(new URL('../ci/ci-speed.mjs', import.meta.url));
    const stub = `#!/usr/bin/env bash
case "$*" in
  *"/jobs?"*)
    if [ "$GH_STUB" = down ]; then echo 'gh: Server Error (HTTP 502)' >&2; exit 1; fi
    echo '{"jobs":[{"name":"Setup","started_at":"2026-10-23T00:05:00Z","completed_at":"2026-10-23T00:07:00Z"},{"name":"Unit Tests (1/4)","started_at":"2026-10-23T00:10:00Z"}]}';;
  *"event=pull_request"*) echo '{"workflow_runs":[{"id":1,"created_at":"2026-10-23T00:00:00Z","updated_at":"2026-10-23T00:30:00Z","conclusion":"success"}]}';;
  *"workflows/ci.yml/runs"*) echo '{"workflow_runs":[]}';;
  "pr list"*) echo '[]';;
  *) echo "unexpected gh $*" >&2; exit 2;;
esac
`;
    function run(mode) {
      const dir = mkdtempSync(join(tmpdir(), 'ci-speed-gh-'));
      try {
        writeFileSync(join(dir, 'gh'), stub);
        chmodSync(join(dir, 'gh'), 0o755);
        return spawnSync(process.execPath, [script, '--hours', '24'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            GITHUB_REPOSITORY: 'o/r',
            GH_STUB: mode,
          },
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('exits 1 after printing the report when GitHub serves no jobs at all', () => {
      const down = run('down');
      expect(down.stdout).toContain('## CI speed, last 24 h');
      expect(down.stdout).toContain('more than half the runs could not be read');
      expect(down.stderr).toContain('::error::CI speed');
      expect(down.status).toBe(1);

      const up = run('up');
      expect(up.stdout).toContain('| PR CI: wait for a runner | 8 min | 8 min | 1 |');
      expect(up.status).toBe(0);
    }, 30_000);
  });
});
