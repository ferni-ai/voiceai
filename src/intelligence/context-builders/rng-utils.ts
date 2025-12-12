/**
 * RNG Utilities for Context Builders
 *
 * Provides deterministic random number generation for context builders.
 * Seeds are derived from the input (userText, turnCount, sessionId) so that:
 * - Same input → same random decisions (testable)
 * - Different turns/sessions → different random decisions (varied behavior)
 *
 * Usage:
 *   const rng = createBuilderRng(input, 'team-dynamics');
 *   if (rng.chance(0.4)) { ... }
 *   const item = rng.pick(items);
 */

import type { ContextBuilderInput } from './index.js';

// ============================================================================
// CORE RNG (FNV-1a + Mulberry32)
// ============================================================================

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296; // [0,1)
  };
}

// ============================================================================
// BUILDER RNG INTERFACE
// ============================================================================

export interface BuilderRng {
  /**
   * Returns true with the given probability [0, 1].
   * Same input + same probability = same result.
   */
  chance(probability: number): boolean;

  /**
   * Returns a random float in [0, 1).
   */
  float(): number;

  /**
   * Returns a random integer in [0, maxExclusive).
   */
  int(maxExclusive: number): number;

  /**
   * Picks a random item from an array.
   * Returns null if array is empty.
   */
  pick<T>(items: readonly T[]): T | null;

  /**
   * Creates a sub-RNG with a different seed suffix.
   * Useful for independent random decisions within the same builder.
   */
  fork(suffix: string): BuilderRng;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

function createRngFromSeed(seed: string): BuilderRng {
  const seed32 = fnv1a32(seed);
  const next = mulberry32(seed32);

  return {
    chance(probability: number): boolean {
      const p = Math.max(0, Math.min(1, probability));
      if (p === 0) return false;
      if (p === 1) return true;
      return next() < p;
    },

    float(): number {
      return next();
    },

    int(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },

    pick<T>(items: readonly T[]): T | null {
      if (items.length === 0) return null;
      return items[Math.floor(next() * items.length)] ?? null;
    },

    fork(suffix: string): BuilderRng {
      return createRngFromSeed(`${seed}:${suffix}`);
    },
  };
}

/**
 * Create a deterministic RNG for a context builder.
 *
 * The seed is derived from:
 * - builderName (ensures different builders get different sequences)
 * - sessionId (ensures different sessions get different behavior)
 * - turnCount (ensures different turns get different behavior)
 * - userText hash (ensures same text triggers same decisions)
 *
 * @param input - The ContextBuilderInput
 * @param builderName - Unique identifier for this builder
 * @returns A BuilderRng instance
 */
export function createBuilderRng(input: ContextBuilderInput, builderName: string): BuilderRng {
  const sessionId = input.services?.sessionId || 'unknown';
  const turnCount = input.userData?.turnCount || 0;
  const textHash = fnv1a32(input.userText || '');

  const seed = `${builderName}:${sessionId}:${turnCount}:${textHash}`;
  return createRngFromSeed(seed);
}

/**
 * Create a simple RNG from a string seed.
 * Useful for tests or when you don't have ContextBuilderInput.
 */
export function createSimpleRng(seed: string): BuilderRng {
  return createRngFromSeed(seed);
}


