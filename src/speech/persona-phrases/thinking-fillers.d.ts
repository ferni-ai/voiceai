/**
 * Persona Phrases - Thinking Fillers
 *
 * Thinking/processing fillers for all personas.
 *
 * @module persona-phrases/thinking-fillers
 */
/**
 * Get thinking filler for a persona
 *
 * @deprecated Use getContextAwareThinkingFiller(personaId, { forDeadAirPrevention: true }).
 * Will be removed in Q2 2025.
 */
export declare function getThinkingFiller(personaId: string): string;
/**
 * Get context-aware thinking/processing phrase
 *
 * Uses ProcessingIntelligence to compose the right phrase based on context.
 * This is the preferred method for new code.
 *
 * @param personaId - The persona ID
 * @param options - Optional context for phrase composition
 * @param options.forDeadAirPrevention - If true, returns actual verbal filler (not empty)
 * @returns SSML-formatted thinking phrase (empty by default, verbal if forDeadAirPrevention)
 */
export declare function getContextAwareThinkingFiller(personaId: string, options?: {
    type?: 'thinking' | 'emotional' | 'tool_call' | 'memory_recall';
    weight?: 'light' | 'medium' | 'heavy';
    emotionalState?: {
        primary: string;
        intensity: number;
    };
    hourOfDay?: number;
    relationshipStage?: string;
    /**
     * If true, returns actual verbal content like "Mm", "So...", "Yeah"
     * for dead air prevention. By default (false), returns empty strings
     * to let the LLM generate natural responses.
     */
    forDeadAirPrevention?: boolean;
}): string;
//# sourceMappingURL=thinking-fillers.d.ts.map