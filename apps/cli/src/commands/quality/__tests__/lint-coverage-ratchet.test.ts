import { describe, expect, it } from 'vitest';
import {
  readEslintRun,
  ignoredFiles,
  lintGroups,
  lowered,
  regressions,
  staleSuppressions,
} from '../lint-coverage-ratchet.js';

describe('lint-coverage ratchet', () => {
  it('lints each TypeScript program (src, the CLI deploy commands, scripts/) in its own ESLint run, every file exactly once', () => {
    const files = [
      'src/a.ts',
      'scripts/ci/b.ts',
      'apps/cli/src/commands/deploy/c.ts',
      'scripts/d.ts',
      'src/e.ts',
    ];
    const groups = lintGroups(files);
    expect(groups.map((g) => g.files)).toEqual([
      ['src/a.ts', 'src/e.ts'],
      ['apps/cli/src/commands/deploy/c.ts'],
      ['scripts/ci/b.ts', 'scripts/d.ts'],
    ]);
    expect(new Set(groups.map((g) => g.name)).size).toBe(3);
    expect(lintGroups(['src/a.ts'])).toHaveLength(1);
  });

  it('reads a finished ESLint run whatever its exit status (1 = lint errors, 2 = stale suppressions)', () => {
    const file = { filePath: '/repo/src/a.ts', errorCount: 1, warningCount: 0, messages: [] };
    for (const status of [0, 1, 2]) {
      expect(
        readEslintRun({ status, signal: null, stdout: JSON.stringify([file]), stderr: '' })
      ).toEqual({ results: [file] });
    }
  });

  it('names a crash instead of a JSON error when ESLint ran out of heap mid-output', () => {
    const heap =
      'noise\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
    const partial = readEslintRun({
      status: 134,
      signal: null,
      stdout: '[{"filePath":"/x/deploy.ts","mess',
      stderr: heap,
    });
    expect(partial).toEqual({ failure: expect.stringContaining('output is not complete JSON') });
    expect(partial).toEqual({ failure: expect.stringContaining('heap out of memory') });
    const killed = readEslintRun({ status: null, signal: 'SIGABRT', stdout: '[]', stderr: heap });
    expect(killed).toEqual({ failure: expect.stringContaining('signal SIGABRT') });
    const silent = readEslintRun({ status: 2, signal: null, stdout: '', stderr: 'config error' });
    expect(silent).toEqual({ failure: expect.stringContaining('no output') });
  });

  it('fails a file whose error count grew', () => {
    const problems = regressions({ 'src/a.ts': 2 }, { 'src/a.ts': 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('errors grew 2 → 3');
  });

  it('fails a new file that has any errors', () => {
    const problems = regressions({}, { 'src/new.ts': 1 });
    expect(problems[0]).toContain('new file or newly failing');
  });

  it('passes a file that is at or below its baseline', () => {
    expect(regressions({ 'src/a.ts': 2 }, { 'src/a.ts': 2 })).toEqual([]);
    expect(regressions({ 'src/a.ts': 2 }, { 'src/a.ts': 1 })).toEqual([]);
  });

  it('lowers baselines to today and drops files that are clean', () => {
    const next = lowered({ 'src/a.ts': 5, 'src/b.ts': 4 }, { 'src/a.ts': 2 });
    expect(next).toEqual({ 'src/a.ts': 2 });
  });

  it('never raises a baseline in --update', () => {
    expect(lowered({ 'src/a.ts': 2 }, { 'src/a.ts': 9 })).toEqual({ 'src/a.ts': 2 });
  });

  it('fails when eslint-suppressions.json holds suppressions nothing needs any more', () => {
    // ESLint exits 2 with this on stderr once a suppressed violation is fixed; until the file is
    // pruned, the next new violation in that file would slip in under the old count.
    const stderr =
      'There are suppressions left that do not occur anymore. Consider re-running the command with `--prune-suppressions`.';
    expect(staleSuppressions(stderr)[0]).toContain('--prune-suppressions');
    expect(staleSuppressions('')).toEqual([]);
  });

  it('reports files ESLint skipped, since a skipped file reads as clean', () => {
    const skipped = {
      filePath: '/repo/apps/cli/src/commands/deploy/x.ts',
      errorCount: 0,
      warningCount: 1,
      messages: [
        { message: 'File ignored because of a matching ignore pattern. Use "--no-ignore".' },
      ],
    };
    const checked = { filePath: '/repo/src/a.ts', errorCount: 0, warningCount: 0, messages: [] };
    expect(ignoredFiles([skipped, checked])).toEqual([skipped.filePath]);
  });
});
