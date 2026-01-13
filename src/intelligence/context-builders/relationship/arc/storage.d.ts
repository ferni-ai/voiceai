/**
 * Relationship Arc Storage
 *
 * Persists relationship arc data to Firestore and provides
 * caching for performance.
 *
 * Storage path: bogle_users/{userId}/relationship_arc/data
 *
 * @module intelligence/context-builders/relationship/arc/storage
 */
import type { RelationshipArcData, FirstMeetingData, KeyMoment, SharedVocabulary, RelationshipStage } from './types.js';
/**
 * Load relationship arc data for a user
 */
export declare function loadRelationshipArcData(userId: string): Promise<RelationshipArcData | null>;
/**
 * Save relationship arc data
 */
export declare function saveRelationshipArcData(data: RelationshipArcData): Promise<void>;
/**
 * Record first meeting data
 */
export declare function recordFirstMeeting(userId: string, firstMeeting: FirstMeetingData): Promise<void>;
/**
 * Record a key moment
 */
export declare function recordKeyMoment(userId: string, moment: Omit<KeyMoment, 'id' | 'referencedCount'>): Promise<string>;
/**
 * Mark that we've made a first-words callback
 */
export declare function markFirstWordsCallbackMade(userId: string): Promise<void>;
/**
 * Mark that we've referenced a milestone
 */
export declare function markMilestoneReferenced(userId: string, milestoneId: string): Promise<void>;
/**
 * Add shared vocabulary
 */
export declare function addSharedVocabulary(userId: string, vocab: Omit<SharedVocabulary, 'firstUsed' | 'useCount'>): Promise<void>;
/**
 * Increment session and turn counts
 */
export declare function incrementSessionStats(userId: string, turnCount: number): Promise<void>;
/**
 * Force a stage transition (e.g., for trust-based advancement)
 */
export declare function forceStageTransition(userId: string, newStage: RelationshipStage, trigger: string): Promise<void>;
/**
 * Get unreferenced key moments for callbacks (by userId - async)
 */
export declare function getUnreferencedMomentsAsync(userId: string, limit?: number): Promise<KeyMoment[]>;
/**
 * Get unreferenced key moments (sync helper)
 * Use when you already have arc data loaded
 */
export declare function getUnreferencedMoments(arcData: RelationshipArcData, type?: KeyMoment['type'], limit?: number): KeyMoment[];
/**
 * Get moments by type (by userId - async)
 */
export declare function getMomentsByTypeAsync(userId: string, type: KeyMoment['type']): Promise<KeyMoment[]>;
/**
 * Get moments by type (sync helper)
 * Use when you already have arc data loaded
 */
export declare function getMomentsByType(arcData: RelationshipArcData, type: KeyMoment['type']): KeyMoment[];
/**
 * Check if first-words callback can be made
 */
/**
 * Check if we can make a first-words callback (by userId - async)
 */
export declare function canMakeFirstWordsCallbackAsync(userId: string): Promise<boolean>;
/**
 * Check if we can make a first-words callback (sync helper)
 * Use this when you already have the arc data loaded
 */
export declare function canMakeFirstWordsCallback(arcData: RelationshipArcData): boolean;
/**
 * Get the current relationship stage
 */
export declare function getCurrentStage(userId: string): Promise<RelationshipStage>;
/**
 * Clear cache for a user (call on session end)
 */
export declare function clearArcCache(userId: string): void;
/**
 * Clear all cache
 */
export declare function clearAllArcCache(): void;
/**
 * Prewarm cache for a user
 */
export declare function prewarmArcCache(userId: string): Promise<void>;
//# sourceMappingURL=storage.d.ts.map