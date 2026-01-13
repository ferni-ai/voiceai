/**
 * Revelation Moments Storage
 *
 * Persists revelation profiles to Firestore and provides
 * caching for performance.
 *
 * Storage path: bogle_users/{userId}/revelation_profile/data
 *
 * @module services/revelation-moments/storage
 */
import type { RevelationProfile, RevelationMoment, RevelationType, CapabilityCategory } from './types.js';
/**
 * Load revelation profile for a user
 */
export declare function loadRevelationProfile(userId: string): Promise<RevelationProfile | null>;
/**
 * Save revelation profile
 */
export declare function saveRevelationProfile(profile: RevelationProfile): Promise<void>;
/**
 * Record a revelation moment (first time user experienced a capability)
 */
export declare function recordRevelation(userId: string, revelation: Omit<RevelationMoment, 'occurredAt'>): Promise<boolean>;
/**
 * Check if a revelation has occurred
 */
export declare function hasRevelation(userId: string, type: RevelationType): Promise<boolean>;
/**
 * Get all revelations for a user
 */
export declare function getRevelations(userId: string): Promise<Partial<Record<RevelationType, RevelationMoment>>>;
/**
 * Record capability use in current session (for throttling)
 */
export declare function recordCapabilityUse(userId: string, sessionId: string, category: CapabilityCategory): Promise<void>;
/**
 * Check how many times a capability has been used this session
 */
export declare function getCapabilityUseCount(userId: string, sessionId: string, category: CapabilityCategory): Promise<number>;
/**
 * Get all capability uses this session
 */
export declare function getSessionCapabilities(userId: string, sessionId: string): Promise<CapabilityCategory[]>;
/**
 * Record how user responded to a revelation
 */
export declare function recordRevelationResponse(userId: string, type: RevelationType, response: RevelationMoment['userResponse']): Promise<void>;
/**
 * Get revelation stats for a user
 */
export declare function getRevelationStats(userId: string): Promise<{
    totalRevelations: number;
    revelationsByCategory: Record<CapabilityCategory, number>;
    positiveResponses: number;
    negativeResponses: number;
}>;
export declare function clearRevelationCache(userId: string): void;
export declare function clearAllRevelationCache(): void;
//# sourceMappingURL=storage.d.ts.map