import { describe, expect, it } from 'vitest';
import { memoryFactsEnabled } from '../memory-facts-flag.js';

describe('MEMORY_FACTS flag', () => {
  it('is off by default and on only when set', () => {
    expect(memoryFactsEnabled({})).toBe(false);
    expect(memoryFactsEnabled({ MEMORY_FACTS: 'on' })).toBe(true);
    expect(memoryFactsEnabled({ MEMORY_FACTS: 'off' })).toBe(false);
  });
});
