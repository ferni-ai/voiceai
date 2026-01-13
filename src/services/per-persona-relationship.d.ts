/**
 * Per-Persona Relationship Service
 *
 * Tracks relationship depth with EACH persona separately.
 * Enables:
 * - Different relationship stages per persona
 * - Gated content based on relationship depth
 * - Natural relationship progression
 * - Persona-specific memory and vulnerability sharing
 */
import type { UserProfile, PersonaRelationshipStage, PerPersonaRelationshipData } from '../types/user-profile.js';
/**
 * Get the current relationship stage with a specific persona
 */
export declare function getPersonaRelationshipStage(profile: UserProfile | null, personaId: string): PersonaRelationshipStage;
/**
 * Get detailed relationship data for a specific persona
 */
export declare function getPersonaRelationshipData(profile: UserProfile | null, personaId: string): PerPersonaRelationshipData | null;
/**
 * Calculate what relationship stage should be based on data
 */
export declare function calculatePersonaRelationshipStage(data: PerPersonaRelationshipData, personaId: string): PersonaRelationshipStage;
/**
 * Create default relationship data for a new persona relationship
 */
export declare function createDefaultRelationshipData(): PerPersonaRelationshipData;
/**
 * Update relationship data after a session
 */
export declare function updatePersonaRelationshipData(existingData: PerPersonaRelationshipData | null, update: {
    minutesTalked?: number;
    topicsDiscussed?: string[];
    keyMoment?: {
        type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
        summary: string;
    };
    storyTold?: string;
    vulnerabilityShared?: boolean;
}): PerPersonaRelationshipData;
/**
 * Apply relationship updates to user profile
 */
export declare function applyRelationshipUpdateToProfile(profile: UserProfile, personaId: string, update: {
    minutesTalked?: number;
    topicsDiscussed?: string[];
    keyMoment?: {
        type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
        summary: string;
    };
    storyTold?: string;
    vulnerabilityShared?: boolean;
}): UserProfile;
/**
 * Check if user has reached a minimum relationship stage with a persona
 */
export declare function hasMinimumRelationship(profile: UserProfile | null, personaId: string, minimumStage: PersonaRelationshipStage): boolean;
/**
 * Get the warmth multiplier based on relationship stage
 * Used to adjust greeting warmth, response style, etc.
 */
export declare function getWarmthMultiplier(profile: UserProfile | null, personaId: string): number;
/**
 * Check if a story can be told based on relationship stage
 */
export declare function canTellStory(profile: UserProfile | null, personaId: string, storyId: string, requiredStage?: PersonaRelationshipStage): {
    allowed: boolean;
    reason?: string;
};
/**
 * Check if vulnerability can be shared based on relationship stage
 */
export declare function canShareVulnerability(profile: UserProfile | null, personaId: string, vulnerabilityType?: 'light' | 'medium' | 'deep'): boolean;
/**
 * Get a transition phrase when relationship stage advances
 * Returns null if no transition occurred
 */
export declare function getRelationshipTransitionPhrase(oldStage: PersonaRelationshipStage, newStage: PersonaRelationshipStage, transitionPhrases?: {
    stranger_to_acquaintance?: string[];
    acquaintance_to_friend?: string[];
    friend_to_trusted_advisor?: string[];
}): string | null;
/**
 * Get a memory callback phrase for following up on a previous topic
 */
export declare function getMemoryCallbackPhrase(topic: string, callbackType: 'general' | 'hard_topic' | 'progress' | 'habit' | 'event', memoryCallbacks?: {
    general?: string[];
    checking_in_on_hard_topic?: string[];
    celebrating_progress?: string[];
    habit_check_in?: string[];
    event_countdown?: string[];
}): string | null;
/**
 * Determine if a relationship transition should be announced
 * (Don't announce every time - only ~50% of the time to feel natural)
 */
export declare function shouldAnnounceTransition(oldStage: PersonaRelationshipStage, newStage: PersonaRelationshipStage): boolean;
/**
 * Log relationship summary for debugging
 */
export declare function logRelationshipSummary(profile: UserProfile | null, personaId: string): void;
declare const _default: {
    getPersonaRelationshipStage: typeof getPersonaRelationshipStage;
    getPersonaRelationshipData: typeof getPersonaRelationshipData;
    calculatePersonaRelationshipStage: typeof calculatePersonaRelationshipStage;
    createDefaultRelationshipData: typeof createDefaultRelationshipData;
    updatePersonaRelationshipData: typeof updatePersonaRelationshipData;
    applyRelationshipUpdateToProfile: typeof applyRelationshipUpdateToProfile;
    hasMinimumRelationship: typeof hasMinimumRelationship;
    getWarmthMultiplier: typeof getWarmthMultiplier;
    canTellStory: typeof canTellStory;
    canShareVulnerability: typeof canShareVulnerability;
    getRelationshipTransitionPhrase: typeof getRelationshipTransitionPhrase;
    getMemoryCallbackPhrase: typeof getMemoryCallbackPhrase;
    shouldAnnounceTransition: typeof shouldAnnounceTransition;
    logRelationshipSummary: typeof logRelationshipSummary;
};
export default _default;
//# sourceMappingURL=per-persona-relationship.d.ts.map