import { describe, expect, it } from 'vitest';
import { fromKnip, lowered, regressions, type DeadCode } from '../knip-ratchet.js';

const base: DeadCode = { files: ['src/old-dead.ts'], exports: { 'src/a.ts': 2, 'src/b.ts': 1 } };

describe('knip ratchet', () => {
  it("reads knip's JSON report: unused files, and unused exports plus types per file", () => {
    const d = fromKnip({
      issues: [
        { file: 'src/z.ts', files: [{ name: 'src/z.ts' }], exports: [], types: [] },
        { file: 'src/a.ts', files: [], exports: [{ name: 'x' }, { name: 'y' }], types: [{ name: 'T' }] },
        { file: 'src/clean.ts', files: [], exports: [], types: [] },
      ],
    });
    expect(d).toEqual({ files: ['src/z.ts'], exports: { 'src/a.ts': 3 } });
  });

  it('passes when nothing got worse, even if some dead code went away', () => {
    expect(regressions(base, base)).toEqual([]);
    expect(regressions(base, { files: [], exports: { 'src/a.ts': 1 } })).toEqual([]);
  });

  it('fails on a new unused file and on a file with more unused exports', () => {
    const worse = regressions(base, { files: ['src/old-dead.ts', 'src/new-dead.ts'], exports: { 'src/a.ts': 3, 'src/c.ts': 1 } });
    expect(worse).toEqual([
      'src/new-dead.ts: unused file (nothing imports it from an entry point)',
      'src/a.ts: unused exports 2 → 3',
      'src/c.ts: unused exports 0 → 1',
    ]);
  });

  it('reports a newly dead file once, not again for its exports', () => {
    expect(regressions(base, { files: ['src/old-dead.ts', 'src/d.ts'], exports: { ...base.exports, 'src/d.ts': 4 } })).toHaveLength(1);
  });

  it('lowers the baseline and never raises it', () => {
    expect(lowered(base, { files: ['src/new.ts'], exports: { 'src/a.ts': 1, 'src/c.ts': 5 } })).toEqual({
      files: [],
      exports: { 'src/a.ts': 1 },
    });
  });
});
