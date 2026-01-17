/**
 * Seeded RNG utilities for stable conversational behavior.
 *
 * We want conversational "probabilities" to feel consistent within a session
 * (relationship continuity) and to be testable (no flakiness).
 */

export interface RandomSource {
  /** Returns a float in [0, 1). */
  nextFloat(): number;
  /** Returns an integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hashToUnitInterval(hash32: number): number {
  // Map uint32 -> [0, 1)
  return (hash32 >>> 0) / 4294967296;
}

/**
 * Mulberry32 PRNG - fast, decent quality for non-cryptographic use.
 */
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

/**
 * Create a deterministic RNG from a string seed.
 */
export function createSeededRandom(seed: string): RandomSource {
  const seed32 = fnv1a32(seed);
  const next = mulberry32(seed32);
  return {
    nextFloat(): number {
      return next();
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
  };
}

/**
 * Deterministic float in [0, 1) from a seed string (stateless).
 */
export function seededFloat(seed: string): number {
  return hashToUnitInterval(fnv1a32(seed));
}

/**
 * Deterministic chance check from a seed string (stateless).
 */
export function seededChance(seed: string, probability: number): boolean {
  const p = Math.max(0, Math.min(1, probability));
  if (p === 0) return false;
  if (p === 1) return true;
  return seededFloat(seed) < p;
}

/**
 * Deterministic index selection from a seed string (stateless).
 */
export function seededIndex(seed: string, length: number): number {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const hash = fnv1a32(seed);
  return hash % Math.floor(length);
}

/**
 * Deterministic array pick from a seed string (stateless).
 */
export function seededPick<T>(seed: string, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[seededIndex(seed, items.length)] ?? null;
}

/**
 * Wrap `Math.random()` in the `RandomSource` interface.
 */
export function createSystemRandom(): RandomSource {
  return {
    nextFloat(): number {
      return Math.random();
    },
    nextInt(maxExclusive: number): number {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
      return Math.floor(Math.random() * maxExclusive);
    },
  };
}

/**
 * Deterministic chance helper.
 */
export function chance(rng: RandomSource, probability: number): boolean {
  const p = Math.max(0, Math.min(1, probability));
  if (p === 0) return false;
  if (p === 1) return true;
  return rng.nextFloat() < p;
}
