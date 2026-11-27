/**
 * The unit shard's job limit has room above what a green shard takes (#3301). The limit was set
 * to 25 minutes when a shard ran ~8 (#2553); the suite grew, and over 80 CI runs to 2026-11-26 a
 * green shard took a median of 16-18 minutes, p90 up to 24.1 and at most 24.7. Shard 2 then hit
 * the limit with every test passed (824 files green, job cancelled at 25:00), and the merge queue
 * dropped the PR. 40 minutes is that maximum plus about 60%.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ci = readFileSync(join(__dirname, '..', '..', '..', '.github/workflows/ci.yml'), 'utf8');

/** The `timeout-minutes` of a top-level job in ci.yml, read from its own block. */
function jobTimeout(id: string): number | undefined {
  const start = ci.search(new RegExp(`^ {2}${id}:$`, 'm'));
  if (start < 0) return undefined;
  const rest = ci.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:$/m);
  const block = next < 0 ? rest : rest.slice(0, next);
  const m = /^ {4}timeout-minutes: (\d+)$/m.exec(block);
  return m ? Number(m[1]) : undefined;
}

describe('unit shard job limit', () => {
  it('gives a unit shard 40 minutes', () => {
    expect(jobTimeout('test-unit-shard')).toBe(40);
  });

  it('reads the limit from the shard job, not a neighbour', () => {
    expect(jobTimeout('test-unit-shard')).not.toBe(jobTimeout('setup'));
    expect(jobTimeout('no-such-job')).toBeUndefined();
  });
});
