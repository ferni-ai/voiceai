import { describe, expect, it } from 'vitest';
import { added, emptinessProblem, fromKnip, type DeadCode } from '../knip-ratchet.js';

const base: DeadCode = { files: ['src/old-dead.ts'], exports: { 'src/a.ts': 2, 'src/b.ts': 1 } };
const same = (p: string): string => p;

describe('knip gate: reading the report', () => {
  it('reads unused files, and unused exports plus types per file', () => {
    const d = fromKnip({
      issues: [
        { file: 'src/z.ts', files: [{ name: 'src/z.ts' }], exports: [], types: [] },
        { file: 'src/a.ts', files: [], exports: [{ name: 'x' }, { name: 'y' }], types: [{ name: 'T' }] },
        { file: 'src/clean.ts', files: [], exports: [], types: [] },
      ],
    });
    expect(d).toEqual({ files: ['src/z.ts'], exports: { 'src/a.ts': 3 } });
  });

  it('refuses a report whose shape changed instead of reading it as no dead code', () => {
    expect(() => fromKnip({ files: [] })).toThrow(/no issues array/);
    expect(() => fromKnip(null)).toThrow(/no issues array/);
    expect(() => fromKnip({ issues: [{ path: 'src/a.ts' }] })).toThrow(/unexpected shape/);
    expect(() => fromKnip({ issues: [{ file: 'src/a.ts', exports: 3 }] })).toThrow(/unexpected shape/);
  });

  it('fails an emptied project or a report that suddenly sees far less', () => {
    expect(emptinessProblem({ files: [], exports: {} }, base)).toMatch(/no unused files or exports at all/);
    const big: DeadCode = { files: [], exports: { 'src/a.ts': 3000 } };
    expect(emptinessProblem({ files: ['x'], exports: { 'src/a.ts': 1000 } }, big)).toMatch(/config or output change/);
    expect(emptinessProblem({ files: ['x'], exports: { 'src/a.ts': 2900 } }, big)).toBeNull();
  });
});

describe('knip gate: only what the change adds fails', () => {
  it('passes the base unchanged, and less dead code', () => {
    expect(added(base, base, same)).toEqual([]);
    expect(added({ files: [], exports: { 'src/a.ts': 1 } }, base, same)).toEqual([]);
  });

  it('fails a newly unused file and a file with more unused exports', () => {
    const now = { files: ['src/old-dead.ts', 'src/new-dead.ts'], exports: { 'src/a.ts': 3, 'src/c.ts': 1 } };
    expect(added(now, base, same)).toEqual([
      'src/new-dead.ts: unused file (nothing imports it from an entry point)',
      'src/a.ts: unused exports 2 → 3',
      'src/c.ts: unused exports 0 → 1',
    ]);
  });

  it('matches a moved file to its old path, and counts a new file from zero', () => {
    const toBase = (p: string): string | null => (p === 'src/moved/old-dead.ts' ? 'src/old-dead.ts' : p === 'src/new.ts' ? null : p);
    const now = { files: ['src/moved/old-dead.ts'], exports: { ...base.exports, 'src/new.ts': 2 } };
    expect(added(now, base, toBase)).toEqual(['src/new.ts: unused exports 0 → 2']);
  });

  it('reports a newly dead file once, not again for its exports', () => {
    expect(added({ files: ['src/old-dead.ts', 'src/d.ts'], exports: { ...base.exports, 'src/d.ts': 4 } }, base, same)).toHaveLength(1);
  });
});
