/**
 * The loud failure in diffAgainstBase when git reports that it skipped rename detection.
 *
 * Without that guard, a diff whose renames git gave up on lists every moved file as new, and
 * a gate would blame a pure move for all the debt the file already carried. Real git (2.54)
 * does not print the warning for exact renames even at renameLimit 1, so this test puts a
 * `git` shim first on PATH: it runs the real git, then prints git's own warning text on
 * stderr for `diff`. merge-base.ts is shared byte-for-byte across the gate PRs, so the test
 * lives in its own file rather than in merge-base.test.ts.
 */
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { diffAgainstBase } from '../merge-base.js';

const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const savedPath = process.env.PATH;
const temps: string[] = [];
const temp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  process.env.PATH = savedPath;
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A repo with one commit, then a moved file in the working tree. Returns [root, base]. */
function repoWithMove(): [string, string] {
  const root = temp('merge-base-guard-');
  const git = (...args: string[]): string =>
    execFileSync(realGit, ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.ts'), Array.from({ length: 40 }, (_, i) => `export const a${i} = ${i};`).join('\n') + '\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(root, 'src/moved'));
  git('mv', 'src/a.ts', 'src/moved/a.ts');
  return [root, base];
}

/** Puts a `git` first on PATH that behaves like the real one but warns as git does when it gives up on renames. */
function shimGitWarning(warning: string): void {
  const bin = temp('git-shim-');
  const script = [
    '#!/bin/sh',
    `'${realGit}' "$@"`,
    'status=$?',
    'for arg in "$@"; do',
    `  if [ "$arg" = diff ]; then printf '%s\\n' '${warning}' >&2; break; fi`,
    'done',
    'exit $status',
    '',
  ].join('\n');
  writeFileSync(join(bin, 'git'), script);
  chmodSync(join(bin, 'git'), 0o755);
  process.env.PATH = `${bin}${delimiter}${savedPath ?? ''}`;
}

describe('diffAgainstBase rename-detection guard', () => {
  it('maps the move when git does not report skipping (control)', () => {
    const [root, base] = repoWithMove();
    const d = diffAgainstBase(base, ['src'], root);
    expect(d.renamedFrom.get('src/moved/a.ts')).toBe('src/a.ts');
    expect(d.added.size).toBe(0);
  });

  // git prints one of these, then a hint line (diff.c / diffcore-rename.c).
  const hint = 'warning: you may want to set your diff.renameLimit variable to at least 2 and retry the command.';
  it.each([
    'warning: inexact rename detection was skipped due to too many files.',
    'warning: exhaustive rename detection was skipped due to too many files.',
  ])('throws when git reports "%s"', (skipped) => {
    const warning = `${skipped}\n${hint}`;
    const [root, base] = repoWithMove();
    shimGitWarning(warning);
    // The shim is the git a bare `git` runs: it exits 0, keeps the diff intact, and warns.
    const shimmed = spawnSync('git', ['diff', '--name-status', '-M', base], { cwd: root, encoding: 'utf8' });
    expect(shimmed.status).toBe(0);
    expect(shimmed.stdout).toMatch(/^R\d+\t/);
    expect(shimmed.stderr).toContain(skipped);
    expect(() => diffAgainstBase(base, ['src'], root)).toThrow(/git skipped rename detection, so moved files would look new/);
  });
});
