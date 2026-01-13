/**
 * Journaling Prompts
 *
 * Generates personalized journaling prompts based on current context,
 * growth areas, and relationship history.
 *
 * Philosophy: The right question at the right time can unlock
 * profound self-discovery. Generic prompts don't land.
 *
 * BETTER THAN HUMAN: This module now supports LLM-powered dynamic
 * prompt generation. Static templates are used as fallback and for
 * category guidance, but the best prompts are generated based on:
 * - What we know about the user (struggles, wins, growth areas)
 * - Their relationship with Ferni
 * - Current emotional state
 * - Time of day and context
 *
 * Prompt Types:
 * - Reflection (processing experiences)
 * - Exploration (discovering patterns)
 * - Gratitude (appreciating growth)
 * - Challenge (gentle pushing)
 * - Integration (connecting insights)
 *
 * @module JournalingPrompts
 */
export type PromptCategory = 'reflection' | 'exploration' | 'gratitude' | 'challenge' | 'integration' | 'growth' | 'relationship' | 'future' | 'healing';
export interface JournalingPrompt {
    id: string;
    category: PromptCategory;
    prompt: string;
    followUp?: string;
    context: string;
    difficulty: 'gentle' | 'moderate' | 'deep';
    estimatedMinutes: number;
    tags: string[];
    personalizedFor?: string;
}
export interface PromptContext {
    userId: string;
    currentEmotion?: string;
    recentTopics?: string[];
    growthAreas?: string[];
    struggles?: string[];
    wins?: string[];
    relationships?: string[];
    upcomingEvents?: string[];
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    lastJournaledAt?: Date;
    preferredStyle?: 'direct' | 'exploratory' | 'poetic';
}
export interface PromptResponse {
    promptId: string;
    userId: string;
    responseText?: string;
    completedAt: Date;
    timeSpent?: number;
    rating?: 1 | 2 | 3 | 4 | 5;
    insightsGained?: string[];
}
export interface JournalingPattern {
    preferredCategories: PromptCategory[];
    avgTimeSpent: number;
    completionRate: number;
    bestTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    insightsCount: number;
}
/**
 * Generate personalized prompts for user
 */
export declare function generatePrompts(context: PromptContext, count?: number): JournalingPrompt[];
/**
 * Record prompt response
 */
export declare function recordResponse(response: PromptResponse): void;
/**
 * Get single best prompt for moment
 */
export declare function getBestPrompt(context: PromptContext): JournalingPrompt;
/**
 * Get prompts for a specific category
 */
export declare function getPromptsForCategory(userId: string, category: PromptCategory, count?: number): JournalingPrompt[];
/**
 * Get user's journaling patterns
 */
export declare function getJournalingPatterns(userId: string): JournalingPattern | null;
/**
 * Generate prompt for specific situation
 */
export declare function generateSituationalPrompt(userId: string, situation: 'morning_routine' | 'evening_wind_down' | 'processing_emotion' | 'after_session'): JournalingPrompt;
/**
 * Format prompt for voice delivery
 */
export declare function formatPromptForVoice(prompt: JournalingPrompt): {
    intro: string;
    prompt: string;
    followUp?: string;
    ssml: string;
};
/**
 * Generate a dynamic journaling prompt using LLM
 *
 * This is the "Better than Human" version that creates truly personalized
 * prompts based on what we know about the user.
 *
 * @param context - User context including struggles, wins, growth areas
 * @param category - Optional category preference
 * @param personaId - Persona voice to use (default: ferni)
 * @returns Promise<JournalingPrompt>
 */
export declare function generateDynamicPrompt(context: PromptContext, category?: PromptCategory, personaId?: string): Promise<JournalingPrompt>;
/**
 * Generate multiple dynamic prompts
 */
export declare function generateDynamicPrompts(context: PromptContext, count?: number, personaId?: string): Promise<JournalingPrompt[]>;
declare const _default: {
    generatePrompts: typeof generatePrompts;
    generateDynamicPrompt: typeof generateDynamicPrompt;
    generateDynamicPrompts: typeof generateDynamicPrompts;
    getBestPrompt: typeof getBestPrompt;
    getPromptsForCategory: typeof getPromptsForCategory;
    recordResponse: typeof recordResponse;
    getJournalingPatterns: typeof getJournalingPatterns;
    generateSituationalPrompt: typeof generateSituationalPrompt;
    formatPromptForVoice: typeof formatPromptForVoice;
};
export default _default;
//# sourceMappingURL=journaling-prompts.d.ts.map