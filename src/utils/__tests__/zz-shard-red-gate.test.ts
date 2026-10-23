// DO NOT MERGE: probe for #2553. One deliberately failing unit test, to prove the
// aggregate "Unit Tests" check goes red when a single shard fails.
import { describe, expect, it } from 'vitest';

describe('shard red-gate probe', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
