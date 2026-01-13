/**
 * Cross-Session Effect Memory
 *
 * Remembers which effects resonated with a user across sessions.
 * Allows personalization of humanization based on historical engagement.
 *
 * @module @ferni/conversation/effects/cross-session-memory
 */
export interface EffectEngagement {
    effectId: string;
    /** Times this effect was applied */
    appliedCount: number;
    /** Times user engaged positively after this effect */
    positiveEngagements: number;
    /** Times user engaged negatively after this effect */
    negativeEngagements: number;
    /** Last time this effect was used */
    lastUsed: Date;
    /** Sessions where this effect appeared */
    sessionsUsed: number;
}
export interface UserEffectProfile {
    userId: string;
    personaId: string;
    /** Effects and their engagement history */
    effects: Record<string, EffectEngagement>;
    /** Effects the user explicitly disliked */
    dislikedEffects: string[];
    /** Effects that work well for this user */
    preferredEffects: string[];
    /** Overall humanization preference (0=minimal, 1=maximum) */
    humanizationPreference: number;
    /** Last updated timestamp */
    lastUpdated: Date;
}
export interface EffectResponse {
    effectId: string;
    engagement: 'positive' | 'negative' | 'neutral';
    /** Optional: specific signal (e.g., "laughter", "topic_change") */
    signal?: string;
}
declare class CrossSessionEffectMemory {
    private profiles;
    /**
     * Get or create user effect profile
     */
    getProfile(userId: string, personaId: string): UserEffectProfile;
    /**
     * Record that an effect was applied
     */
    recordEffectApplied(userId: string, personaId: string, effectId: string): void;
    /**
     * Record user's response to an effect
     */
    recordEffectResponse(userId: string, personaId: string, response: EffectResponse): void;
    /**
     * Check if an effect should be skipped for this user
     */
    shouldSkipEffect(userId: string, personaId: string, effectId: string): boolean;
    /**
     * Get probability modifier for an effect based on user history
     */
    getEffectProbabilityModifier(userId: string, personaId: string, effectId: string): number;
    /**
     * Get user's humanization preference
     */
    getHumanizationPreference(userId: string, personaId: string): number;
    /**
     * Update user's overall humanization preference
     */
    setHumanizationPreference(userId: string, personaId: string, preference: number): void;
    /**
     * Get recommended effects for a user (based on positive history)
     */
    getRecommendedEffects(userId: string, personaId: string): string[];
    /**
     * Export profile for persistence (Firestore)
     */
    exportProfile(userId: string, personaId: string): UserEffectProfile;
    /**
     * Import profile from persistence
     */
    importProfile(profile: UserEffectProfile): void;
    /**
     * Clear all profiles (for testing)
     */
    clear(): void;
}
export declare function getEffectMemory(): CrossSessionEffectMemory;
export declare function resetEffectMemory(): void;
export declare const effectMemory: {
    recordApplied: (userId: string, personaId: string, effectId: string) => void;
    recordResponse: (userId: string, personaId: string, response: EffectResponse) => void;
    shouldSkip: (userId: string, personaId: string, effectId: string) => boolean;
    getProbabilityModifier: (userId: string, personaId: string, effectId: string) => number;
    getRecommended: (userId: string, personaId: string) => string[];
    getPreference: (userId: string, personaId: string) => number;
    setPreference: (userId: string, personaId: string, preference: number) => void;
};
export {};
//# sourceMappingURL=cross-session-memory.d.ts.map