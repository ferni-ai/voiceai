/**
 * Humanizing State Service
 *
 * Persists humanizing context across sessions for genuine relationship depth.
 * This enables:
 * - Never repeating the same spontaneous story
 * - Remembering mood patterns
 * - Tracking relationship milestones
 * - Building genuine connection over time
 */
import type { UserProfile } from '../types/user-profile.js';
import type { MoodState, RelationshipStage } from '../types/humanizing-types.js';
export interface HumanizingStateUpdate {
    /** New share tags used this session */
    newShareTags?: string[];
    /** Spontaneous shares made this session */
    spontaneousShareCount?: number;
    /** Current mood state */
    currentMood?: MoodState;
    /** Stories told this session */
    storiesTold?: string[];
    /** Hot takes shared this session */
    hotTakesShared?: string[];
    /** Inner world content revealed */
    innerWorldRevealed?: Array<{
        type: string;
        content: string;
    }>;
    /** Relationship transition that occurred */
    relationshipTransition?: {
        from: RelationshipStage;
        to: RelationshipStage;
        acknowledged: boolean;
    };
    /** Session ID for tracking */
    sessionId: string;
}
export interface HumanizingState {
    usedShareTags: string[];
    totalSpontaneousShares: number;
    lastMood?: MoodState;
    moodHistory: Array<{
        mood: string;
        timestamp: Date;
        sessionId: string;
    }>;
    storiesTold: string[];
    hotTakesShared: string[];
    innerWorldRevealed: Array<{
        type: string;
        content: string;
        sharedAt: Date;
    }>;
    relationshipMilestones: Array<{
        from: string;
        to: string;
        timestamp: Date;
        acknowledgmentGiven: boolean;
    }>;
    vulnerabilityMoments: number;
    updatedAt: Date;
    usedGreetings: string[];
    lastGreetingAt?: Date;
}
/**
 * Get humanizing state from user profile
 */
export declare function getHumanizingState(profile: UserProfile | null): HumanizingState;
/**
 * Merge session updates into existing humanizing state
 */
export declare function mergeHumanizingStateUpdate(existing: HumanizingState, update: HumanizingStateUpdate): HumanizingState;
/**
 * Apply humanizing state to user profile
 */
export declare function applyHumanizingStateToProfile(profile: UserProfile, state: HumanizingState): UserProfile;
/**
 * Check if a story has already been told to this user
 */
export declare function hasStoryBeenTold(state: HumanizingState, storyId: string): boolean;
/**
 * Check if a hot take has already been shared with this user
 */
export declare function hasHotTakeBeenShared(state: HumanizingState, tags: string[]): boolean;
/**
 * Check if share tags have been used (to avoid repetition)
 */
export declare function haveShareTagsBeenUsed(state: HumanizingState, tags: string[]): boolean;
/**
 * Get mood trend (is user's experience with persona getting better?)
 */
export declare function getMoodTrend(state: HumanizingState): 'improving' | 'stable' | 'declining' | 'unknown';
/**
 * Get relationship depth score (0-100)
 */
export declare function getRelationshipDepthScore(state: HumanizingState): number;
/**
 * Log humanizing state summary
 */
export declare function logHumanizingStateSummary(state: HumanizingState, userId: string): void;
/**
 * Generate a simple hash for a greeting to track usage
 */
export declare function hashGreeting(greeting: string): string;
/**
 * Check if a greeting has been used recently
 */
export declare function hasGreetingBeenUsed(state: HumanizingState, greeting: string): boolean;
/**
 * Record that a greeting was used
 */
export declare function recordGreetingUsage(state: HumanizingState, greeting: string): HumanizingState;
/**
 * Get list of greeting hashes that should be avoided
 */
export declare function getUsedGreetingHashes(state: HumanizingState): string[];
declare const _default: {
    getHumanizingState: typeof getHumanizingState;
    mergeHumanizingStateUpdate: typeof mergeHumanizingStateUpdate;
    applyHumanizingStateToProfile: typeof applyHumanizingStateToProfile;
    hasStoryBeenTold: typeof hasStoryBeenTold;
    hasHotTakeBeenShared: typeof hasHotTakeBeenShared;
    haveShareTagsBeenUsed: typeof haveShareTagsBeenUsed;
    getMoodTrend: typeof getMoodTrend;
    getRelationshipDepthScore: typeof getRelationshipDepthScore;
    logHumanizingStateSummary: typeof logHumanizingStateSummary;
    hashGreeting: typeof hashGreeting;
    hasGreetingBeenUsed: typeof hasGreetingBeenUsed;
    recordGreetingUsage: typeof recordGreetingUsage;
    getUsedGreetingHashes: typeof getUsedGreetingHashes;
};
export default _default;
//# sourceMappingURL=humanizing-state.d.ts.map