/**
 * Cognitive Handoff Integration
 *
 * Captures and transfers cognitive insights during persona handoffs.
 * When a user moves from one persona to another, we transfer:
 * - What cognitive approaches worked
 * - What the user's thinking style seems to be
 * - What topics need special attention
 * - Cognitive blind spots the next persona should watch for
 */
import type { ReasoningStyle } from '../../personas/cognitive-types.js';
export interface CognitiveHandoffContext {
    /** What the previous persona noticed/focused on */
    noticed: string[];
    /** Potential blind spots the previous persona might have missed */
    potentialBlindSpots: string[];
    /** Detected user cognitive style */
    userCognitiveStyle?: ReasoningStyle;
    /** Confidence in user style detection */
    userStyleConfidence: number;
    /** Approaches that seemed to work well */
    effectiveApproaches: ReasoningStyle[];
    /** Approaches that didn't resonate */
    ineffectiveApproaches: ReasoningStyle[];
    /** Topics where the user showed expertise */
    userExpertiseAreas: string[];
    /** Topics where the user seemed less experienced */
    userNoviceAreas: string[];
    /** Emotional context being carried forward */
    emotionalContext: {
        weight: number;
        primaryEmotion?: string;
        needsValidation: boolean;
    };
    /** Handoff note from the cognitive perspective */
    handoffNote: string;
    /** Previous persona's reasoning style */
    previousPersonaStyle: ReasoningStyle;
    /** Knowledge already explained to user */
    explainedTopics: string[];
}
export interface CognitiveHandoffInput {
    previousPersonaId: string;
    targetPersonaId: string;
    conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    currentTopic: string;
    emotionalWeight: number;
    userExpertise: 'novice' | 'intermediate' | 'expert' | 'unknown';
}
/**
 * Record that a topic was explained to the user
 */
export declare function recordTopicExplained(sessionId: string, topic: string): void;
/**
 * Record detected user expertise on a topic
 */
export declare function recordUserExpertise(sessionId: string, topic: string, level: 'expert' | 'novice'): void;
/**
 * Record effectiveness of a cognitive approach
 */
export declare function recordApproachEffectiveness(sessionId: string, approach: ReasoningStyle, engagementScore: number): void;
/**
 * Record detected user cognitive style
 */
export declare function recordUserCognitiveStyle(sessionId: string, style: ReasoningStyle, confidence: number): void;
/**
 * Build cognitive context for handoff
 */
export declare function buildCognitiveHandoffContext(input: CognitiveHandoffInput, sessionId: string): CognitiveHandoffContext;
/**
 * Format cognitive context for injection into handoff instructions
 */
export declare function formatCognitiveHandoffForPrompt(context: CognitiveHandoffContext): string;
/**
 * Clear cognitive state for a session
 */
export declare function clearSessionCognitiveState(sessionId: string): void;
/**
 * Clear all session cognitive states (for testing)
 */
export declare function clearAllSessionCognitiveStates(): void;
declare const _default: {
    buildCognitiveHandoffContext: typeof buildCognitiveHandoffContext;
    formatCognitiveHandoffForPrompt: typeof formatCognitiveHandoffForPrompt;
    recordTopicExplained: typeof recordTopicExplained;
    recordUserExpertise: typeof recordUserExpertise;
    recordApproachEffectiveness: typeof recordApproachEffectiveness;
    recordUserCognitiveStyle: typeof recordUserCognitiveStyle;
    clearSessionCognitiveState: typeof clearSessionCognitiveState;
};
export default _default;
//# sourceMappingURL=cognitive-handoff.d.ts.map