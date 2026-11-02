import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareFormat,
  prettier,
  run,
  unformattedFiles,
  type PrettierRun,
} from '../format-ratchet.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const PRETTIER = join(REPO, 'node_modules', '.bin', 'prettier');

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function tmp(): string {
  dir = mkdtempSync(join(tmpdir(), 'format-ratchet-'));
  return dir;
}

function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const listed = (...files: string[]): PrettierRun => ({
  status: files.length ? 1 : 0,
  stdout: files.map((f) => `${f}\n`).join(''),
  stderr: '',
});

function check(
  baseline: string[] | null,
  now: PrettierRun,
  args: string[] = []
): { code: number; out: string; base: string[] | null } {
  const path = join(tmp(), 'baseline.json');
  if (baseline) writeFileSync(path, JSON.stringify(baseline));
  const lines: string[] = [];
  const code = run(
    '/repo',
    path,
    args,
    (l) => lines.push(l),
    () => now
  );
  let base: string[] | null = null;
  try {
    base = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    base = null;
  }
  return { code, out: lines.join('\n'), base };
}

describe('compareFormat', () => {
  it('new: a file unformatted now and not in the baseline is added', () => {
    expect(compareFormat(['src/a.ts'], ['src/a.ts', 'src/b.ts'])).toEqual({
      added: ['src/b.ts'],
      fixed: [],
    });
  });

  it('new, near miss: a baseline file still unformatted is not added', () => {
    expect(compareFormat(['src/a.ts', 'src/b.ts'], ['src/b.ts', 'src/a.ts']).added).toEqual([]);
  });

  it('lowered: a baseline file now formatted (or gone) is fixed', () => {
    expect(compareFormat(['src/a.ts', 'src/b.ts'], ['src/a.ts'])).toEqual({
      added: [],
      fixed: ['src/b.ts'],
    });
  });

  it('lowered, near miss: a file that is unformatted in both is not fixed', () => {
    expect(compareFormat(['src/a.ts'], ['src/a.ts']).fixed).toEqual([]);
  });

  it('equal count, different files: one formatted and another unformatted is both', () => {
    expect(compareFormat(['src/a.ts', 'src/b.ts'], ['src/a.ts', 'src/c.ts'])).toEqual({
      added: ['src/c.ts'],
      fixed: ['src/b.ts'],
    });
  });
});

describe('run', () => {
  it('equal: the same files unformatted passes and leaves the baseline alone', () => {
    const r = check(['src/a.ts', 'src/b.ts'], listed('src/b.ts', 'src/a.ts'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 known');
    expect(r.base).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('new: fails and names the newly unformatted file only', () => {
    const r = check(['src/a.ts'], listed('src/a.ts', 'src/new.ts'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('  src/new.ts');
    expect(r.out).not.toContain('  src/a.ts');
  });

  it('new, near miss: an all-formatted tree against an empty baseline passes', () => {
    expect(check([], listed()).code).toBe(0);
  });

  it('lowered: fails with the number to lower the baseline to, and names the file', () => {
    const r = check(['src/a.ts', 'src/b.ts', 'src/c.ts'], listed('src/a.ts'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('Lower the baseline to 1');
    expect(r.out).toContain('  src/b.ts');
    expect(r.base).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('lowered + --update: drops only the formatted files and passes', () => {
    const r = check(['src/a.ts', 'src/b.ts'], listed('src/a.ts'), ['--update']);
    expect(r.code).toBe(0);
    expect(r.base).toEqual(['src/a.ts']);
  });

  it('--update never adds: a new unformatted file still fails and is not written', () => {
    const r = check(['src/a.ts'], listed('src/a.ts', 'src/new.ts'), ['--update']);
    expect(r.code).toBe(1);
    expect(r.base).toEqual(['src/a.ts']);
  });

  it('a swap (format one, unformat another) fails on the new file', () => {
    const r = check(['src/a.ts', 'src/b.ts'], listed('src/a.ts', 'src/c.ts'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('  src/c.ts');
  });

  it('a missing baseline fails instead of passing', () => {
    expect(check(null, listed('src/a.ts')).code).toBe(1);
  });

  it('--init writes what prettier reports', () => {
    const r = check(null, listed('src/b.ts', 'src/a.ts'), ['--init']);
    expect(r.code).toBe(0);
    expect(r.base).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('unformattedFiles', () => {
  it('counts a file prettier cannot parse as unformatted', () => {
    const r = unformattedFiles({
      status: 2,
      stdout: 'src/a.ts\n',
      stderr: '[error] src/b.json: SyntaxError: Unexpected token (3:1)\n[error]   2 | }\n',
    });
    expect(r).toEqual({ files: ['src/a.ts', 'src/b.json'], unparsable: ['src/b.json'] });
  });

  it('reads a parse error whose [error] tag is wrapped in colour codes (CI forces colour)', () => {
    const r = unformattedFiles({
      status: 2,
      stdout: 'src/a.ts\n',
      stderr: '[\x1b[31merror\x1b[39m] src/b.json: SyntaxError: Unexpected token (3:1)\n',
    });
    expect(r.unparsable).toEqual(['src/b.json']);
  });

  it('the real binary under FORCE_COLOR still names the unparsable file', () => {
    const root = tmp();
    put(root, '.prettierrc', '{}\n');
    put(root, 'src/broken.json', '{ "a": 1,, }\n');
    const prev = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = '1';
    try {
      expect(unformattedFiles(prettier(root, PRETTIER)).unparsable).toEqual(['src/broken.json']);
    } finally {
      if (prev === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = prev;
    }
  });

  it('throws when prettier errors without naming a file (bad glob, bad config)', () => {
    expect(() =>
      unformattedFiles({
        status: 2,
        stdout: '',
        stderr: '[error] No files matching the pattern were found: "src/**/*.ts".\n',
      })
    ).toThrow(/prettier exited 2/);
  });

  it('throws when the exit code and the output disagree', () => {
    expect(() => unformattedFiles({ status: 1, stdout: '', stderr: '' })).toThrow();
    expect(() => unformattedFiles({ status: 0, stdout: 'src/a.ts\n', stderr: '' })).toThrow();
    expect(() => unformattedFiles({ status: null, stdout: '', stderr: '' })).toThrow();
  });
});

describe('prettier (the real binary)', () => {
  it('reports the unformatted and the unparsable file, and not the formatted one', () => {
    const root = tmp();
    put(root, '.prettierrc', '{}\n');
    put(root, 'src/ok.ts', 'export const a = 1;\n');
    put(root, 'src/deep/messy.ts', 'export   const b=2\n');
    put(root, 'src/broken.json', '{ "a": 1,, }\n');
    const r = unformattedFiles(prettier(root, PRETTIER));
    expect(r.files).toEqual(['src/broken.json', 'src/deep/messy.ts']);
    expect(r.unparsable).toEqual(['src/broken.json']);
  });

  it('an all-formatted tree reports nothing', () => {
    const root = tmp();
    put(root, '.prettierrc', '{}\n');
    put(root, 'src/ok.ts', 'export const a = 1;\n');
    expect(unformattedFiles(prettier(root, PRETTIER)).files).toEqual([]);
  });
});
