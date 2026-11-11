import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { generatedPaths, run, staleMocks } from '../mock-paths.js';

let root: string;

/** A tiny git repo (index only, no commit: the ratchet reads `git ls-files`). */
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'mock-paths-'));
  for (const [path, text] of Object.entries(files)) put(path, text);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

function put(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function check(baseline: string, args: string[] = []): { code: number; out: string } {
  const lines: string[] = [];
  const code = run(root, baseline, args, (l) => lines.push(l));
  return { code, out: lines.join('\n') };
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const DEEP_TEST = 'src/a/b/c/__tests__/deep.test.ts';
const GOOD = {
  'src/services/real.ts': 'export const real = 1;\n',
  'src/kernel/index.ts': 'export const k = 1;\n',
  'src/a/b/c/__tests__/ok.test.ts': [
    "vi.mock('../../../../services/real.js');",
    "vi.mock('../../../../kernel');",
    "vi.mock('firebase-admin');",
    '',
  ].join('\n'),
};

describe('staleMocks', () => {
  it('flags a deep relative vi.mock string that names no module, and nothing that resolves', () => {
    repo({ ...GOOD, [DEEP_TEST]: "vi.doMock('../../../../services/gone.js', () => ({}));\n" });
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .trim()
      .split('\n');
    const read = (f: string): string => readFileSync(join(root, f), 'utf8');
    const isFile = (f: string): boolean => files.includes(f);
    expect(staleMocks(files, read, isFile)).toEqual({
      [DEEP_TEST]: ['../../../../services/gone.js'],
    });
  });

  it('ignores vi.mock strings outside test files and plain imports in tests', () => {
    repo({
      'src/x/mocks.ts': "vi.mock('../nowhere.js');\n",
      'src/x/__tests__/imp.test.ts': "import { y } from '../nowhere.js';\nvi.fn();\n",
    });
    const files = ['src/x/mocks.ts', 'src/x/__tests__/imp.test.ts'];
    const read = (f: string): string => readFileSync(join(root, f), 'utf8');
    expect(staleMocks(files, read, () => false)).toEqual({});
  });

  it('counts only the vi.mock string when a test also has a stale plain import', () => {
    const both = 'src/x/__tests__/both.test.ts';
    repo({ [both]: "import { y } from '../nowhere.js';\nvi.mock('../gone.js');\n" });
    const read = (f: string): string => readFileSync(join(root, f), 'utf8');
    expect(staleMocks([both], read, () => false)).toEqual({ [both]: ['../gone.js'] });
  });
});

describe('run (the pnpm quality:mock-paths ratchet)', () => {
  it('passes on a tree whose mock strings all resolve', () => {
    repo(GOOD);
    const r = check(join(root, 'baseline.json'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 known stale');
  });

  it('fails on a new deep stale mock path the baseline does not hold', () => {
    repo({ ...GOOD, [DEEP_TEST]: "vi.mock('../../../../services/gone.js');\n" });
    writeFileSync(join(root, 'baseline.json'), '{}\n');
    const r = check(join(root, 'baseline.json'));
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${DEEP_TEST}: ../../../../services/gone.js`);
  });

  it('passes once the stale string is in the baseline, and --update only lowers it', () => {
    repo({ ...GOOD, [DEEP_TEST]: "vi.mock('../../../../services/gone.js');\n" });
    const baseline = join(root, 'baseline.json');
    expect(check(baseline, ['--init']).code).toBe(0);
    expect(check(baseline).code).toBe(0);

    // A second stale string in the same file is new: the baseline is per string, not per file.
    put(
      DEEP_TEST,
      "vi.mock('../../../../services/gone.js');\nvi.mock('../../../../services/also-gone.js');\n"
    );
    expect(check(baseline).code).toBe(1);

    // Fix both: the check FAILS until --update drops the fixed entry, so the baseline only
    // ever shrinks and a fixed string cannot go stale again unnoticed.
    put('src/services/gone.ts', 'export {};\n');
    put(DEEP_TEST, "vi.mock('../../../../services/gone.js');\n");
    execFileSync('git', ['add', '-A'], { cwd: root });
    const fixed = check(baseline);
    expect(fixed.code).toBe(1);
    expect(fixed.out).toContain('1 baseline entry no longer stale');
    expect(fixed.out).toContain('--update');
    expect(check(baseline, ['--update']).code).toBe(0);
    expect(JSON.parse(readFileSync(baseline, 'utf8'))).toEqual({});
    expect(check(baseline).code).toBe(0);
  });

  it('--update with a new stale string fails and leaves the baseline as it was', () => {
    repo({ ...GOOD, [DEEP_TEST]: "vi.mock('../../../../services/gone.js');\n" });
    const baseline = join(root, 'baseline.json');
    expect(check(baseline, ['--init']).code).toBe(0);
    const before = readFileSync(baseline, 'utf8');
    put(
      DEEP_TEST,
      "vi.mock('../../../../services/gone.js');\nvi.mock('../../../../services/new-gone.js');\n"
    );
    const r = check(baseline, ['--update']);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${DEEP_TEST}: ../../../../services/new-gone.js`);
    expect(readFileSync(baseline, 'utf8')).toBe(before);
  });

  it('treats a gitignored *.generated.* file as present before install writes it', () => {
    // src/config/flags/index.generated.ts is made by `pnpm gen:lists` at install: not in git,
    // and not on disk on a CI node_modules cache hit or a fresh clone.
    const gen = 'src/config/__tests__/generated-guard.test.ts';
    repo({
      '.gitignore': '# generated\nsrc/config/flags/index.generated.ts\n*.generated.json\n',
      [gen]: "vi.mock('../flags/index.generated.js');\n",
    });
    const baseline = join(root, 'baseline.json');
    writeFileSync(baseline, '{}\n');
    expect(check(baseline).code).toBe(0);

    // Only the literal entry counts: an unlisted *.generated.* name is still stale.
    put(gen, "vi.mock('../flags/index.generated.js');\nvi.mock('../flags/other.generated.js');\n");
    const r = check(baseline);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${gen}: ../flags/other.generated.js`);
    expect(r.out).not.toContain('index.generated');
  });
});

describe('generatedPaths', () => {
  it('keeps literal *.generated.* code paths and skips globs, negations and bare names', () => {
    const text = [
      '# Generated at install',
      'src/config/flags/index.generated.ts',
      '/src/config/env-read-names.generated.ts',
      '*.generated.ts',
      '!src/keep.generated.ts',
      'loose.generated.ts',
      'src/data.generated.json',
      '',
    ].join('\n');
    expect([...generatedPaths(text)].sort()).toEqual([
      'src/config/env-read-names.generated.ts',
      'src/config/flags/index.generated.ts',
    ]);
  });
});
