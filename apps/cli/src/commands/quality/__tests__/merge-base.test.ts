import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { basePathOf, diffAgainstBase, listAtBase, readAtBase, resolveBase } from '../merge-base.js';

let root: string;
const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();
const write = (files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};
const lines = (n: number, tag = 'x'): string => Array.from({ length: n }, (_, i) => `export const ${tag}${i} = ${i};`).join('\n') + '\n';

function repo(): string {
  root = mkdtempSync(join(tmpdir(), 'merge-base-'));
  git('init', '-q', '-b', 'main');
  write({ 'src/a.ts': lines(40, 'a'), 'src/b.ts': lines(10, 'b'), 'src/gone.ts': 'export {};\n' });
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return git('rev-parse', 'HEAD');
}
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('merge-base diff', () => {
  it('sees added, modified, renamed, deleted and untracked files', () => {
    const base = repo();
    mkdirSync(join(root, 'src/moved'));
    git('mv', 'src/a.ts', 'src/moved/a.ts');
    git('rm', '-q', 'src/gone.ts');
    write({ 'src/b.ts': lines(12, 'b'), 'src/new.ts': lines(5, 'n') });
    git('add', 'src/new.ts');
    git('commit', '-q', '-m', 'pr');
    write({ 'src/untracked.ts': 'export {};\n' });
    const d = diffAgainstBase(base, ['src'], root);
    expect(d.changed).toEqual(['src/b.ts', 'src/moved/a.ts', 'src/new.ts', 'src/untracked.ts']);
    expect([...d.added].sort()).toEqual(['src/new.ts', 'src/untracked.ts']);
    expect(d.deleted).toEqual(['src/gone.ts']);
    expect(basePathOf(d, 'src/moved/a.ts')).toBe('src/a.ts');
    expect(basePathOf(d, 'src/b.ts')).toBe('src/b.ts');
    expect(basePathOf(d, 'src/new.ts')).toBeNull();
  });

  it('reads base texts and lists the base tree', () => {
    const base = repo();
    write({ 'src/b.ts': 'changed\n' });
    const texts = readAtBase(base, ['src/b.ts', 'src/nope.ts', 'src/gone.ts'], root);
    expect(texts.get('src/b.ts')).toBe(lines(10, 'b'));
    expect(texts.has('src/nope.ts')).toBe(false);
    expect(texts.get('src/gone.ts')).toBe('export {};\n');
    expect(listAtBase(base, ['src'], root)).toEqual(['src/a.ts', 'src/b.ts', 'src/gone.ts']);
  });

  it('takes the base from QUALITY_BASE, then the GitHub event, then merge-base with origin/main', () => {
    const base = repo();
    write({ 'src/c.ts': 'export {};\n' });
    git('add', '.');
    git('commit', '-q', '-m', 'next');
    expect(resolveBase(root, { QUALITY_BASE: base })).toBe(base);
    const event = join(root, 'event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base } } }));
    expect(resolveBase(root, { GITHUB_EVENT_PATH: event })).toBe(base);
    // A pull request runs on its merge commit: the first parent is the real base, even when
    // the event's base.sha is older (main moved after the push).
    const prHead = git('rev-parse', 'HEAD');
    git('checkout', '-q', '-b', 'tip', base);
    write({ 'src/main-moved.ts': 'export const m = 1;\n' });
    git('add', '.');
    git('commit', '-q', '-m', 'main moved');
    const mainTip = git('rev-parse', 'HEAD');
    git('merge', '-q', '--no-ff', '-m', 'merge', prHead);
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: prHead } } }));
    expect(resolveBase(root, { GITHUB_EVENT_PATH: event })).toBe(mainTip);
    writeFileSync(event, JSON.stringify({ before: '0000000000000000000000000000000000000000' }));
    expect(() => resolveBase(root, { GITHUB_EVENT_PATH: event })).toThrow(/No base commit/);
    git('update-ref', 'refs/remotes/origin/main', base);
    expect(resolveBase(root, {})).toBe(base);
  });

  it('fails loudly on a base it cannot find', () => {
    repo();
    expect(() => resolveBase(root, { QUALITY_BASE: '1234567890abcdef1234567890abcdef12345678' })).toThrow(/could not be fetched/);
  });
});
