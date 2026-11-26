import { describe, expect, it } from 'vitest';
import { loosened, SHRINK_ONLY_BASELINES } from '../baseline-shrink.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../../..');

describe('loosened: a baseline may only shrink', () => {
  it('passes a list that lost entries and fails one that gained any', () => {
    expect(loosened(['a.ts', 'b.ts'], ['a.ts'])).toEqual([]);
    expect(loosened(['a.ts'], ['a.ts', 'c.ts'])).toEqual(['$: adds "c.ts"']);
  });

  it('treats a moved file as its old path, so a move is not new debt', () => {
    const moved = new Map([['src/new/a.ts', 'src/old/a.ts']]);
    expect(loosened(['src/old/a.ts'], ['src/new/a.ts'], moved)).toEqual([]);
    expect(
      loosened({ 'src/old/a.ts': { colour: 2 } }, { 'src/new/a.ts': { colour: 2 } }, moved)
    ).toEqual([]);
  });

  it('fails a mock-paths entry that gains a path or a new file key', () => {
    const base = { 't.test.ts': ['./x.js'] };
    expect(loosened(base, { 't.test.ts': [] })).toEqual([]);
    expect(loosened(base, { 't.test.ts': ['./x.js', './y.js'] })).toEqual([
      '$["t.test.ts"]: adds "./y.js"',
    ]);
    expect(loosened(base, { ...base, 'u.test.ts': ['./z.js'] })).toEqual(['$: adds "u.test.ts"']);
  });

  it('fails a design-value count that rises, and passes one that falls', () => {
    const base = { 'a.ts': { colour: 3, fontSize: 1 } };
    expect(loosened(base, { 'a.ts': { colour: 2 } })).toEqual([]);
    expect(loosened(base, { 'a.ts': { colour: 4, fontSize: 1 } })).toEqual([
      '$["a.ts"]["colour"]: rises from 3 to 4',
    ]);
    expect(loosened(base, { 'a.ts': { colour: 3, shadow: 1 } })).toEqual([
      '$["a.ts"]: adds "shadow"',
    ]);
  });

  it('fails a change of shape', () => {
    expect(loosened(['a'], { a: 1 })).toEqual(['$: became an object']);
    expect(loosened({ a: 1 }, ['a'])).toEqual(['$: became a list']);
  });

  it('names baselines that exist in the repo', () => {
    for (const path of SHRINK_ONLY_BASELINES) expect(existsSync(join(REPO, path)), path).toBe(true);
  });
});
