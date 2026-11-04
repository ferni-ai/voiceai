/**
 * In a shallow checkout (CI's) git blame stops at the boundary commit, so every TODO
 * looks new and the quality gate printed "0 over 90 days old". It must say the age is
 * unknown instead. Display only: no threshold reads the age.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ageSummary, isShallowCheckout } from '../audit-todos.js';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('TODO age in a shallow checkout', () => {
  it('says the age is unknown in a shallow clone, and counts it in a full one', () => {
    dir = mkdtempSync(join(tmpdir(), 'todo-age-'));
    const full = join(dir, 'full');
    const git = (cwd: string, ...args: string[]): string =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    execFileSync('git', ['init', '-q', '-b', 'main', full]);
    for (const n of [1, 2]) {
      writeFileSync(join(full, 'a.ts'), `// TODO: ${n}\n`);
      git(full, 'add', '.');
      git(full, 'commit', '-q', '-m', `c${n}`);
    }
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${full}`, join(dir, 'shallow')]);

    expect(isShallowCheckout(full)).toBe(false);
    expect(isShallowCheckout(join(dir, 'shallow'))).toBe(true);
    expect(ageSummary(3, false)).toBe('3 over 90 days old');
    expect(ageSummary(0, true)).toBe('age unknown (shallow checkout)');
  });
});
