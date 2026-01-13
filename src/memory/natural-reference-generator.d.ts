/**
 * Natural Reference Generator
 *
 * Generates natural, context-aware ways to reference memories.
 * Moves beyond template-based references to genuinely human callbacks.
 *
 * Philosophy: When a friend references something from the past, they don't say
 * "I remember we talked about {topic} {timeAgo}." They say something like
 * "Oh! That's kind of like what you were dealing with last month, right?"
 *
 * @module memory/natural-reference-generator
 */
import type { NaturalReferenceGenerator as NaturalReferenceGeneratorInterface, ReferenceStyle, GeneratedReference, RetrievedMemory, MemoryItem } from './interfaces/index.js';
export declare class NaturalReferenceGeneratorImpl implements NaturalReferenceGeneratorInterface {
    /**
     * Generate a natural reference for a memory
     */
    generate(memory: RetrievedMemory, context: {
        userMood: string;
        relationshipStage: string;
        personaId: string;
        conversationTone: string;
    }): GeneratedReference;
    /**
     * Determine best style for context
     */
    getStyleForContext(context: {
        userMood: string;
        personaStyle: string;
        memoryType: MemoryItem['type'];
    }): ReferenceStyle['style'];
    /**
     * Fill a template with memory content
     */
    private fillTemplate;
    /**
     * Extract a natural summary from memory content
     */
    private extractSummary;
    /**
     * Get alternative styles that would also work
     */
    private getAlternativeStyles;
    /**
     * Calculate confidence in this reference
     */
    private calculateConfidence;
}
export declare function getNaturalReferenceGenerator(): NaturalReferenceGeneratorInterface;
export declare function resetNaturalReferenceGenerator(): void;
/**
 * Generate a natural memory reference in one call
 */
export declare function generateNaturalReference(memory: RetrievedMemory, context: {
    userMood: string;
    relationshipStage: string;
    personaId: string;
    conversationTone?: string;
}): string;
declare const _default: {
    NaturalReferenceGeneratorImpl: typeof NaturalReferenceGeneratorImpl;
    getNaturalReferenceGenerator: typeof getNaturalReferenceGenerator;
    resetNaturalReferenceGenerator: typeof resetNaturalReferenceGenerator;
    generateNaturalReference: typeof generateNaturalReference;
};
export default _default;
//# sourceMappingURL=natural-reference-generator.d.ts.map