/**
 * Authentic Thinking Pauses
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Maps actual cognitive load to natural pauses, creating the experience
 * that Ferni is genuinely thinking:
 *
 * - Complex questions → longer thinking pause + "Hmm..." phrase
 * - Simple questions → quick response
 * - Emotional content → gentle pause + soft entry
 *
 * Key insight: Rather than fixed delays, we use question complexity
 * and conversation context to determine appropriate "thinking time".
 *
 * Humans don't respond instantly. We pause, consider, reflect.
 * These pauses aren't empty - they signal that we're truly engaged,
 * that your question deserves real thought.
 *
 * COORDINATION: This module uses ThinkingPhraseCoordinator to prevent
 * duplicate "good question" phrases from multiple systems.
 */
export interface ThinkingContext {
    /** The user's message */
    userText: string;
    /** Detected question complexity (0-1) */
    questionComplexity: number;
    /** Whether user is in distress */
    isEmotional: boolean;
    /** Whether this requires factual lookup */
    requiresLookup: boolean;
    /** Current conversation depth (turns) */
    turnCount: number;
    /** Persona ID for persona-specific thinking sounds */
    personaId?: string;
    /** Session ID for coordination (prevents duplicate phrases across systems) */
    sessionId?: string;
}
export interface ThinkingPause {
    /** Thinking phrase to prepend (may be empty) */
    thinkingPhrase: string;
    /** SSML break duration in ms */
    pauseDurationMs: number;
    /** Whether to add a soft entry ("Well...") */
    softEntry: boolean;
    /** Speed adjustment for response (0.9 = slightly slower) */
    speedAdjustment: number;
}
/**
 * Analyze question complexity based on linguistic features
 */
export declare function analyzeQuestionComplexity(userText: string): number;
/**
 * @deprecated REMOVED - LLM generates natural thinking behavior from guidance
 * Kept for backwards compatibility with tests - returns empty strings.
 */
declare const personaThinkingPhrases: Record<string, string[]>;
/**
 * Get a thinking phrase for a persona.
 *
 * COORDINATED: Uses ThinkingPhraseCoordinator to prevent duplicate
 * "good question" phrases from multiple systems.
 */
declare function getThinkingPhrase(personaId: string | undefined, complexity: number, sessionId?: string, turnCount?: number): string;
/**
 * Calculate authentic thinking pause based on context
 */
export declare function calculateThinkingPause(context: ThinkingContext): ThinkingPause;
/**
 * Generate SSML for thinking pause
 */
export declare function generateThinkingSSML(pause: ThinkingPause): string;
/**
 * Wrap response with thinking pause SSML
 */
export declare function wrapWithThinkingPause(response: string, context: ThinkingContext): string;
/**
 * Create thinking context from conversation state
 */
export declare function createThinkingContext(userText: string, emotionIntensity: number, isQuestion: boolean, turnCount: number, personaId?: string, sessionId?: string): ThinkingContext;
export { personaThinkingPhrases, getThinkingPhrase };
//# sourceMappingURL=authentic-thinking.d.ts.map