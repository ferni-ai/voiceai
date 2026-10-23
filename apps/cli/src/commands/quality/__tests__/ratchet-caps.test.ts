import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  countAsUnknownAs,
  filesAddedSince,
  lowered,
  measureLongFunctions,
  newFileRegressions,
  regressions,
  type Measurement,
} from '../ratchet.js';

let root: string;
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'ratchet-caps-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** A function body of `n` lines in total, including its first and last line. */
const body = (n: number): string => Array.from({ length: n - 2 }, (_, i) => `    x += ${i};`).join('\n');
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';

const base: Measurement = {
  oversized: {},
  brandCritical: 0,
  brandWarnings: 0,
  lint: {},
  asUnknownAs: 3,
  longFunctions: { 'src/a.ts#run': 200, 'src/a.ts#Turn.handle': 180 },
};

describe('ratchet: as unknown as', () => {
  it('counts each cast, across lines too', () => {
    expect(countAsUnknownAs('const a = b as unknown as C;\nconst d = (e as\n  unknown as F);\nconst g = h as unknown;')).toBe(2);
  });

  it('fails when the count rises, passes when it holds or falls', () => {
    expect(regressions(base, { ...base, asUnknownAs: 3 })).toEqual([]);
    expect(regressions(base, { ...base, asUnknownAs: 4 })).toEqual([
      '`as unknown as` casts rose 3 → 4. Type it, or narrow with a guard.',
    ]);
    expect(lowered(base, { ...base, asUnknownAs: 1 }).asUnknownAs).toBe(1);
  });
});

describe('ratchet: function length', () => {
  it('names long functions by their place in the file and skips short ones', () => {
    const r = repo({
      'src/a.ts': [
        `export function run(): void {\n  let x = 0;\n${body(160)}\n}`,
        `export class Turn {\n  handle(): void {\n    let x = 0;\n${body(155)}\n  }\n}`,
        `export const arrow = (): void => {\n  let x = 0;\n${body(151)}\n};`,
        `export function short(): void {\n  let x = 0;\n${body(20)}\n}`,
        `export function outer(): void {\n  const inner = (): void => {\n    let x = 0;\n${body(170)}\n  };\n  inner();\n}`,
      ].join('\n'),
    });
    const fns = measureLongFunctions(['src'], r);
    expect(Object.keys(fns).sort()).toEqual([
      'src/a.ts#Turn.handle',
      'src/a.ts#arrow',
      'src/a.ts#outer',
      'src/a.ts#outer.inner',
      'src/a.ts#run',
    ]);
    expect(fns['src/a.ts#run']).toBe(161); // signature + let + 158 body lines + closing brace
  });

  it('fails a long function that grows or a new one over the limit, not one that shrank', () => {
    const now = { ...base, longFunctions: { 'src/a.ts#run': 201, 'src/a.ts#Turn.handle': 170, 'src/b.ts#make': 151 } };
    expect(regressions(base, now)).toEqual([
      'src/a.ts#run: grew 200 → 201 lines. Functions over 150 lines may not grow.',
      'src/b.ts#make: 151 lines, over the 150-line function limit (new or newly over). Extract steps.',
    ]);
    expect(lowered(base, now).longFunctions).toEqual({ 'src/a.ts#run': 200, 'src/a.ts#Turn.handle': 170 });
  });

  it('checks nothing new when the baseline predates these counters', () => {
    const old: Measurement = { oversized: {}, brandCritical: 0, brandWarnings: 0, lint: {} };
    expect(regressions(old, { ...old, asUnknownAs: 900, longFunctions: { 'src/x.ts#f': 999 } })).toEqual([]);
  });
});

describe('ratchet: new files cap at 300 lines', () => {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' }).trim();

  it('caps files added since the baseline commit, but not moved or old files', () => {
    repo({ 'src/old-big.ts': lines(400), 'src/keep.ts': lines(10) });
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const since = git('rev-parse', 'HEAD');
    git('mv', 'src/old-big.ts', 'src/moved-big.ts');
    writeFileSync(join(root, 'src/new-big.ts'), lines(301));
    writeFileSync(join(root, 'src/new-small.ts'), lines(300));
    writeFileSync(join(root, 'src/keep.ts'), lines(450)); // an old file may grow (the 500 rule still holds it)
    git('add', 'src/new-small.ts');
    git('commit', '-q', '-m', 'pr');
    const added = filesAddedSince(since, ['src'], root);
    expect(added).toEqual({ 'src/new-big.ts': 301, 'src/new-small.ts': 300 });
    expect(newFileRegressions(added, since)).toEqual([
      'src/new-big.ts: 301 lines in a new file, over the 300-line cap for new files. Split it.',
    ]);
  });

  it('fails loudly, not silently, when the baseline commit is missing', () => {
    repo({ 'src/a.ts': lines(1) });
    git('init', '-q');
    expect(filesAddedSince('0123456789abcdef0123456789abcdef01234567', ['src'], root)).toBeNull();
    expect(newFileRegressions(null, 'abc123')[0]).toMatch(/baseline commit abc123 is not in this checkout/);
  });
});
