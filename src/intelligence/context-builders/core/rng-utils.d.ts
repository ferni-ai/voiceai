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
import type { ContextBuilderInput } from '../index.js';
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
export declare function createBuilderRng(input: ContextBuilderInput, builderName: string): BuilderRng;
/**
 * Create a simple RNG from a string seed.
 * Useful for tests or when you don't have ContextBuilderInput.
 */
export declare function createSimpleRng(seed: string): BuilderRng;
//# sourceMappingURL=rng-utils.d.ts.map