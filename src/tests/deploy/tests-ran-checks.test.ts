/**
 * A green test check must mean tests ran (#4550). vitest passes a run that selected
 * nothing, and on pull requests the Integration Tests checks skip every step yet report
 * green in seconds: a PR approved on "every check passed" then failed src/tests/deploy
 * in the merge queue (2026-11-17). These pin the ci.yml wiring:
 * - each guarded vitest run writes a JSON report, and a later step of the same job reads
 *   that report with scripts/ci/assert-tests-ran.mjs, failing an empty run unless the
 *   run narrows the suite to the change (--allow-empty, with the reason);
 * - on a pull request, the Integration Tests checks say on the check that they did not run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name?: string;
  if?: string;
  run?: string;
  'continue-on-error'?: unknown;
}

const ROOT = join(__dirname, '..', '..', '..');
const CI = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
  jobs: Record<string, { steps: Step[] }>;
};
const SCRIPT = 'node scripts/ci/assert-tests-ran.mjs';

function steps(job: string): Step[] {
  const found = CI.jobs[job]?.steps;
  if (!found) throw new Error(`ci.yml: job ${job} has no steps`);
  return found;
}

function stepIndex(job: string, name: string): number {
  const at = steps(job).findIndex((s) => s.name === name);
  if (at === -1) throw new Error(`ci.yml: no "${name}" step in ${job}`);
  return at;
}

/**
 * A vitest run and the step that asserts its report. With `if` undefined, the check's
 * `if:` must equal the run's: it runs exactly when the tests did.
 */
interface Guard {
  job: string;
  run: string;
  check: string;
  report: string;
  allowEmpty: boolean;
  if?: string;
  expect?: string[];
}

const FULL_OR_SHARDED = "env.FULL_SUITE == 'true' || env.AFFECTED_SHARDED == 'true'";
const SMALL_AFFECTED = "env.FULL_SUITE != 'true' && env.AFFECTED_SHARDED != 'true'";

const GUARDS: Guard[] = [
  {
    job: 'test-unit-shard',
    run: 'Run unit tests with coverage',
    check: 'Unit tests ran',
    report: 'unit-report.json',
    allowEmpty: false,
    if: FULL_OR_SHARDED,
  },
  {
    job: 'test-unit-shard',
    run: 'Run unit tests affected by this pull request',
    check: 'Unit tests ran',
    report: 'unit-report.json',
    allowEmpty: false,
    if: FULL_OR_SHARDED,
  },
  {
    job: 'test-unit-shard',
    run: 'Run unit tests affected by this pull request',
    check: 'Unit tests ran (an empty affected set is allowed)',
    report: 'unit-report.json',
    allowEmpty: true,
    if: SMALL_AFFECTED,
  },
  {
    job: 'test-integration',
    run: 'Run integration tests',
    check: 'Integration tests ran',
    report: 'integration-report.json',
    allowEmpty: false,
  },
  {
    job: 'test-integration-related',
    run: 'Run integration tests related to the change',
    check: 'Related integration tests ran',
    report: 'related-report.json',
    allowEmpty: true,
  },
  {
    job: 'test-deploy',
    run: 'Run src/tests/deploy and src/tests/ci',
    check: 'Deploy and CI config tests ran',
    report: 'deploy-report.json',
    allowEmpty: false,
    expect: ['src/tests/deploy/', 'src/tests/ci/'],
  },
];

describe('every guarded test run fails when it ran no tests', () => {
  it.each(GUARDS)('$job: "$run" writes a JSON report that "$check" reads', (guard) => {
    const all = steps(guard.job);
    const run = all[stepIndex(guard.job, guard.run)];
    const check = all[stepIndex(guard.job, guard.check)];
    expect(stepIndex(guard.job, guard.check)).toBeGreaterThan(stepIndex(guard.job, guard.run));
    expect(run.run).toContain('--reporter=json');
    expect(run.run).toContain(`"--outputFile.json=$RUNNER_TEMP/${guard.report}"`);
    expect(check.run?.startsWith(`${SCRIPT} "$RUNNER_TEMP/${guard.report}"`)).toBe(true);
    expect(check.if).toBe(guard.if ?? run.if);
    for (const step of [run, check]) expect(step['continue-on-error']).toBeUndefined();
    if (guard.allowEmpty) expect(check.run).toMatch(/ --allow-empty "[^"]{20,}"/);
    else expect(check.run).not.toContain('--allow-empty');
    if (guard.expect) expect(check.run).toContain(` --expect ${guard.expect.join(' ')}`);
  });

  // The decision register and scripts/ci steps run fixed directories on every PR, so
  // they are not guarded; only the two runs whose selection can come up empty are.
  it('both unit suite runs write the report the unit checks read', () => {
    // The coverage run goes through `pnpm test:unit:coverage`, so "vitest" alone misses it.
    const unitRuns = steps('test-unit-shard').filter((s) =>
      /\bvitest\b|test:unit/.test(s.run ?? '')
    );
    const reported = unitRuns.filter((s) => s.run?.includes('--outputFile.json='));
    expect(reported.map((s) => s.name)).toEqual([
      'Run unit tests affected by this pull request',
      'Run unit tests with coverage',
    ]);
  });

  it('the unit runs keep their console and annotation reporters beside the JSON one', () => {
    const names = ['Run unit tests with coverage', 'Run unit tests affected by this pull request'];
    for (const name of names) {
      const run = steps('test-unit-shard')[stepIndex('test-unit-shard', name)].run ?? '';
      expect(run).toContain('--reporter=default --reporter=github-actions --reporter=json');
    }
  });
});

describe('Integration Tests say so on a pull request, where they do not run', () => {
  const all = steps('test-integration');

  it('the first step writes a notice and a step summary, on pull requests only', () => {
    const [notice] = all;
    expect(notice.name).toBe('Not run on pull requests');
    expect(notice.if).toBe("github.event_name == 'pull_request'");
    expect(notice.run).toContain(
      'Not run on pull requests: the merge queue runs the integration suite. Related Integration Tests and Deploy & CI Config Tests are the PR-side checks.'
    );
    expect(notice.run).toMatch(/^echo "::notice title=Integration Tests::\$msg"$/m);
    expect(notice.run).toMatch(/^echo "\$msg" >> "\$GITHUB_STEP_SUMMARY"$/m);
  });

  it('every other step skips on a pull request, so the notice is all a PR run does', () => {
    const rest = all.slice(1);
    expect(rest.length).toBeGreaterThan(10);
    for (const step of rest) expect(step.if).toContain("github.event_name != 'pull_request'");
  });
});
