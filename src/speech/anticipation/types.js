/**
 * Unified Anticipation Types
 *
 * Combines intent prediction and emotional prosody anticipation.
 *
 * @module speech/anticipation/types
 */
/**
 * Default options
 */
export const DEFAULT_ANTICIPATION_OPTIONS = {
    personaId: 'ferni',
    minConfidence: 0.5,
    preferenceWeight: {
        intent: 0.4,
        emotion: 0.6, // Prioritize emotional responsiveness
    },
    enableMicroReactions: true,
    enableTemplates: false, // Let LLM generate most responses
};
//# sourceMappingURL=types.js.map