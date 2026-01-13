/**
 * User Trigger Profile Service
 *
 * Phase 2: Personal Memory Integration
 *
 * Stores and retrieves user trigger profiles that contain personal context
 * like significant dates, relationships, and communication patterns.
 * This is what makes triggers "Better than Human" - remembering
 * everything about the user with perfect recall.
 *
 * @module UserTriggerProfileService
 */
import type { UserTriggerProfile, SignificantDate, Relationship, CommunicationPatterns, ProfileExtractionResult, ProfileContextBoost } from './user-trigger-profile.types.js';
export interface ProfileServiceConfig {
    /** TTL for cached profiles in milliseconds (default: 5 minutes) */
    cacheTtlMs: number;
    /** Maximum profiles to keep in cache (default: 100) */
    maxCacheSize: number;
    /** Firestore collection path (default: 'bogle_users') */
    userCollection: string;
    /** Sub-collection name (default: 'trigger_profile') */
    profileSubcollection: string;
    /** Enable Firestore persistence (default: true) */
    enablePersistence: boolean;
}
export declare class UserTriggerProfileService {
    private config;
    private cache;
    private db;
    private initialized;
    constructor(config?: Partial<ProfileServiceConfig>);
    private ensureDb;
    /**
     * Load a user's trigger profile
     */
    loadProfile(userId: string): Promise<UserTriggerProfile>;
    /**
     * Save a user's trigger profile
     */
    saveProfile(userId: string, profile: UserTriggerProfile): Promise<boolean>;
    /**
     * Delete a user's trigger profile
     */
    deleteProfile(userId: string): Promise<boolean>;
    /**
     * Add a significant date to the profile
     */
    addSignificantDate(userId: string, date: SignificantDate): Promise<boolean>;
    /**
     * Add or update a relationship
     */
    addRelationship(userId: string, relationship: Relationship): Promise<boolean>;
    /**
     * Update communication patterns
     */
    updateCommunicationPatterns(userId: string, patterns: Partial<CommunicationPatterns>): Promise<boolean>;
    /**
     * Record trigger effectiveness
     */
    recordTriggerEffectiveness(userId: string, triggerName: string, outcome: 'positive' | 'negative' | 'neutral' | 'appreciated'): Promise<boolean>;
    /**
     * Merge extraction results into an existing profile
     */
    mergeExtractionResult(userId: string, extraction: ProfileExtractionResult): Promise<boolean>;
    /**
     * Generate trigger context boosts based on profile
     */
    generateContextBoost(userId: string, context?: {
        date?: Date;
    }): Promise<ProfileContextBoost>;
    private cacheProfile;
    /**
     * Clear cache for a user
     */
    clearCache(userId: string): void;
    /**
     * Clear entire cache
     */
    clearAllCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
    };
    private getOrCreateDefault;
    private hydrateProfile;
    private serializeProfile;
    private toDate;
    private mergeRelationship;
    private mergePatterns;
    private mergePhraseLists;
    private mergeSensitiveTopics;
    private mergeTemporalPatterns;
    private calculateProfileConfidence;
    private getDaysUntilDate;
    private formatDateContext;
    private formatRelationshipContext;
}
/**
 * Get the singleton instance
 */
export declare function getUserTriggerProfileService(config?: Partial<ProfileServiceConfig>): UserTriggerProfileService;
/**
 * Reset the singleton (for testing)
 */
export declare function resetUserTriggerProfileService(): void;
//# sourceMappingURL=user-trigger-profile-service.d.ts.map