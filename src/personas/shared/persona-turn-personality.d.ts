/**
 * Shared Persona Turn Personality Processor
 *
 * Provides turn-level personality injection for all personas (not just Ferni).
 * Uses the shared LLM expression system and advanced humanization.
 *
 * Architecture:
 * 1. Detect conversation signals (subtext, energy, emotional moments)
 * 2. Generate appropriate response (from LLM or static pool)
 * 3. Track engagement for cross-session learning
 *
 * @module personas/shared/persona-turn-personality
 */
export interface PersonaTurnInput {
    personaId: string;
    sessionId: string;
    userId?: string;
    turnCount: number;
    userTranscript: string;
    pauseBeforeMs?: number;
    speechRateWPM?: number;
    voiceEmotion?: {
        primary?: string;
        arousal?: number;
        valence?: number;
        confidence?: number;
    };
    textEmotion?: {
        primary?: string;
        intensity?: number;
        distressLevel?: number;
        valence?: string;
    };
    momentum?: 'opening' | 'building' | 'cruising' | 'winding_down' | 'peaking' | 'intimate' | 'closing' | 'stalled';
    topics?: string[];
    relationshipStage?: string;
    totalConversations?: number;
    isHeavyTopic?: boolean;
    wasPersonalSharing?: boolean;
}
export interface PersonaTurnResult {
    shouldInject: boolean;
    expression?: {
        theme: string;
        content: string;
        ssml: string;
        id?: string;
    };
    humanization?: {
        type: 'subtext' | 'aftercare' | 'energy' | 'affirmation';
        subtype?: string;
        content: string;
        ssml: string;
    };
    injectionPoint: 'before_response' | 'mid_response' | 'after_response' | 'as_acknowledgment';
}
/**
 * Process a turn for any persona's personality injection
 */
export declare function processPersonaTurn(input: PersonaTurnInput): Promise<PersonaTurnResult>;
/**
 * Apply personality result to response
 */
export declare function applyPersonaPersonalityToResponse(rawResponse: string, result: PersonaTurnResult): string;
/**
 * Check if a persona has turn personality support
 */
export declare function hasPersonaTurnSupport(personaId: string): boolean;
export declare const sharedPersonality: {
    processTurn: typeof processPersonaTurn;
    applyToResponse: typeof applyPersonaPersonalityToResponse;
    hasSupport: typeof hasPersonaTurnSupport;
};
//# sourceMappingURL=persona-turn-personality.d.ts.map