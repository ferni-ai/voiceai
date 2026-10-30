/**
 * The setup job's count of the unit tests `vitest --changed` selects decides whether
 * a PR's affected tests run on one shard or four (ci.yml). Over THRESHOLD files one
 * shard times out (src/config/flags/ reaches ~1,500 test files), so the split must
 * trip above it, stay off at it, and fall back to four shards on any failure.
 */
import { describe, expect, it } from 'vitest';
import { affectedDecision, THRESHOLD } from '../unit-affected-count.mjs';

const files = (n: number) => () => Array.from({ length: n }, (_, i) => `src/a/${i}.test.ts`);

describe('when the affected unit tests are split over four shards', () => {
  it('has a threshold between a quarter-suite shard and the flag-file set', () => {
    // A shard of a full run (~550 files) takes 14 min; the flag barrel selects ~1,500.
    expect(THRESHOLD).toBeGreaterThan(550);
    expect(THRESHOLD).toBeLessThan(1400);
  });

  it('stays on one shard at the threshold and splits one file above it', () => {
    expect(affectedDecision({ list: files(THRESHOLD) })).toMatchObject({
      count: THRESHOLD,
      sharded: false,
    });
    expect(affectedDecision({ list: files(THRESHOLD + 1) })).toMatchObject({
      count: THRESHOLD + 1,
      sharded: true,
    });
  });

  it('keeps a PR with no affected tests on one shard', () => {
    expect(affectedDecision({ list: files(0) })).toMatchObject({ count: 0, sharded: false });
  });

  it('splits a flag-file sized set', () => {
    expect(affectedDecision({ list: files(1565) }).sharded).toBe(true);
  });

  it('passes the root and base to the lister and honours a custom threshold', () => {
    const seen: unknown[][] = [];
    const decision = affectedDecision({
      root: '/repo',
      base: 'HEAD^2',
      threshold: 2,
      list: (...args: unknown[]) => {
        seen.push(args);
        return ['a', 'b', 'c'];
      },
    });
    expect(seen).toEqual([['/repo', 'HEAD^2']]);
    expect(decision).toMatchObject({ count: 3, sharded: true });
  });

  it('splits when vitest cannot be asked: a wrong "one shard" times a PR out', () => {
    const decision = affectedDecision({
      list: () => {
        throw new Error('vitest list failed');
      },
    });
    expect(decision.sharded).toBe(true);
    expect(decision.reason).toMatch(/^check failed \(vitest list failed\)/);
  });
});
