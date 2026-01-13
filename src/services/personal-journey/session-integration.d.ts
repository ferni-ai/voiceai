/**
 * Personal Journey Session Integration
 *
 * Hooks the Personal Journey Awareness system into the voice agent
 * session lifecycle.
 *
 * Called at:
 * - Session start: Initialize from persisted data, record session
 * - Session end: Persist updated data
 *
 * @module services/personal-journey/session-integration
 */
import type { UserProfile } from '../../types/user-profile.js';
import type { PersonalJourneyData } from './types.js';
/**
 * Initialize Personal Journey Awareness at session start
 *
 * Call this right after user identification, before the first turn.
 */
export declare function initPersonalJourney(userId: string, userProfile?: UserProfile | null): Promise<void>;
/**
 * Record a session for journey tracking
 * Call this at the start of each conversation
 */
export declare function recordJourneySession(userId: string): void;
/**
 * Cleanup personal journey at session end
 * Call this when the session ends to free memory
 */
export declare function cleanupPersonalJourney(userId: string): void;
/**
 * Get all personal journey data for persistence
 * Call this before updating the user profile to include journey data
 */
export declare function getPersonalJourneyForPersistence(userId: string): Partial<PersonalJourneyData>;
/**
 * Update journey state based on conversation analysis
 * Call this after conversation summarization with extracted data
 */
export declare function updateJourneyFromConversation(userId: string, data: {
    topics: string[];
    emotions: string[];
    keyMoments?: string[];
    struggles?: string[];
    wins?: string[];
    conversationText?: string;
}): Promise<void>;
/**
 * Capture end-of-season snapshot
 * Call this periodically (e.g., in a scheduled job)
 */
export declare function captureSeasonalSnapshotIfNeeded(userId: string, data: {
    emotionalState: string;
    activeThemes: string[];
    keyMoments: string[];
    struggles?: string[];
    wins?: string[];
}): Promise<boolean>;
//# sourceMappingURL=session-integration.d.ts.map