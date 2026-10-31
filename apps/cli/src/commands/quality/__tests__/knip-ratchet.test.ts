import { describe, expect, it } from 'vitest';
import { added, emptinessProblem, fromKnip, type DeadCode } from '../knip-ratchet.js';

const base: DeadCode = { files: ['src/old-dead.ts'], exports: { 'src/a.ts': ['x', 'y'], 'src/b.ts': ['z'] } };
const same = (p: string): string => p;
const none = new Map<string, string | null>();

describe('knip gate: reading the report', () => {
  it('reads unused files, and unused export and type names per file', () => {
    const d = fromKnip(
      {
        issues: [
          { file: 'src/z.ts', files: [{ name: 'src/z.ts' }], exports: [], types: [] },
          { file: 'src/a.ts', files: [], exports: [{ name: 'x' }, { name: 'y' }], types: [{ name: 'T' }] },
          { file: 'src/clean.ts', files: [], exports: [], types: [] },
        ],
      },
      'default'
    );
    expect(d).toEqual({ files: ['src/z.ts'], exports: { 'src/a.ts': ['x', 'y', 'type:T'] } });
  });

  it('refuses a report whose shape changed instead of reading it as no dead code', () => {
    expect(() => fromKnip({ files: [] }, 'default')).toThrow(/no issues array/);
    expect(() => fromKnip(null, 'default')).toThrow(/no issues array/);
    expect(() => fromKnip({ issues: [{ path: 'src/a.ts', files: [] }] }, 'default')).toThrow(/unexpected shape/);
    expect(() => fromKnip({ issues: [{ file: 'src/a.ts', exports: [], types: [] }] }, 'default')).toThrow(/unexpected shape/); // no files
    expect(() => fromKnip({ issues: [{ file: 'src/a.ts', files: [], types: [] }] }, 'default')).toThrow(/unexpected shape/); // no exports
    expect(() => fromKnip({ issues: [{ file: 'src/a.ts', files: [], exports: [{ id: 1 }], types: [] }] }, 'default')).toThrow(
      /unexpected shape/
    );
    // production mode lists files only
    expect(fromKnip({ issues: [{ file: 'src/p.ts', files: [{ name: 'src/p.ts' }] }] }, 'production')).toEqual({
      files: ['src/p.ts'],
      exports: {},
    });
    expect(() => fromKnip({ issues: [{ file: 'src/p.ts' }] }, 'production')).toThrow(/unexpected shape/);
  });

  it('fails an emptied project or a report that suddenly sees far less', () => {
    expect(emptinessProblem({ files: [], exports: {} }, base)).toMatch(/no unused files or exports at all/);
    const big: DeadCode = { files: [], exports: { 'src/a.ts': Array.from({ length: 3000 }, (_, i) => `e${i}`) } };
    expect(emptinessProblem({ files: ['x'], exports: { 'src/a.ts': Array.from({ length: 1000 }, (_, i) => `e${i}`) } }, big)).toMatch(
      /config or output change/
    );
    expect(emptinessProblem({ files: ['x'], exports: { 'src/a.ts': Array.from({ length: 2900 }, (_, i) => `e${i}`) } }, big)).toBeNull();
  });
});

describe('knip gate: only what the change adds fails', () => {
  it('passes the base unchanged, and less dead code', () => {
    expect(added(base, base, same, none)).toEqual([]);
    expect(added({ files: [], exports: { 'src/a.ts': ['x'] } }, base, same, none)).toEqual([]);
  });

  it('fails a newly unused file and a new unused export, naming the export', () => {
    const now = { files: ['src/old-dead.ts', 'src/new-dead.ts'], exports: { 'src/a.ts': ['x', 'y', 'w'], 'src/c.ts': ['q'] } };
    expect(added(now, base, same, none)).toEqual([
      'src/new-dead.ts: unused file (nothing imports it from an entry point)',
      'src/a.ts: unused export w',
      'src/c.ts: unused export q',
    ]);
  });

  it('lets a split move an existing unused export to another file (matched by name)', () => {
    // a.ts loses y to the new file part.ts, where it is still unused: not new dead code
    const touched = new Map<string, string | null>([['src/a.ts', 'src/a.ts']]);
    const now = { files: [], exports: { 'src/a.ts': ['x'], 'src/part.ts': ['y'], 'src/b.ts': ['z'] } };
    const toBase = (p: string): string | null => (p === 'src/part.ts' ? null : p);
    expect(added(now, base, toBase, touched)).toEqual([]);
    // the name has to come from a touched file: b.ts kept z, so a second z elsewhere is new
    const twice = { ...now, exports: { ...now.exports, 'src/part.ts': ['y', 'z'] } };
    expect(added(twice, base, toBase, touched)).toEqual(['src/part.ts: unused export z']);
  });

  it('matches a moved file to its old path', () => {
    const toBase = (p: string): string | null => (p === 'src/moved/old-dead.ts' ? 'src/old-dead.ts' : p);
    expect(added({ files: ['src/moved/old-dead.ts'], exports: base.exports }, base, toBase, none)).toEqual([]);
  });

  it('reports a newly dead file once, not again for its exports', () => {
    expect(added({ files: ['src/old-dead.ts', 'src/d.ts'], exports: { ...base.exports, 'src/d.ts': ['a', 'b'] } }, base, same, none)).toHaveLength(1);
  });
});
