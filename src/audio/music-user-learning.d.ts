/**
 * Music User Learning System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learns what works for each individual user:
 * - Some users prefer silence after emotional moments
 * - Some users want acknowledgment to know Ferni is still there
 * - Some users respond better to topic callbacks
 *
 * This system tracks engagement patterns and adjusts transition preferences
 * on a per-user basis using Thompson Sampling (explore/exploit).
 *
 * Inspired by `src/services/trust-systems/outreach-timing-ml.ts`
 */
import type { TransitionType } from './intelligent-music-transitions.js';
import type { MusicStartReason } from './music-session-context.js';
/**
 * A user's transition preferences (learned over time)
 */
export interface UserTransitionProfile {
    /** User ID */
    userId: string;
    /** When this profile was created */
    createdAt: number;
    /** When this profile was last updated */
    updatedAt: number;
    /** Total transitions this user has experienced */
    totalTransitions: number;
    /** Thompson Sampling parameters per transition type */
    transitionArms: Record<TransitionType, ThompsonArmState>;
    /** Context-specific preferences */
    contextPreferences: {
        /** Preferences by music start reason */
        byStartReason: Partial<Record<MusicStartReason, TransitionType>>;
        /** Preferences by emotional state */
        byEmotionalState: {
            heavy?: TransitionType;
            light?: TransitionType;
            crisis?: TransitionType;
        };
        /** Time-of-day preferences */
        byTimeOfDay: {
            lateNight?: TransitionType;
            morning?: TransitionType;
        };
    };
    /** Music memory - what helped in the past */
    musicMemory: MusicMemoryEntry[];
}
/**
 * Thompson Sampling arm state (Beta distribution parameters)
 */
export interface ThompsonArmState {
    /** Number of successes (positive engagements) */
    alpha: number;
    /** Number of failures (negative/neutral engagements) */
    beta: number;
    /** Total pulls (uses) of this arm */
    pulls: number;
    /** Last time this arm was pulled */
    lastPulled?: number;
}
/**
 * Memory of music that helped this user
 */
export interface MusicMemoryEntry {
    /** When this memory was created */
    timestamp: number;
    /** The emotional context when music helped */
    emotionalContext: string;
    /** What was happening before music */
    topicContext?: string;
    /** The music that helped */
    music: {
        trackName?: string;
        artist?: string;
        genre?: string;
        mood?: string;
    };
    /** What transition worked after */
    effectiveTransition: TransitionType;
    /** How positive was the outcome (0-1) */
    outcomeScore: number;
    /** What the user said/did that indicated it helped */
    signal?: string;
}
/**
 * Engagement feedback for learning
 */
export interface EngagementFeedback {
    /** Was this a positive engagement? */
    wasPositive: boolean;
    /** Confidence in this assessment (0-1) */
    confidence: number;
    /** What signals informed this assessment */
    signals: string[];
}
/**
 * Get or create a user's transition profile
 */
export declare function getUserProfile(userId: string): UserTransitionProfile;
/**
 * Select the best transition type using Thompson Sampling
 *
 * This balances exploration (trying new things) with exploitation
 * (using what we know works) in a mathematically principled way.
 */
export declare function selectTransitionWithLearning(userId: string, availableTypes: TransitionType[], context?: {
    startReason?: MusicStartReason;
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    isLateNight?: boolean;
}): {
    selectedType: TransitionType;
    explorationRate: number;
};
/**
 * Update the user's profile based on engagement feedback
 */
export declare function updateUserLearning(userId: string, transitionType: TransitionType, feedback: EngagementFeedback, context?: {
    startReason?: MusicStartReason;
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    isLateNight?: boolean;
}): void;
/**
 * Add a music memory entry (music that helped this user)
 */
export declare function addMusicMemory(userId: string, entry: Omit<MusicMemoryEntry, 'timestamp'>): void;
/**
 * Find relevant music memories for a context
 */
export declare function findRelevantMusicMemories(userId: string, emotionalContext?: string, topicContext?: string): MusicMemoryEntry[];
/**
 * Get a user's preferred transition for a context
 */
export declare function getUserPreferredTransition(userId: string, context: {
    startReason?: MusicStartReason;
    emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
    isLateNight?: boolean;
}): TransitionType | null;
/**
 * Export a user's profile (for persistence)
 */
export declare function exportUserProfile(userId: string): UserTransitionProfile | null;
/**
 * Import a user's profile (from persistence)
 */
export declare function importUserProfile(profile: UserTransitionProfile): void;
/**
 * Clear all profiles (for testing)
 */
export declare function clearAllProfiles(): void;
/**
 * Get learning stats for a user
 */
export declare function getUserLearningStats(userId: string): {
    totalTransitions: number;
    topTransitionTypes: Array<{
        type: TransitionType;
        expectedValue: number;
        pulls: number;
    }>;
    hasContextPreferences: boolean;
    musicMemoryCount: number;
};
declare const _default: {
    getUserProfile: typeof getUserProfile;
    selectTransitionWithLearning: typeof selectTransitionWithLearning;
    updateUserLearning: typeof updateUserLearning;
    addMusicMemory: typeof addMusicMemory;
    findRelevantMusicMemories: typeof findRelevantMusicMemories;
    getUserPreferredTransition: typeof getUserPreferredTransition;
    exportUserProfile: typeof exportUserProfile;
    importUserProfile: typeof importUserProfile;
    clearAllProfiles: typeof clearAllProfiles;
    getUserLearningStats: typeof getUserLearningStats;
};
export default _default;
//# sourceMappingURL=music-user-learning.d.ts.map