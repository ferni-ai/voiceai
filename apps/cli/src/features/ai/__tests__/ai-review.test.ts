import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { combineStatuses, countIssues, diffArgs, getDiff } from '../ai-review.js';

describe('diffArgs', () => {
  it('diffs HEAD against the merge base of a base ref', () => {
    expect(diffArgs({ kind: 'base', ref: 'origin/main' })).toEqual(['diff', 'origin/main...HEAD']);
    expect(diffArgs({ kind: 'base', ref: 'origin/main' }, true)).toEqual([
      'diff',
      '--name-only',
      'origin/main...HEAD',
    ]);
  });

  it('keeps the local staged and unstaged scopes', () => {
    expect(diffArgs({ kind: 'staged' })).toEqual(['diff', '--cached']);
    expect(diffArgs({ kind: 'unstaged' })).toEqual(['diff']);
  });

  it('rejects a ref git would read as an option', () => {
    expect(() => diffArgs({ kind: 'base', ref: '--output=/tmp/x' })).toThrow(/Invalid base ref/);
    expect(() => diffArgs({ kind: 'base', ref: '' })).toThrow(/Invalid base ref/);
  });
});

// The CI case: a PR branch checked out clean, its change committed, nothing staged.
describe('getDiff on a clean PR checkout', () => {
  let repo: string;
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'ai-review-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n');
    git('commit', '-q', '-am', 'change');
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('finds nothing staged or unstaged, which is why every PR review was empty', () => {
    expect(git('status', '--porcelain')).toBe('');
    expect(getDiff({ kind: 'staged' }, repo)).toBe('');
    expect(getDiff({ kind: 'unstaged' }, repo)).toBe('');
  });

  it('finds the PR change when diffed against the base branch', () => {
    const diff = getDiff({ kind: 'base', ref: 'main' }, repo);
    expect(diff).toContain('-export const a = 1;');
    expect(diff).toContain('+export const a = 2;');
  });
});

describe('countIssues', () => {
  it('does not count an empty critical section the prompt always asks for', () => {
    const review =
      '## Issues Found\n### 🔴 Critical (must fix)\n- None\n\n### 🟡 Warnings\n- None.\n';
    expect(countIssues(review, '🔴')).toBe(0);
    expect(countIssues(review, '🟡')).toBe(0);
  });

  it('counts the items under each marked heading only', () => {
    const review = [
      '### 🔴 Critical (must fix)',
      '- SQL built from user input (db.ts:12)',
      '* Token logged in plain text (auth.ts:40)',
      '### 🟡 Warnings (should fix)',
      '1. Missing await (job.ts:9)',
      '### 🟢 Suggestions',
      '- Rename x',
    ].join('\n');
    expect(countIssues(review, '🔴')).toBe(2);
    expect(countIssues(review, '🟡')).toBe(1);
  });

  it('treats "No critical issues found" and bold "None" as empty', () => {
    expect(countIssues('### 🔴 Critical\n- No critical issues found\n- **None**\n', '🔴')).toBe(0);
  });
});

describe('combineStatuses', () => {
  it('reports a run with any failed review as failed', () => {
    expect(combineStatuses(['reviewed', 'failed', 'reviewed'])).toBe('failed');
    expect(combineStatuses([])).toBe('failed');
  });

  it('reports no-changes only when every review saw no changes', () => {
    expect(combineStatuses(['no-changes', 'no-changes'])).toBe('no-changes');
    expect(combineStatuses(['reviewed', 'no-changes'])).toBe('reviewed');
  });
});
