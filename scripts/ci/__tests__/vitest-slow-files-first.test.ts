/**
 * The unit shards' sequencer moves known-slow files to the front without moving any file to
 * another shard. Real BaseSequencer on both sides; the specs are the fields it reads.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { BaseSequencer, type TestSpecification, type Vitest } from 'vitest/node';
import { SlowFilesFirstSequencer } from '../vitest-slow-files-first.js';

const root = mkdtempSync(join(tmpdir(), 'slow-first-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const project = { name: '', config: { sequence: { groupOrder: 0 }, isolate: true } };
const spec = (rel: string, bytes = 0): TestSpecification => {
  const moduleId = join(root, rel);
  if (bytes) writeFileSync(moduleId, 'x'.repeat(bytes));
  return { moduleId, project } as unknown as TestSpecification;
};
/** A vitest context with what the sequencer reads: root, shard, and an empty results cache. */
const ctx = (index = 1): Vitest =>
  ({
    config: { root, shard: { index, count: 4 } },
    cache: { getTestSpecificationResult: () => undefined },
  }) as unknown as Vitest;

const GRID = 'crisis-reply-never-lower-base-on.test.ts';

describe('SlowFilesFirstSequencer', () => {
  it('puts every file on the shard BaseSequencer puts it on', async () => {
    const files = [
      ...Array.from({ length: 41 }, (_, i) => spec(`src/a/__tests__/file-${i}.test.ts`)),
      spec(`src/agents/personas/__tests__/${GRID}`),
      spec('src/agents/personas/__tests__/crisis-reply-never-lower.test.ts'),
    ];
    const indexes = [1, 2, 3, 4];
    const ours = await Promise.all(
      indexes.map((index) => new SlowFilesFirstSequencer(ctx(index)).shard(files))
    );
    const base = await Promise.all(
      indexes.map((index) => new BaseSequencer(ctx(index)).shard(files))
    );
    expect(ours).toEqual(base);
    // the four shards together hold every file once
    expect(new Set(ours.flat()).size).toBe(files.length);
    expect(ours.flat()).toHaveLength(files.length);
  });

  it('starts a small slow file before a large ordinary one, which BaseSequencer runs first', async () => {
    const small = spec(GRID, 1_500);
    const large = spec('large.test.ts', 30_000);
    // without cached results, BaseSequencer runs the larger file first
    expect(await new BaseSequencer(ctx()).sort([small, large])).toEqual([large, small]);
    expect(await new SlowFilesFirstSequencer(ctx()).sort([small, large])).toEqual([small, large]);
  });

  it('keeps BaseSequencer order among the rest', async () => {
    const files = [spec('b.test.ts', 2_000), spec('c.test.ts', 9_000), spec('d.test.ts', 5_000)];
    expect(await new SlowFilesFirstSequencer(ctx()).sort(files)).toEqual(
      await new BaseSequencer(ctx()).sort(files)
    );
  });

  it('moves the whole grid family by one pattern, a file split off or renamed in it too', async () => {
    const large = spec('large-2.test.ts', 30_000);
    const startsFirst = async (name: string): Promise<[string, boolean]> => [
      name,
      (await new SlowFilesFirstSequencer(ctx()).sort([large, spec(name, 100)]))[0] !== large,
    ];
    const names = [
      GRID,
      'crisis-reply-never-lower.test.ts',
      'crisis-reply-never-lower-x.test.ts',
      'crisis-reply-never-lower.grid.ts',
      'crisis-reply.test.ts',
      'other.test.ts',
    ];
    expect(Object.fromEntries(await Promise.all(names.map(startsFirst)))).toEqual({
      [GRID]: true,
      'crisis-reply-never-lower.test.ts': true,
      'crisis-reply-never-lower-x.test.ts': true,
      'crisis-reply-never-lower.grid.ts': false,
      'crisis-reply.test.ts': false,
      'other.test.ts': false,
    });
  });
});
