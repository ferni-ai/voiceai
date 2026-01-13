/**
 * Persona Affinity Tracking Service
 *
 * Tracks user-persona relationships to enable smart routing.
 * "Which persona does this user connect with best for this topic?"
 *
 * @module services/superhuman/persona-affinity
 */
import type { PersonaAffinityEntity, HandoffPreferenceEntity, PersonaInteractionHistoryEntity } from '../data-layer/types.js';
export interface PersonaAffinity extends PersonaAffinityEntity {
    id: string;
}
export interface PersonaInteraction extends PersonaInteractionHistoryEntity {
    id: string;
}
export interface PersonaRecommendation {
    personaId: string;
    personaName: string;
    score: number;
    reason: string;
    topics: string[];
}
/**
 * Update persona affinity after a session
 */
export declare function updateAffinityAfterSession(userId: string, sessionData: {
    personaId: string;
    duration: number;
    topics: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    userEngagement: 'low' | 'medium' | 'high';
}): Promise<void>;
/**
 * Get all persona affinities for a user
 */
export declare function getAllAffinities(userId: string): Promise<PersonaAffinity[]>;
/**
 * Get affinity for a specific persona
 */
export declare function getAffinity(userId: string, personaId: string): Promise<PersonaAffinity | null>;
/**
 * Record a successful handoff
 */
export declare function recordHandoff(userId: string, handoff: {
    fromPersona: string;
    toPersona: string;
    topics: string[];
    userApproved: boolean;
    successful: boolean;
}): Promise<void>;
/**
 * Get handoff preferences
 */
export declare function getHandoffPreferences(userId: string): Promise<Array<HandoffPreferenceEntity & {
    id: string;
}>>;
/**
 * Record a persona interaction
 */
export declare function recordInteraction(userId: string, interaction: Omit<PersonaInteractionHistoryEntity, 'date'>): Promise<void>;
/**
 * Get recent interactions with a persona
 */
export declare function getRecentInteractions(userId: string, personaId: string, limit?: number): Promise<PersonaInteraction[]>;
/**
 * Recommend the best persona for a given topic/context
 */
export declare function recommendPersona(userId: string, context: {
    topic?: string;
    topics?: string[];
    currentPersona?: string;
    userMessage?: string;
}): Promise<PersonaRecommendation[]>;
/**
 * Should we suggest a handoff?
 */
export declare function shouldSuggestHandoff(userId: string, currentPersona: string, topics: string[]): Promise<{
    suggest: boolean;
    toPersona?: string;
    reason?: string;
}>;
export declare const personaAffinity: {
    updateAfterSession: typeof updateAffinityAfterSession;
    getAll: typeof getAllAffinities;
    get: typeof getAffinity;
    recordHandoff: typeof recordHandoff;
    getHandoffPreferences: typeof getHandoffPreferences;
    recordInteraction: typeof recordInteraction;
    getRecentInteractions: typeof getRecentInteractions;
    recommendPersona: typeof recommendPersona;
    shouldSuggestHandoff: typeof shouldSuggestHandoff;
};
export default personaAffinity;
//# sourceMappingURL=persona-affinity.d.ts.map