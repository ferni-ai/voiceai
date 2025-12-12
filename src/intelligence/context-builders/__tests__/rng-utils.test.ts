/**
 * Tests for RNG (Random Number Generator) Utilities
 *
 * Tests deterministic random number generation for context builders.
 */

import { describe, it, expect } from 'vitest';
import { createSimpleRng, createBuilderRng, type BuilderRng } from '../rng-utils.js';
import type { ContextBuilderInput } from '../index.js';

describe('createSimpleRng', () => {
  describe('determinism', () => {
    it('produces same sequence for same seed', () => {
      const rng1 = createSimpleRng('test-seed');
      const rng2 = createSimpleRng('test-seed');

      // Should produce identical sequences
      expect(rng1.float()).toBe(rng2.float());
      expect(rng1.float()).toBe(rng2.float());
      expect(rng1.float()).toBe(rng2.float());
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = createSimpleRng('seed-a');
      const rng2 = createSimpleRng('seed-b');

      // At least one value should differ
      const values1 = [rng1.float(), rng1.float(), rng1.float()];
      const values2 = [rng2.float(), rng2.float(), rng2.float()];

      expect(values1).not.toEqual(values2);
    });
  });

  describe('float()', () => {
    it('returns values in [0, 1) range', () => {
      const rng = createSimpleRng('float-test');

      for (let i = 0; i < 100; i++) {
        const value = rng.float();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('produces varied values', () => {
      const rng = createSimpleRng('variety-test');
      const values = new Set<number>();

      for (let i = 0; i < 100; i++) {
        values.add(rng.float());
      }

      // Should have many unique values
      expect(values.size).toBeGreaterThan(90);
    });
  });

  describe('int()', () => {
    it('returns values in [0, max) range', () => {
      const rng = createSimpleRng('int-test');

      for (let i = 0; i < 100; i++) {
        const value = rng.int(10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('handles max of 1', () => {
      const rng = createSimpleRng('int-one');

      for (let i = 0; i < 10; i++) {
        expect(rng.int(1)).toBe(0);
      }
    });

    it('returns 0 for invalid max values', () => {
      const rng = createSimpleRng('int-invalid');

      expect(rng.int(0)).toBe(0);
      expect(rng.int(-5)).toBe(0);
      expect(rng.int(Infinity)).toBe(0);
      expect(rng.int(NaN)).toBe(0);
    });

    it('produces varied integer distribution', () => {
      const rng = createSimpleRng('int-distribution');
      const counts = new Map<number, number>();

      for (let i = 0; i < 1000; i++) {
        const value = rng.int(5);
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      // All values 0-4 should appear
      for (let i = 0; i < 5; i++) {
        expect(counts.has(i)).toBe(true);
        expect(counts.get(i)!).toBeGreaterThan(100); // Rough distribution check
      }
    });
  });

  describe('chance()', () => {
    it('returns true for probability 1', () => {
      const rng = createSimpleRng('chance-one');

      for (let i = 0; i < 10; i++) {
        expect(rng.chance(1)).toBe(true);
      }
    });

    it('returns false for probability 0', () => {
      const rng = createSimpleRng('chance-zero');

      for (let i = 0; i < 10; i++) {
        expect(rng.chance(0)).toBe(false);
      }
    });

    it('returns mixed results for probability 0.5', () => {
      const rng = createSimpleRng('chance-half');
      let trueCount = 0;

      for (let i = 0; i < 1000; i++) {
        if (rng.chance(0.5)) trueCount++;
      }

      // Should be roughly 50% (with some variance)
      expect(trueCount).toBeGreaterThan(400);
      expect(trueCount).toBeLessThan(600);
    });

    it('clamps probability to [0, 1]', () => {
      const rng = createSimpleRng('chance-clamp');

      // Negative probability treated as 0
      expect(rng.chance(-0.5)).toBe(false);

      // Probability > 1 treated as 1
      const rng2 = createSimpleRng('chance-over');
      for (let i = 0; i < 10; i++) {
        expect(rng2.chance(1.5)).toBe(true);
      }
    });

    it('is deterministic', () => {
      const rng1 = createSimpleRng('chance-deterministic');
      const rng2 = createSimpleRng('chance-deterministic');

      for (let i = 0; i < 10; i++) {
        expect(rng1.chance(0.5)).toBe(rng2.chance(0.5));
      }
    });
  });

  describe('pick()', () => {
    it('returns null for empty array', () => {
      const rng = createSimpleRng('pick-empty');
      expect(rng.pick([])).toBeNull();
    });

    it('returns only element for single-item array', () => {
      const rng = createSimpleRng('pick-single');
      expect(rng.pick(['only'])).toBe('only');
    });

    it('returns items from array', () => {
      const rng = createSimpleRng('pick-items');
      const items = ['a', 'b', 'c', 'd', 'e'];

      for (let i = 0; i < 20; i++) {
        const picked = rng.pick(items);
        expect(items).toContain(picked);
      }
    });

    it('picks varied items over many iterations', () => {
      const rng = createSimpleRng('pick-varied');
      const items = ['a', 'b', 'c', 'd', 'e'];
      const picked = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const item = rng.pick(items);
        if (item) picked.add(item);
      }

      // Should have picked most/all items
      expect(picked.size).toBeGreaterThanOrEqual(4);
    });

    it('is deterministic', () => {
      const rng1 = createSimpleRng('pick-deterministic');
      const rng2 = createSimpleRng('pick-deterministic');
      const items = ['x', 'y', 'z'];

      for (let i = 0; i < 10; i++) {
        expect(rng1.pick(items)).toBe(rng2.pick(items));
      }
    });

    it('works with readonly arrays', () => {
      const rng = createSimpleRng('pick-readonly');
      const items: readonly string[] = ['frozen', 'array'];
      expect(['frozen', 'array']).toContain(rng.pick(items));
    });

    it('works with typed arrays', () => {
      const rng = createSimpleRng('pick-typed');
      const items: number[] = [1, 2, 3, 4, 5];
      const picked = rng.pick(items);
      expect(typeof picked).toBe('number');
      expect(items).toContain(picked);
    });
  });

  describe('fork()', () => {
    it('creates independent sub-RNG', () => {
      const rng = createSimpleRng('parent-seed');
      const child1 = rng.fork('child-a');
      const child2 = rng.fork('child-b');

      // Children should produce different sequences
      const seq1 = [child1.float(), child1.float(), child1.float()];
      const seq2 = [child2.float(), child2.float(), child2.float()];

      expect(seq1).not.toEqual(seq2);
    });

    it('forked RNG is deterministic', () => {
      const rng1 = createSimpleRng('fork-parent');
      const rng2 = createSimpleRng('fork-parent');

      const child1 = rng1.fork('same-suffix');
      const child2 = rng2.fork('same-suffix');

      expect(child1.float()).toBe(child2.float());
      expect(child1.int(100)).toBe(child2.int(100));
    });

    it('does not affect parent RNG', () => {
      const rng = createSimpleRng('parent');
      const parentValue1 = rng.float();

      const child = rng.fork('child');
      child.float();
      child.float();

      // Reset with same seed to compare
      const rng2 = createSimpleRng('parent');
      rng2.float(); // Skip first value

      // Parent's sequence should not be affected by child operations
      expect(rng.float()).toBe(rng2.float());
    });
  });
});

describe('createBuilderRng', () => {
  const createMockInput = (overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput => {
    // Create a minimal valid ContextBuilderInput with required fields
    const base = {
      userText: 'Hello, how are you?',
      services: {
        sessionId: 'test-session-123',
      } as ContextBuilderInput['services'],
      userData: {
        turnCount: 5,
      } as ContextBuilderInput['userData'],
      userProfile: null,
      // Use unknown cast to bypass strict type checking for mock data
      analysis: {
        primary: { type: 'statement', confidence: 0.8 },
        emotions: [],
        keyTerms: [],
        complexity: 'simple',
        length: 'short',
        emotion: { primary: 'neutral', intensity: 0.5 },
        intent: { primary: 'greeting', confidence: 0.9 },
        topics: [],
        state: { current: 'active' },
      } as unknown as ContextBuilderInput['analysis'],
      ...overrides,
    };
    return base as ContextBuilderInput;
  };

  it('creates deterministic RNG from builder input', () => {
    const input = createMockInput();
    const rng1 = createBuilderRng(input, 'my-builder');
    const rng2 = createBuilderRng(input, 'my-builder');

    expect(rng1.float()).toBe(rng2.float());
    expect(rng1.int(100)).toBe(rng2.int(100));
    expect(rng1.chance(0.5)).toBe(rng2.chance(0.5));
  });

  it('produces different RNG for different builder names', () => {
    const input = createMockInput();
    const rng1 = createBuilderRng(input, 'builder-a');
    const rng2 = createBuilderRng(input, 'builder-b');

    // Should produce different sequences
    const seq1 = [rng1.float(), rng1.float()];
    const seq2 = [rng2.float(), rng2.float()];
    expect(seq1).not.toEqual(seq2);
  });

  it('produces different RNG for different sessions', () => {
    const input1 = createMockInput({
      services: { sessionId: 'session-1' } as ContextBuilderInput['services'],
    });
    const input2 = createMockInput({
      services: { sessionId: 'session-2' } as ContextBuilderInput['services'],
    });

    const rng1 = createBuilderRng(input1, 'builder');
    const rng2 = createBuilderRng(input2, 'builder');

    expect(rng1.float()).not.toBe(rng2.float());
  });

  it('produces different RNG for different turn counts', () => {
    const input1 = createMockInput({
      userData: { turnCount: 1 } as ContextBuilderInput['userData'],
    });
    const input2 = createMockInput({
      userData: { turnCount: 2 } as ContextBuilderInput['userData'],
    });

    const rng1 = createBuilderRng(input1, 'builder');
    const rng2 = createBuilderRng(input2, 'builder');

    expect(rng1.float()).not.toBe(rng2.float());
  });

  it('produces different RNG for different user text', () => {
    const input1 = createMockInput({ userText: 'Hello' });
    const input2 = createMockInput({ userText: 'Goodbye' });

    const rng1 = createBuilderRng(input1, 'builder');
    const rng2 = createBuilderRng(input2, 'builder');

    expect(rng1.float()).not.toBe(rng2.float());
  });

  it('handles missing services gracefully', () => {
    const input = createMockInput({ services: undefined });
    const rng = createBuilderRng(input, 'builder');

    // Should not throw
    expect(rng.float()).toBeGreaterThanOrEqual(0);
    expect(rng.float()).toBeLessThan(1);
  });

  it('handles missing userData gracefully', () => {
    const input = createMockInput({ userData: undefined });
    const rng = createBuilderRng(input, 'builder');

    // Should not throw
    expect(rng.float()).toBeGreaterThanOrEqual(0);
  });

  it('handles empty userText gracefully', () => {
    const input = createMockInput({ userText: '' });
    const rng = createBuilderRng(input, 'builder');

    // Should not throw
    expect(rng.float()).toBeGreaterThanOrEqual(0);
  });
});

describe('RNG integration scenarios', () => {
  it('can be used for weighted random selection', () => {
    const rng = createSimpleRng('weighted-selection');
    const options = [
      { name: 'common', weight: 0.7 },
      { name: 'uncommon', weight: 0.2 },
      { name: 'rare', weight: 0.1 },
    ];

    function weightedPick(rng: BuilderRng, opts: Array<{ name: string; weight: number }>) {
      const rand = rng.float();
      let cumulative = 0;
      for (const opt of opts) {
        cumulative += opt.weight;
        if (rand < cumulative) return opt.name;
      }
      return opts[opts.length - 1]?.name ?? null;
    }

    const counts = { common: 0, uncommon: 0, rare: 0 };
    for (let i = 0; i < 1000; i++) {
      const picked = weightedPick(rng, options) as keyof typeof counts;
      if (picked) counts[picked]++;
    }

    // Check roughly expected distribution
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
  });

  it('can shuffle an array deterministically', () => {
    function shuffle<T>(rng: BuilderRng, items: T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    }

    const rng1 = createSimpleRng('shuffle-seed');
    const rng2 = createSimpleRng('shuffle-seed');
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const shuffled1 = shuffle(rng1, items);
    const shuffled2 = shuffle(rng2, items);

    // Same seed = same shuffle
    expect(shuffled1).toEqual(shuffled2);

    // But different from original
    expect(shuffled1).not.toEqual(items);
  });
});
