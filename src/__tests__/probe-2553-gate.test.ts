import { describe, expect, it } from 'vitest';

// Throwaway probe for #2553 (DO NOT MERGE): one deliberately failing unit test.
// The Unit Tests gate must go red when any shard has a failing test.
describe('probe 2553 gate', () => {
  it('fails on purpose', () => {
    expect(1 + 1).toBe(3);
  });
});
