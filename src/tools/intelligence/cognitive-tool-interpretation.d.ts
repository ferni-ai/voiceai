/**
 * Cognitive Tool Result Interpretation
 *
 * Each persona interprets tool results through their cognitive lens.
 * Peter sees data patterns, Maya sees emotional implications,
 * Ferni sees narrative threads, etc.
 *
 * This makes tool results feel genuinely processed by each persona's mind.
 */
export interface ToolResultContext {
    toolName: string;
    toolDomain: string;
    result: unknown;
    wasSuccessful: boolean;
    userQuestion?: string;
}
export interface CognitiveInterpretation {
    /** Opening phrase before presenting result */
    framingPhrase: string;
    /** How to highlight the key insight */
    keyInsightStyle: 'data_point' | 'emotional_implication' | 'story_element' | 'action_item' | 'pattern' | 'wisdom';
    /** Suggested follow-up angle */
    suggestedFollowUp: string;
    /** Whether to show uncertainty about interpretation */
    showInterpretiveUncertainty: boolean;
    /** Persona-specific lens description */
    interpretiveLens: string;
}
/**
 * Generate cognitive interpretation for a tool result
 */
export declare function interpretToolResult(personaId: string, context: ToolResultContext): CognitiveInterpretation;
/**
 * Get domain-specific interpretation guidance
 */
export declare function getDomainInterpretation(personaId: string, domain: string): string | null;
/**
 * Format tool result with cognitive framing
 */
export declare function formatToolResultWithCognition(personaId: string, context: ToolResultContext, rawResultText: string): string;
/**
 * Get thinking sound for processing a tool result
 *
 * HUMANIZATION FIX: Removed "Let me see/think/sit with this" - too robotic.
 * Keep conversational sounds that feel natural, not meta-commentary about processing.
 */
export declare function getToolProcessingSound(personaId: string): string;
declare const _default: {
    interpretToolResult: typeof interpretToolResult;
    getDomainInterpretation: typeof getDomainInterpretation;
    formatToolResultWithCognition: typeof formatToolResultWithCognition;
    getToolProcessingSound: typeof getToolProcessingSound;
};
export default _default;
//# sourceMappingURL=cognitive-tool-interpretation.d.ts.map