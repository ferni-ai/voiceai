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
/**
 * Create a deterministic RNG from a string seed.
 */
export declare function createSeededRandom(seed: string): RandomSource;
/**
 * Deterministic float in [0, 1) from a seed string (stateless).
 */
export declare function seededFloat(seed: string): number;
/**
 * Deterministic chance check from a seed string (stateless).
 */
export declare function seededChance(seed: string, probability: number): boolean;
/**
 * Deterministic index selection from a seed string (stateless).
 */
export declare function seededIndex(seed: string, length: number): number;
/**
 * Deterministic array pick from a seed string (stateless).
 */
export declare function seededPick<T>(seed: string, items: readonly T[]): T | null;
/**
 * Wrap `Math.random()` in the `RandomSource` interface.
 */
export declare function createSystemRandom(): RandomSource;
/**
 * Deterministic chance helper.
 */
export declare function chance(rng: RandomSource, probability: number): boolean;
//# sourceMappingURL=rng.d.ts.map