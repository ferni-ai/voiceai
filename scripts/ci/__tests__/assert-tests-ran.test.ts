/**
 * The test steps in ci.yml read their vitest JSON report with assert-tests-ran.mjs, so a
 * green test check means tests ran: an empty run fails unless the step says why it may be
 * empty, a named file missing from the report fails, and a missing report fails closed.
 * The CLI rows run the real script the way ci.yml does and read its exit code.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkReport,
  missingExpected,
  parseArgs,
  reportedFiles,
  testsRan,
} from '../assert-tests-ran.mjs';

const ROOT = '/repo';
const SCRIPT = resolve(__dirname, '..', 'assert-tests-ran.mjs');

/** A vitest JSON report: one file per path, with the given test counts. */
function report(
  files: string[],
  counts: { passed?: number; failed?: number; skipped?: number } = {}
) {
  const { passed = 0, failed = 0, skipped = 0 } = counts;
  return {
    numTotalTests: passed + failed + skipped,
    numPassedTests: passed,
    numFailedTests: failed,
    numPendingTests: skipped,
    numTodoTests: 0,
    testResults: files.map((file) => ({ name: `${ROOT}/${file}`, assertionResults: [] })),
  };
}

const DEPLOY = 'src/tests/deploy/merge-queue-jobs.test.ts';

describe('assert-tests-ran: the verdict on a report', () => {
  it('fails a run in which no test ran', () => {
    const verdict = checkReport(report([]), { root: ROOT });
    expect(verdict.ran).toBe(0);
    expect(verdict.errors).toEqual([expect.stringMatching(/^no tests ran \(0 collected, 0 file/)]);
  });

  it('fails a run whose every test skipped: a skip is not a run', () => {
    const verdict = checkReport(report([DEPLOY], { skipped: 12 }), { root: ROOT });
    expect(verdict.ran).toBe(0);
    expect(verdict.errors).toHaveLength(1);
  });

  it('passes a run in which tests ran, failed ones included (vitest fails those itself)', () => {
    expect(checkReport(report([DEPLOY], { passed: 3, skipped: 2 }), { root: ROOT })).toEqual({
      ran: 3,
      errors: [],
      notices: [],
    });
    expect(testsRan(report([DEPLOY], { passed: 1, failed: 2 }))).toBe(3);
  });

  it('passes an empty run with --allow-empty and says why in a notice', () => {
    const verdict = checkReport(report([]), { allowEmpty: 'no affected tests', root: ROOT });
    expect(verdict.errors).toEqual([]);
    expect(verdict.notices).toEqual(['No tests ran, as allowed: no affected tests']);
  });

  it('prints no notice when tests ran under --allow-empty', () => {
    const verdict = checkReport(report([DEPLOY], { passed: 1 }), { allowEmpty: 'x', root: ROOT });
    expect(verdict).toEqual({ ran: 1, errors: [], notices: [] });
  });

  it('fails when an expected file is missing from the report, even though tests ran', () => {
    const other = 'src/tests/ci/merge-queue-scope.test.ts';
    const verdict = checkReport(report([other], { passed: 5 }), { expect: [DEPLOY], root: ROOT });
    expect(verdict.errors).toEqual([expect.stringContaining(`${DEPLOY} did not run`)]);
    const present = checkReport(report([DEPLOY], { passed: 5 }), { expect: [DEPLOY], root: ROOT });
    expect(present.errors).toEqual([]);
  });

  it('a directory expectation needs one reported file under it, and only under it', () => {
    const files = reportedFiles(report([DEPLOY]), ROOT);
    expect(files).toEqual([DEPLOY]);
    expect(missingExpected(files, ['src/tests/deploy/'])).toEqual([]);
    expect(missingExpected(files, ['src/tests/ci/', 'src/tests/deploy/'])).toEqual([
      'src/tests/ci/',
    ]);
    // A name prefix is not a directory: src/tests/dep/ must not match src/tests/deploy/.
    expect(missingExpected(files, ['src/tests/dep/'])).toEqual(['src/tests/dep/']);
  });

  it('fails anything that is not a vitest JSON report', () => {
    for (const bad of [null, {}, { numTotalTests: 3 }, { testResults: [] }]) {
      expect(checkReport(bad, { allowEmpty: 'x' }).errors).toEqual([
        'the file is not a vitest JSON report',
      ]);
    }
  });
});

describe('assert-tests-ran: the command line', () => {
  it('reads the report, the reason and the expected paths', () => {
    expect(parseArgs(['r.json', '--allow-empty', 'why', '--expect', 'a/', 'b.test.ts'])).toEqual({
      report: 'r.json',
      allowEmpty: 'why',
      expect: ['a/', 'b.test.ts'],
    });
    expect(parseArgs(['r.json'])).toEqual({ report: 'r.json', allowEmpty: undefined, expect: [] });
  });

  it('rejects --allow-empty without a reason, --expect without a path, and stray flags', () => {
    expect(() => parseArgs(['r.json', '--allow-empty'])).toThrow(/needs the reason/);
    expect(() => parseArgs(['r.json', '--allow-empty', ' '])).toThrow(/needs the reason/);
    expect(() => parseArgs(['r.json', '--allow-empty', '--expect', 'a'])).toThrow(/reason/);
    expect(() => parseArgs(['r.json', '--expect'])).toThrow(/at least one path/);
    expect(() => parseArgs(['r.json', '--allow-emtpy', 'why'])).toThrow(/unknown argument/);
    expect(() => parseArgs([])).toThrow(/report path/);
  });

  describe('run as ci.yml runs it', () => {
    let dir: string;
    beforeEach(() => {
      // realpath: the child's cwd is the resolved path (macOS /var is /private/var).
      dir = realpathSync(mkdtempSync(join(tmpdir(), 'assert-tests-ran-')));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /** Runs the script from `dir` (the repo root it resolves report paths against). */
    function run(body: unknown, ...args: string[]) {
      const path = join(dir, 'report.json');
      if (body !== undefined) {
        writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
      }
      return spawnSync(process.execPath, [SCRIPT, path, ...args], { cwd: dir, encoding: 'utf8' });
    }
    const withFiles = (files: string[], passed: number) => ({
      ...report([], { passed }),
      testResults: files.map((file) => ({ name: join(dir, file), assertionResults: [] })),
    });

    it('exits 0 when tests ran', () => {
      const out = run(withFiles([DEPLOY], 4));
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('4 test(s) ran in 1 file(s)');
    });

    it('exits 1 with an ::error:: when no tests ran', () => {
      const out = run(withFiles([], 0));
      expect(out.status).toBe(1);
      expect(out.stderr).toMatch(/^::error::no tests ran/m);
    });

    it('exits 0 with a ::notice:: on an allowed empty run', () => {
      const out = run(withFiles([], 0), '--allow-empty', 'no unit tests import the change');
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('::notice::No tests ran, as allowed: no unit tests import');
    });

    it('exits 1 when an expected file did not run', () => {
      const out = run(withFiles([DEPLOY], 4), '--expect', 'src/tests/ci/');
      expect(out.status).toBe(1);
      expect(out.stderr).toContain('::error::src/tests/ci/ did not run');
      expect(run(withFiles([DEPLOY], 4), '--expect', 'src/tests/deploy/').status).toBe(0);
    });

    it('exits 1 when the report is missing or unreadable: no evidence is not a pass', () => {
      const missing = run(undefined, '--allow-empty', 'x');
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/^::error::No readable vitest report at /m);
      expect(run('{"numTotalTests": 3, "testResu', '--allow-empty', 'x').status).toBe(1);
    });

    it('exits 2 on a malformed command line', () => {
      const out = run(withFiles([DEPLOY], 4), '--allow-empty');
      expect(out.status).toBe(2);
      expect(out.stderr).toContain('::error::assert-tests-ran: --allow-empty needs the reason');
    });
  });
});
