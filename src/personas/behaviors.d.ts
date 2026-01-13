/**
 * Persona-Parameterized Behaviors
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generic behavior functions that adapt to any persona configuration.
 * These replace the Jack-specific hardcoded behaviors with persona-driven ones.
 *
 * Every function here serves one goal: making conversations feel human.
 */
import type { PersonaConfig, PersonaState, StoryConfig } from './types.js';
/**
 * Get a thinking phrase based on persona config
 */
export declare function getThinkingPhrase(persona: PersonaConfig): string;
/**
 * Get a listening cue based on persona config
 */
export declare function getListeningCue(persona: PersonaConfig): string;
/**
 * Get verbal backchannel based on emotion and persona
 */
export declare function getVerbalBackchannel(persona: PersonaConfig, userMessageLength: number, emotion: string): string | null;
/**
 * Get silence filler based on conversation depth and persona
 */
export declare function getSilenceFiller(persona: PersonaConfig, turnCount: number): string;
/**
 * Get self-correction phrase
 */
export declare function getSelfCorrection(persona: PersonaConfig): string;
/**
 * Get trailing off phrase
 */
export declare function getTrailingOff(persona: PersonaConfig): string;
/**
 * Get interruption recovery phrase
 */
export declare function getInterruptionRecovery(persona: PersonaConfig): string;
/**
 * Get humility phrase
 */
export declare function getHumilityPhrase(persona: PersonaConfig): string;
/**
 * Get a catchphrase if the persona has them
 */
export declare function getCatchphrase(persona: PersonaConfig): string | null;
/**
 * Check if user message triggers a pet peeve
 */
export declare function checkPetPeeve(persona: PersonaConfig, text: string): string | null;
/**
 * Get a relevant story if the persona has stories and one matches (keyword-based)
 */
export declare function getRelevantStory(persona: PersonaConfig, text: string): string | null;
/**
 * Find a semantically relevant story using embeddings
 * Falls back to keyword matching if embeddings fail
 *
 * @param persona The persona with stories
 * @param userText User's message text
 * @param threshold Minimum similarity score (0-1) to consider a match
 * @param excludeStoryIds Story IDs to exclude (already told)
 * @returns The best matching story or null
 */
export declare function findSemanticStory(persona: PersonaConfig, userText: string, threshold?: number, excludeStoryIds?: string[]): Promise<{
    story: StoryConfig;
    similarity: number;
} | null>;
/**
 * Clear the story embedding cache (e.g., when personas are updated)
 */
export declare function clearStoryEmbeddingCache(personaId?: string): void;
/**
 * Get emotional expression based on emotion type
 */
export declare function getEmotionalExpression(persona: PersonaConfig, emotionType: 'laughter' | 'surprise' | 'concern' | 'joy' | 'empathy'): string;
/**
 * Get persona's mood based on time of day
 */
export declare function getPersonaMood(persona: PersonaConfig): {
    mood: string;
    indicator?: string;
};
/**
 * Check if topic is out of scope for this persona
 */
export declare function isOutOfScope(persona: PersonaConfig, topic: string): boolean;
/**
 * Get out of scope response
 */
export declare function getOutOfScopeResponse(persona: PersonaConfig): string;
export type ConversationDepth = 'surface' | 'medium' | 'deep';
/**
 * Determine conversation depth
 */
export declare function getConversationDepth(turnCount: number, topicsDiscussed: string[], emotionalMoments: number): ConversationDepth;
/**
 * Get response length guidance based on user message
 */
export declare function getResponseLengthGuidance(userMessageLength: number): string;
export interface DayContext {
    dayName: string;
    isWeekend: boolean;
    dateComment: string;
}
export interface TimeContext {
    period: string;
    comment: string;
}
/**
 * Get day context for conversation
 */
export declare function getDayContext(): DayContext;
/**
 * Get time of day context
 */
export declare function getTimeContext(): TimeContext;
/**
 * Get seasonal context
 */
export declare function getSeasonalContext(): {
    season: string;
    observation: string;
};
/**
 * Get acknowledgment phrase based on emotion (use before giving advice)
 */
export declare function getAcknowledgmentBeforeAdvice(persona: PersonaConfig, emotion: string): string;
/**
 * Generate a memory callback phrase
 */
export declare function getMemoryCallback(topics: string[], userName?: string): string | null;
/**
 * Generate returning user warmth based on persona
 */
export declare function getReturningUserWarmth(persona: PersonaConfig, lastSummary?: string, userName?: string): string;
/**
 * Create initial persona state
 */
export declare function createPersonaState(): PersonaState;
/**
 * Update persona state after a turn
 */
export declare function updatePersonaState(state: PersonaState, newTopics: string[], hadEmotionalMoment: boolean): PersonaState;
//# sourceMappingURL=behaviors.d.ts.map