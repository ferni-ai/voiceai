/**
 * forgetMemory is answered by the memory executor, which always returns a
 * reply, so the legacy fallback never sees it. The legacy branch that deleted
 * facts by substring and said "I've forgotten about that" was removed on that
 * basis; this pins the routing it relied on.
 */
import { describe, expect, it } from 'vitest';
import { getToolDomain } from '../index.js';

describe('forget routing', () => {
  it.each(['forgetMemory', 'forgetmemory'])('%s goes to the memory executor', (fn) => {
    expect(getToolDomain(fn)).toBe('memory');
  });
});
