/**
 * Spontaneous Thoughts System
 *
 * Generates spontaneous thoughts that make personas feel alive.
 * Now loads from persona bundles for variation.
 *
 * @module intelligence/human-behaviors/spontaneous-thoughts
 */
export interface SpontaneousThought {
    thought: string;
    trigger: 'random' | 'topic' | 'time' | 'weather' | 'market';
    context?: string;
}
/**
 * Get a spontaneous thought (5% chance)
 */
export declare function getSpontaneousThought(personaId?: string): SpontaneousThought | null;
export default getSpontaneousThought;
//# sourceMappingURL=spontaneous-thoughts.d.ts.map