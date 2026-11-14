/**
 * The "better than human" benchmark ran nightly and on pull requests and could
 * not fail: it compared with a previous report that no caller passed in, so its
 * list of regressions was always empty. scripts/eval-gate/bth.ts now compares
 * the benchmark's counts with evals/baselines/bth.json. These rows hold that
 * file to this tree, recount the benchmark without its runner, and keep the
 * file from being loosened.
 *
 * Not seen here: the crisis_detection capability (not gated yet); a row whose
 * expected answer is edited (a diff in the rows file, which reads as "improved"
 * here); and whether the offline job is a required check (the repository's
 * ruleset, not a file here).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// The unsaid-signals detector keeps a profile per user and saves it; nothing is stored here.
vi.mock('../../../src/services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
  cleanForFirestore: vi.fn((obj: unknown) => obj),
  removeUndefined: vi.fn((obj: unknown) => obj),
  deepRemoveUndefined: vi.fn((obj: unknown) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({ dbAvailable: true, initialized: true })),
  resetFirestoreInstance: vi.fn(),
}));

import type { AdversarialTestCase } from '../../../src/services/better-than-human-validation/types.js';
import { detectCommitment } from '../../../src/services/superhuman/commitment-keeper.js';
import { COMMITMENT_TEST_CASES } from '../../../src/services/superhuman/validation/capability-benchmark.js';
import { READING_BETWEEN_LINES_CASES } from '../../../src/services/superhuman/validation/reading-between-lines-cases.js';
import { detectUnsaidSignals } from '../../../src/services/trust-systems/reading-between-lines.js';
import { CAPABILITIES, measureBth } from '../bth.js';
import { compare, readBaseline, report, serialize } from '../gate-lib.js';

const BASELINE = fileURLToPath(new URL('../../../evals/baselines/bth.json', import.meta.url));
const baseline = readBaseline(BASELINE);

/** Counts where higher is better, and counts where lower is better. */
const NO_DROP = ['rows', 'true_positives', 'true_negatives', 'f1'];
const NO_RISE = ['false_positives', 'false_negatives'];

/**
 * A re-baseline can record a worse number; it cannot go under these without a
 * second, separate edit here. Measured on main 7c43c1fb6.
 */
const FLOOR: Record<string, number> = {
  'commitment_detection.rows': 48,
  'commitment_detection.f1': 0.6818,
  'reading_between_lines.rows': 39,
  'reading_between_lines.f1': 0.5333,
};

/** Each capability's rows, and its detector asked as a user nobody has seen before. */
const DIRECT: Record<
  (typeof CAPABILITIES)[number],
  { rows: AdversarialTestCase[]; detect: (input: string, user: string) => boolean }
> = {
  commitment_detection: {
    rows: COMMITMENT_TEST_CASES,
    detect: (input, user) => detectCommitment(input, user).detected,
  },
  reading_between_lines: {
    rows: READING_BETWEEN_LINES_CASES,
    detect: (input, user) => detectUnsaidSignals(user, input, { recentTopics: [] }).length > 0,
  },
};

let measured: Record<string, number>;
beforeAll(async () => {
  measured = await measureBth();
});

describe('the benchmark against its committed baseline', () => {
  it('measures every baseline metric, and every one is the baseline value', () => {
    // 'improved' is listed too: a better count is recorded in the same change.
    const moved = compare(baseline, measured).filter((row) => row.status !== 'ok');
    expect(moved).toEqual([]);
  });

  it('measures nothing the baseline does not hold', () => {
    expect(Object.keys(measured).sort()).toEqual(Object.keys(baseline.metrics).sort());
  });
});

describe('the counts are what the detectors answer, one row at a time', () => {
  it.each(CAPABILITIES)('%s: a recount with a new user for every row', (capability) => {
    const { rows, detect } = DIRECT[capability];
    const cell = { true_positives: 0, true_negatives: 0, false_positives: 0, false_negatives: 0 };
    rows.forEach((row, i) => {
      if (row.expectedResult.expectedValue === 'maybe') return;
      // A detector that throws fails this row; the runner would count it as "not detected".
      const detected = detect(row.input, `bth-recount-${capability}-${i}`);
      if (row.expectedResult.shouldDetect) cell[detected ? 'true_positives' : 'false_negatives']++;
      else cell[detected ? 'false_positives' : 'true_negatives']++;
    });
    expect({ rows: rows.length, ...cell }).toEqual({
      rows: measured[`${capability}.rows`],
      true_positives: measured[`${capability}.true_positives`],
      true_negatives: measured[`${capability}.true_negatives`],
      false_positives: measured[`${capability}.false_positives`],
      false_negatives: measured[`${capability}.false_negatives`],
    });
  });
});

describe('the baseline file', () => {
  it('holds these metrics and no others, and every band is 0', () => {
    const expected: Record<string, object> = {};
    for (const capability of CAPABILITIES) {
      for (const m of NO_DROP) expected[`${capability}.${m}`] = { maxDrop: 0 };
      for (const m of NO_RISE) expected[`${capability}.${m}`] = { maxRise: 0 };
    }
    const bands = Object.fromEntries(
      Object.entries(baseline.metrics).map(([name, { value: _value, ...band }]) => [name, band])
    );
    expect(bands).toEqual(expected);
  });

  it('is not under the floor', () => {
    for (const [name, floor] of Object.entries(FLOOR))
      expect(baseline.metrics[name].value, name).toBeGreaterThanOrEqual(floor);
  });

  it('is in the form --write-baseline writes, so a re-baseline is a short diff', () => {
    expect(readFileSync(BASELINE, 'utf8')).toBe(serialize(baseline));
  });
});

describe('the exit code on this baseline', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-gate-bth-'));
    // CI sets GITHUB_STEP_SUMMARY for the test step too: keep these tables out of the real one.
    vi.stubEnv('GITHUB_STEP_SUMMARY', join(dir, 'summary.md'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });
  const exit = (change: Record<string, number>): number =>
    report(BASELINE, { ...measured, ...change }, []);

  it('is 0 on this tree', () => {
    expect(exit({})).toBe(0);
  });

  it.each(CAPABILITIES)('%s: is 1 for one more missed row', (capability) => {
    expect(
      exit({
        [`${capability}.true_positives`]: measured[`${capability}.true_positives`] - 1,
        [`${capability}.false_negatives`]: measured[`${capability}.false_negatives`] + 1,
      })
    ).toBe(1);
  });

  it.each(CAPABILITIES)('%s: is 1 for one more false alarm', (capability) => {
    expect(
      exit({
        [`${capability}.true_negatives`]: measured[`${capability}.true_negatives`] - 1,
        [`${capability}.false_positives`]: measured[`${capability}.false_positives`] + 1,
      })
    ).toBe(1);
  });

  it.each(CAPABILITIES)('%s: is 1 when a missed row is deleted', (capability) => {
    // Fewer misses and a higher F1, from a smaller set: the row count is what goes red.
    expect(
      exit({
        [`${capability}.rows`]: measured[`${capability}.rows`] - 1,
        [`${capability}.false_negatives`]: measured[`${capability}.false_negatives`] - 1,
        [`${capability}.f1`]: measured[`${capability}.f1`] + 0.01,
      })
    ).toBe(1);
  });

  it('is 1 for a capability with no detector or no rows, which the runner reports as zeros', async () => {
    const none = await measureBth(['no_such_capability']);
    expect(none['no_such_capability.rows']).toBe(0);
    const zeros = Object.fromEntries(
      Object.entries(none).map(([name, value]) => [
        name.replace('no_such_capability', 'commitment_detection'),
        value,
      ])
    );
    expect(exit(zeros)).toBe(1);
  });

  it('is 1 when a capability stops reporting', () => {
    const rest = Object.fromEntries(
      Object.entries(measured).filter(([name]) => !name.startsWith('reading_between_lines.'))
    );
    expect(report(BASELINE, rest, [])).toBe(1);
  });
});

describe('the offline job runs for a change to what the benchmark measures', () => {
  const file = fileURLToPath(new URL('../../../.github/workflows/eval-gate.yml', import.meta.url));
  const workflow = parse(readFileSync(file, 'utf8')) as {
    jobs: { offline: { steps: Array<{ id?: string; env?: Record<string, string> }> } };
  };
  const paths = new RegExp(
    workflow.jobs.offline.steps.find((step) => step.id === 'paths')?.env?.PATHS ?? '^$'
  );

  it.each([
    'src/services/superhuman/commitment-keeper.ts',
    'src/services/trust/reading-between-lines.ts',
    'src/services/trust-systems/reading-between-lines.ts',
    'src/services/superhuman/validation/benchmark-runner.ts',
    'src/services/superhuman/validation/capability-benchmark.ts',
    'src/services/superhuman/validation/reading-between-lines-cases.ts',
    'src/services/better-than-human-validation/types.ts',
    'scripts/eval-gate/bth.ts',
    'evals/baselines/bth.json',
  ])('%s is on the path list', (path) => {
    expect(paths.test(path)).toBe(true);
  });

  it('a file outside the list is not', () => {
    expect(paths.test('docs/README.md')).toBe(false);
    expect(paths.test('src/services/calendar/ferni-list.ts')).toBe(false);
  });
});
