/**
 * Cognitive Intelligence Engine
 *
 * Processes cognitive profiles to generate persona-specific thinking patterns.
 * Makes each AI personality reason differently, notice different things,
 * and have distinct cognitive styles.
 */
import type { CognitiveProfile, CognitiveContext, CognitiveGuidance, ReasoningStyle } from './cognitive-types.js';
export declare class CognitiveIntelligenceEngine {
    private personaId;
    private profile;
    private conversationHistory;
    constructor(personaId: string, profile: CognitiveProfile);
    /**
     * Generate cognitive guidance for a specific context
     */
    generateGuidance(context: CognitiveContext): CognitiveGuidance;
    /**
     * Select the most appropriate reasoning approach for this context
     */
    private selectReasoningApproach;
    /**
     * Generate attention cues based on what this persona naturally notices
     */
    private generateAttentionCues;
    /**
     * Get a prompt for a specific attention focus
     */
    private getAttentionCuePrompt;
    /**
     * Describe a blind spot for self-awareness
     */
    private getBlindSpotDescription;
    /**
     * Check for potential cognitive biases that might be active
     */
    private checkForBiases;
    /**
     * Get a human-readable description of a bias type
     */
    private getBiasDescription;
    /**
     * Assess and adjust for user expertise level
     */
    private assessExpertise;
    /**
     * Calculate confidence level for this response
     */
    private calculateConfidence;
    /**
     * Select appropriate phrases based on context
     */
    private selectPhrases;
    /**
     * Check if confidence matches a named level
     */
    private confidenceMatchesLevel;
    /**
     * Should we show reasoning process?
     */
    private shouldShowReasoning;
    /**
     * Build a context injection string for LLM prompts
     */
    buildPromptInjection(context: CognitiveContext): string;
    /**
     * Get guidance text for a reasoning approach
     */
    private getReasoningGuidance;
    /**
     * Reset for new conversation
     */
    reset(): void;
    /**
     * Get conversation stats
     */
    getStats(): {
        approachesUsed: Record<ReasoningStyle, number>;
        topicsDiscussed: string[];
        averageExpertiseLevel: string;
    };
    private calculateAverageExpertise;
}
/**
 * Get or create a cognitive intelligence engine for a persona
 */
export declare function getCognitiveEngine(personaId: string, profile: CognitiveProfile): CognitiveIntelligenceEngine;
/**
 * Remove a cognitive engine (for cleanup)
 */
export declare function removeCognitiveEngine(personaId: string): void;
/**
 * Reset all cognitive engines
 */
export declare function resetAllCognitiveEngines(): void;
export default CognitiveIntelligenceEngine;
//# sourceMappingURL=cognitive-intelligence.d.ts.map