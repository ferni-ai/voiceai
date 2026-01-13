/**
 * Intelligence Persistence Module
 *
 * Unified persistence layer for all intelligence engines.
 * Ensures that learned user preferences, patterns, and memories
 * are reliably saved to the user profile.
 *
 * This module solves the critical gap where intelligence engines
 * collect valuable data but don't persist it reliably.
 */
import type { UserProfile } from '../types/user-profile.js';
import { type HumorPreferences } from '../intelligence/humor-calibration.js';
import { type StoryPreferences } from '../intelligence/story-preference.js';
import { type EmotionalMoment } from '../intelligence/emotional-memory.js';
import { type LearnedPacePreferences } from '../intelligence/voice-pace-adapter.js';
import { type LearnedResponsePreferences, type ResponseSignal } from '../intelligence/response-quality-tracker.js';
import { type ConversationSession, type LearnedConversationPatterns } from '../intelligence/conversation-pattern-analyzer.js';
import { type OpenThread, type PromisedFollowUp } from '../intelligence/cross-session-threader.js';
/**
 * Complete intelligence state for a user
 * Stored in profile.customData.intelligenceState
 */
export interface IntelligenceState {
    version: number;
    savedAt: Date;
    humor?: {
        preferences: HumorPreferences | null;
    };
    stories?: {
        preferences: StoryPreferences | null;
    };
    communication?: {
        formality: string;
        energy: string;
        vocabulary: string;
    };
    emotional?: {
        moments: EmotionalMoment[];
        stats: {
            totalMoments: number;
            unresolvedCount: number;
        };
    };
    voicePace?: {
        preferences: LearnedPacePreferences | null;
    };
    responseQuality?: {
        preferences: LearnedResponsePreferences | null;
        signals: ResponseSignal[];
    };
    patterns?: {
        preferences: LearnedConversationPatterns | null;
        sessions: ConversationSession[];
    };
    threads?: {
        openThreads: OpenThread[];
        promisedFollowUps: PromisedFollowUp[];
    };
    betterThanHuman?: {
        emotionalBond: unknown;
        anticipation: unknown;
        linguistic: unknown;
        jokes: unknown;
        team: unknown;
        temporal: unknown;
        metaRelationship: unknown;
        observations: unknown;
        sessionCount: number;
    };
}
/**
 * Persistence configuration
 */
export interface PersistenceConfig {
    /** Auto-save interval in milliseconds (0 = disabled) */
    autoSaveIntervalMs: number;
    /** Maximum attempts for retrying saves */
    maxRetries: number;
    /** Delay between retries in milliseconds */
    retryDelayMs: number;
    /** Whether to validate data before saving */
    validateBeforeSave: boolean;
}
/**
 * Export all intelligence state for a user
 */
export declare function exportIntelligenceState(userId: string): IntelligenceState;
/**
 * Import intelligence state for a user from their profile
 */
export declare function importIntelligenceState(userId: string, state: IntelligenceState): void;
/**
 * Apply intelligence state to user profile for persistence
 */
export declare function applyIntelligenceToProfile(profile: UserProfile, userId: string): UserProfile;
/**
 * Load intelligence state from user profile
 */
export declare function loadIntelligenceFromProfile(userId: string, profile: UserProfile): void;
/**
 * Clean up all intelligence engines for a user
 */
export declare function cleanupIntelligenceEngines(userId: string): void;
/**
 * Start auto-saving intelligence state for a user
 */
export declare function startAutoSave(userId: string, saveCallback: (userId: string) => Promise<void>, config?: Partial<PersistenceConfig>): void;
/**
 * Stop auto-saving for a user
 */
export declare function stopAutoSave(userId: string): void;
/**
 * Stop all auto-saves (for shutdown)
 */
export declare function stopAllAutoSaves(): void;
/**
 * Get auto-save status
 */
export declare function getAutoSaveStatus(): Map<string, {
    lastSave: Date;
}>;
declare const _default: {
    exportIntelligenceState: typeof exportIntelligenceState;
    importIntelligenceState: typeof importIntelligenceState;
    applyIntelligenceToProfile: typeof applyIntelligenceToProfile;
    loadIntelligenceFromProfile: typeof loadIntelligenceFromProfile;
    cleanupIntelligenceEngines: typeof cleanupIntelligenceEngines;
    startAutoSave: typeof startAutoSave;
    stopAutoSave: typeof stopAutoSave;
    stopAllAutoSaves: typeof stopAllAutoSaves;
    getAutoSaveStatus: typeof getAutoSaveStatus;
};
export default _default;
//# sourceMappingURL=intelligence-persistence.d.ts.map