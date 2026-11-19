/**
 * report() is the one line between a red table and a red job: the offline and
 * model entries (and any later one) pass its return value to process.exit.
 * Changed to `return 0`, every other test in this folder stayed green, so these
 * rows read the number itself, the entries are read for what they do with it,
 * and the workflow is read for anything that would let a failed entry pass.
 *
 * Not seen here: `process.exit(report(...) && 0)` in an entry; what the earlier
 * workflow step does that sets the output a condition reads; and whether the
 * job is a required check (that is the repository's ruleset, not a file here).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { report, serialize, type Baseline } from '../gate-lib.js';

const BASE: Baseline = {
  suite: 'test',
  update: 'pnpm x --write-baseline',
  measuredOn: 'abc',
  metrics: {
    'a.recall': { value: 0.8, maxDrop: 0.02 },
    'a.false_positives': { value: 2, maxRise: 1 },
    'b.recall': { value: 0.9, maxDrop: 0.02 },
  },
};
const INSIDE = { 'a.recall': 0.8, 'a.false_positives': 2, 'b.recall': 0.9 };

describe('report: the exit code', () => {
  let dir: string;
  let path: string;
  let summary: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-gate-report-'));
    path = join(dir, 'baseline.json');
    summary = join(dir, 'summary.md');
    writeFileSync(path, serialize(BASE));
    // CI sets GITHUB_STEP_SUMMARY for the test step too: keep these tables out of the real one.
    vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is 0 when every metric is inside its band', () => {
    expect(report(path, INSIDE, [])).toBe(0);
    expect(readFileSync(summary, 'utf8')).toContain('### test passed');
  });

  it('is 1 when a metric drops past its band, and the summary says FAILED', () => {
    expect(report(path, { ...INSIDE, 'a.recall': 0.7 }, [])).toBe(1);
    expect(readFileSync(summary, 'utf8')).toContain('### test FAILED');
  });

  it('is 1 when a metric rises past its band', () => {
    expect(report(path, { ...INSIDE, 'a.false_positives': 4 }, [])).toBe(1);
  });

  it('is 1 when the run did not measure a metric, or measured NaN', () => {
    const { 'b.recall': _gone, ...rest } = INSIDE;
    expect(report(path, rest, [])).toBe(1);
    expect(report(path, { ...INSIDE, 'b.recall': Number.NaN }, [])).toBe(1);
  });

  it('with suites, is 1 for a drop in a suite that ran and 0 for one in a suite that did not', () => {
    const dropInB = { ...INSIDE, 'b.recall': 0.5 };
    expect(report(path, dropInB, [], ['b'])).toBe(1);
    expect(report(path, dropInB, [], ['a'])).toBe(0);
  });

  it('is 0 after --write-baseline, which takes the new values and keeps the bands', () => {
    expect(report(path, { ...INSIDE, 'a.recall': 0.7 }, ['--write-baseline'])).toBe(0);
    const written = JSON.parse(readFileSync(path, 'utf8')) as Baseline;
    expect(written.metrics['a.recall']).toEqual({ value: 0.7, maxDrop: 0.02 });
    // The same run is inside the band it just wrote.
    expect(report(path, { ...INSIDE, 'a.recall': 0.7 }, [])).toBe(0);
  });
});

const folder = fileURLToPath(new URL('..', import.meta.url));
/** Code lines only: a `report(` in a comment is not a call. */
const code = (file: string): string =>
  readFileSync(join(folder, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
    .join('\n');
/** Every file in this folder that names report(): the entries, found and not listed. */
const entries = readdirSync(folder).filter(
  (f) => f.endsWith('.ts') && f !== 'gate-lib.ts' && /\breport\b/.test(code(f))
);

describe('the entries hand report() to process.exit', () => {
  it('finds the offline, the model and the benchmark entry', () => {
    expect(entries).toEqual(expect.arrayContaining(['bth.ts', 'model.ts', 'offline.ts']));
  });

  it.each(entries)('%s: every report() call is the argument of process.exit', (file) => {
    const src = code(file);
    const calls = src.match(/\breport\(/g) ?? [];
    const exits = src.match(/process\.exit\(report\(/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(exits.length).toBe(calls.length);
  });
});

interface Step {
  name?: string;
  if?: string;
  run?: string;
  shell?: string;
  'continue-on-error'?: unknown;
}
interface Job {
  if?: string;
  steps?: Step[];
  'continue-on-error'?: unknown;
}

describe('the workflow lets a failed entry fail its job', () => {
  const file = fileURLToPath(new URL('../../../.github/workflows/eval-gate.yml', import.meta.url));
  const workflow = parse(readFileSync(file, 'utf8')) as {
    on: Record<string, unknown>;
    jobs: Record<string, Job>;
  };
  const stepsFor = (entry: string): Array<{ job: Job; step: Step }> =>
    Object.values(workflow.jobs).flatMap((job) =>
      (job.steps ?? [])
        .filter((step) => step.run?.includes(`scripts/eval-gate/${entry}`))
        .map((step) => ({ job, step }))
    );

  /**
   * The conditions on an entry's step and on its job, as read. Each can be true on a pull
   * request. A new or changed condition is red until someone reads it and writes it here.
   */
  const READ = [
    // offline job: pull requests and manual runs (not the merge queue: free, and run on the PR).
    "github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'",
    // offline step: the PR changed a file on the eval paths.
    "steps.paths.outputs.run == 'true'",
    // model job: everything but a fork's pull request (a fork gets no token; the queue measures it).
    "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository",
    // model step: the change can move at least one suite.
    "steps.decide.outputs.suites != ''",
  ];

  it('runs on pull requests and in the merge queue', () => {
    expect(Object.keys(workflow.on)).toEqual(
      expect.arrayContaining(['pull_request', 'merge_group'])
    );
  });

  it.each(entries)('%s: its step is the bare command, with no way to pass on failure', (entry) => {
    const found = stepsFor(entry);
    expect(found.length).toBeGreaterThan(0);
    for (const { job, step } of found) {
      // The whole line: `|| true`, `set +e`, a pipe or a second command would all change it.
      expect(step.run?.trim()).toBe(`pnpm tsx scripts/eval-gate/${entry}`);
      expect(step.shell).toBeUndefined();
      expect(step['continue-on-error']).toBeUndefined();
      expect(job['continue-on-error']).toBeUndefined();
    }
  });

  it.each(entries)('%s: the conditions on its step and its job are ones read here', (entry) => {
    for (const { job, step } of stepsFor(entry)) {
      expect(READ).toContain(step.if);
      expect(READ).toContain(job.if);
    }
  });
});
