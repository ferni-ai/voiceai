import { describe, expect, it } from 'vitest';
import { ignoredFiles, lowered, regressions, staleSuppressions } from '../lint-coverage-ratchet.js';

describe('lint-coverage ratchet', () => {
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
    const stderr = 'There are suppressions left that do not occur anymore. Consider re-running the command with `--prune-suppressions`.';
    expect(staleSuppressions(stderr)[0]).toContain('--prune-suppressions');
    expect(staleSuppressions('')).toEqual([]);
  });

  it('reports files ESLint skipped, since a skipped file reads as clean', () => {
    const skipped = { filePath: '/repo/apps/cli/src/commands/deploy/x.ts', errorCount: 0, warningCount: 1, messages: [{ message: 'File ignored because of a matching ignore pattern. Use "--no-ignore".' }] };
    const checked = { filePath: '/repo/src/a.ts', errorCount: 0, warningCount: 0, messages: [] };
    expect(ignoredFiles([skipped, checked])).toEqual([skipped.filePath]);
  });
});
