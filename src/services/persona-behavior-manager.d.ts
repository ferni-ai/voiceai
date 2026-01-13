/**
 * PersonaBehaviorManager - Singleton for managing persona behaviors at runtime
 *
 * This service loads, caches, and provides access to persona behavior content
 * for dynamic humanization during conversations.
 */
import type { PersonaRelationshipStage } from '../types/user-profile.js';
export interface EmotionalContext {
    userMood?: 'distressed' | 'excited' | 'sad' | 'angry' | 'neutral' | 'reflective';
    energyLevel?: 'low' | 'medium' | 'high';
    conversationTone?: 'casual' | 'serious' | 'celebratory' | 'supportive';
}
export interface ConversationContext {
    personaId: string;
    relationshipStage: PersonaRelationshipStage;
    meetingCount: number;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    lastTopic?: string;
    emotional: EmotionalContext;
}
export interface BehaviorResult {
    phrase: string;
    type: string;
    metadata?: Record<string, unknown>;
}
/**
 * Load behaviors for a persona (with caching)
 */
export declare function loadPersonaBehaviors(personaId: string): Promise<Record<string, unknown> | null>;
/**
 * Get time of day
 */
export declare function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night';
/**
 * Get an emotional intelligence response based on detected emotion
 */
export declare function getEmotionalResponse(personaId: string, detectedEmotion: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Get a comfort phrase for difficult moments
 */
export declare function getComfortPhrase(personaId: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Get a celebration phrase
 */
export declare function getCelebrationPhrase(personaId: string, celebrationType: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Get a backchannel phrase (active listening cue)
 */
export declare function getBackchannelPhrase(personaId: string, type?: 'neutral' | 'engaged' | 'empathetic'): Promise<BehaviorResult | null>;
/**
 * Get a compliment phrase
 */
export declare function getComplimentPhrase(personaId: string, complimentType: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Get a speech imperfection (for naturalness)
 */
export declare function getSpeechImperfection(personaId: string, type: 'trailing_off' | 'self_corrections' | 'restarts' | 'filler_sounds' | 'thinking_aloud'): Promise<BehaviorResult | null>;
/**
 * Get a memory callback phrase (referencing past conversations)
 */
export declare function getMemoryCallbackPhrase(personaId: string, topic: string, callbackType?: 'topic' | 'goal' | 'struggle' | 'person'): Promise<BehaviorResult | null>;
/**
 * Get contextual nuance based on situation
 */
export declare function getContextualPhrase(personaId: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Check if persona should share vulnerability based on relationship
 */
export declare function canShareVulnerability(relationshipStage: PersonaRelationshipStage, vulnerabilityLevel: 'mild' | 'deep' | 'secret'): boolean;
/**
 * Get a vulnerability phrase (relationship-gated)
 */
export declare function getVulnerabilityPhrase(personaId: string, context: ConversationContext): Promise<BehaviorResult | null>;
/**
 * Get SSML pacing multiplier based on persona and context
 */
export declare function getPacingMultiplier(personaId: string, context: ConversationContext): number;
/**
 * Apply pacing multiplier to SSML breaks in a phrase
 */
export declare function applyPacing(phrase: string, multiplier: number): string;
/**
 * Clear the behavior cache for a persona
 */
export declare function clearBehaviorCache(personaId?: string): void;
/**
 * Preload behaviors for all personas
 */
export declare function preloadAllBehaviors(): Promise<void>;
export declare const PersonaBehaviorManager: {
    load: typeof loadPersonaBehaviors;
    getEmotionalResponse: typeof getEmotionalResponse;
    getComfortPhrase: typeof getComfortPhrase;
    getCelebrationPhrase: typeof getCelebrationPhrase;
    getBackchannelPhrase: typeof getBackchannelPhrase;
    getComplimentPhrase: typeof getComplimentPhrase;
    getSpeechImperfection: typeof getSpeechImperfection;
    getMemoryCallbackPhrase: typeof getMemoryCallbackPhrase;
    getContextualPhrase: typeof getContextualPhrase;
    getVulnerabilityPhrase: typeof getVulnerabilityPhrase;
    getPacingMultiplier: typeof getPacingMultiplier;
    applyPacing: typeof applyPacing;
    clearCache: typeof clearBehaviorCache;
    preload: typeof preloadAllBehaviors;
    getTimeOfDay: typeof getTimeOfDay;
    canShareVulnerability: typeof canShareVulnerability;
};
export default PersonaBehaviorManager;
//# sourceMappingURL=persona-behavior-manager.d.ts.map