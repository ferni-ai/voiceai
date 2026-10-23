import { describe, expect, it } from 'vitest';
import { allowedGrowth, countAsUnknownAs, longFunctions, sizeRegressions, type FileChange } from '../size-diff.js';

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n';
/** A file holding one function of exactly `n` lines named `name`. */
const fn = (name: string, n: number, pad = 0): string =>
  `${lines(pad)}export function ${name}(): number {\n  let x = 0;\n${Array.from({ length: n - 4 }, (_, i) => `  x += ${i};`).join('\n')}\n  return x;\n}\n`;
const change = (path: string, head: string, base: string | null): FileChange => ({ path, head, base });

describe('size diff: files', () => {
  it('caps a new file at 300 lines, but not a moved or old one', () => {
    expect(sizeRegressions([change('src/new.ts', lines(301), null)])).toEqual([
      'src/new.ts: 301 lines in a new file, over the 300-line cap for new files. Split it.',
    ]);
    expect(sizeRegressions([change('src/new.ts', lines(300), null)])).toEqual([]);
    expect(sizeRegressions([change('src/moved.ts', lines(450), lines(450))])).toEqual([]); // a rename keeps its base text
    expect(sizeRegressions([change('src/old.ts', lines(480), lines(200))])).toEqual([]); // under 500 it may grow
  });

  it('fails a file over 500 that grows or one that crosses 500, not one that shrinks', () => {
    expect(sizeRegressions([change('src/big.ts', lines(901), lines(900))])[0]).toMatch(/grew 900 → 901/);
    expect(sizeRegressions([change('src/edge.ts', lines(501), lines(499))])[0]).toMatch(/499 → 501 lines, over the 500-line limit/);
    expect(sizeRegressions([change('src/big.ts', lines(850), lines(900))])).toEqual([]);
  });
});

describe('size diff: functions', () => {
  it('names long functions by their place, and skips short ones', () => {
    const text = `export class Turn {\n  handle(): void {\n${'    void 0;\n'.repeat(160)}  }\n}\nexport const arrow = (): void => {\n${'  void 0;\n'.repeat(155)}};\n`;
    expect(longFunctions('src/a.ts', text)).toEqual({ 'Turn.handle': 162, arrow: 157 });
    expect(longFunctions('src/a.ts', fn('short', 40))).toEqual({});
  });

  it('caps a new function at 150 and fails one that crosses 150', () => {
    expect(sizeRegressions([change('src/a.ts', fn('run', 151), null)])[0]).toMatch(/src\/a\.ts#run: 151 lines.*new or newly over/);
    expect(sizeRegressions([change('src/a.ts', fn('run', 151), fn('run', 150))])).toHaveLength(1);
    expect(sizeRegressions([change('src/a.ts', fn('run', 150), null)])).toEqual([]);
  });

  it('lets a grandfathered function grow by max(5 lines, 2%), no more', () => {
    expect(allowedGrowth(200)).toBe(5);
    expect(allowedGrowth(2308)).toBe(47);
    expect(sizeRegressions([change('src/a.ts', fn('run', 205), fn('run', 200))])).toEqual([]);
    expect(sizeRegressions([change('src/a.ts', fn('run', 206), fn('run', 200))])[0]).toMatch(/grew 200 → 206 lines; .* may grow by 5/);
    // A file over 500 lines still may not grow at all (the file rule); only the function rule is shown here.
    const fnRule = (c: FileChange): string[] => sizeRegressions([c]).filter((m) => m.includes('#'));
    expect(fnRule(change('src/t.ts', fn('handleUserTurn', 2355), fn('handleUserTurn', 2308)))).toEqual([]);
    expect(fnRule(change('src/t.ts', fn('handleUserTurn', 2356), fn('handleUserTurn', 2308)))).toHaveLength(1);
  });
});

describe('size diff: as unknown as', () => {
  it('counts each cast, across lines too, but not one in a comment or string', () => {
    expect(countAsUnknownAs('const a = b as unknown as C;\nconst d = (e as\n  unknown as F);\nconst g = h as unknown;')).toBe(2);
    expect(countAsUnknownAs("// x as unknown as Y\nconst s = 'as unknown as';\nconst re = /as unknown as/;")).toBe(0);
  });

  it('fails a net rise across the touched files, and lets a cast move between them', () => {
    const cast = 'export const x = y as unknown as string;\n';
    expect(sizeRegressions([change('src/a.ts', cast, '')])[0]).toMatch(/casts in the touched files rose 0 → 1/);
    expect(sizeRegressions([change('src/a.ts', cast, ''), change('src/b.ts', '', cast)])).toEqual([]);
  });
});
