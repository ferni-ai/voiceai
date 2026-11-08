import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAllRelevantFiles } from '../check-brand-compliance.js';
import { gitVisible } from '../git-visible.js';
import { getFilesToLint } from '../lint-brand.js';
import { measureOversized } from '../ratchet.js';

let repo = '';
const big = 'x\n'.repeat(600);

/** One tracked file per kind, an untracked one, and gitignored build output beside them. */
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'git-visible-'));
  const put = (path: string, text = ''): void => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  };
  put('.gitignore', 'storybook-static/\n');
  put('src/tracked.ts', big);
  put('apps/web/src/app.ts');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  put('src/untracked.ts', big);
  put('src/café.ts');
  put('src/storybook-static/tokens.ts', big);
  put('apps/web/src/storybook-static/copy.ts');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('gitVisible', () => {
  it('keeps tracked files', () => {
    expect(gitVisible(repo)('src/tracked.ts')).toBe(true);
  });

  it('keeps untracked files that are not ignored, so new work is measured', () => {
    expect(gitVisible(repo)('src/untracked.ts')).toBe(true);
  });

  it('drops gitignored files', () => {
    expect(gitVisible(repo)('src/storybook-static/tokens.ts')).toBe(false);
  });

  it('matches non-ASCII names, which git quotes unless -z', () => {
    expect(gitVisible(repo)('src/café.ts')).toBe(true);
  });

  it('takes absolute paths, and a root below the top of the repo', () => {
    expect(gitVisible(repo)(join(repo, 'src/tracked.ts'))).toBe(true);
    expect(gitVisible(join(repo, 'src'))('tracked.ts')).toBe(true);
    expect(gitVisible(join(repo, 'src'))('storybook-static/tokens.ts')).toBe(false);
  });

  it('throws outside a git repo rather than measuring nothing', () => {
    const bare = mkdtempSync(join(tmpdir(), 'not-a-repo-'));
    try {
      expect(() => gitVisible(bare)).toThrow(/git rev-parse/);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('ratchet collectors skip gitignored files', () => {
  it('file-size scoreboard', () => {
    expect(Object.keys(measureOversized(['src'], repo))).toEqual([
      'src/tracked.ts',
      'src/untracked.ts',
    ]);
  });

  it('brand copy files', () => {
    expect(getAllRelevantFiles(repo)).toEqual(['apps/web/src/app.ts']);
  });

  it('brand lint files', async () => {
    const files = (await getFilesToLint(repo)).map((f) => relative(repo, f)).sort();
    expect(files).toEqual([
      'apps/web/src/app.ts',
      'src/café.ts',
      'src/tracked.ts',
      'src/untracked.ts',
    ]);
  });
});
