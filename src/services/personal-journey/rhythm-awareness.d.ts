/**
 * Rhythm Awareness Service
 *
 * Tracks usage patterns for CELEBRATION, not surveillance.
 * Enables moments like:
 * - "This is our 50th conversation!"
 * - "You're always here in the evenings. I like that."
 * - "A whole month of daily check-ins. That's dedication."
 *
 * Philosophy: Frame everything as relationship acknowledgment,
 * never as tracking or monitoring.
 *
 * @module services/personal-journey/rhythm-awareness
 */
import type { JourneyMoment, RhythmMilestone, RhythmMilestoneType, UserRhythm } from './types.js';
export type { RhythmMilestoneType } from './types.js';
/**
 * Get or create rhythm data for user
 */
export declare function getRhythm(userId: string): UserRhythm;
/**
 * Initialize rhythm from persisted profile data
 */
export declare function initializeRhythm(userId: string, persistedData?: Partial<UserRhythm>): void;
/**
 * Record a new session (conversation started)
 * Returns any milestones achieved
 */
export declare function recordSession(userId: string, timestamp?: Date): RhythmMilestone[];
/**
 * Get a celebration message for a milestone
 */
export declare function getMilestoneMessage(type: RhythmMilestoneType): string | null;
/**
 * Get unacknowledged milestones as journey moments
 */
export declare function getUnacknowledgedMilestones(userId: string): JourneyMoment[];
/**
 * Mark a milestone as acknowledged
 */
export declare function acknowledgeMilestone(userId: string, milestoneType: RhythmMilestoneType): void;
/**
 * Get rhythm-aware greeting context
 */
export declare function getRhythmGreetingContext(userId: string): {
    hasRhythmInsight: boolean;
    insight?: string;
    insightType?: 'consistency' | 'time_preference' | 'comeback' | 'streak';
};
/**
 * Get rhythm data for persistence
 */
export declare function getRhythmForPersistence(userId: string): UserRhythm | null;
/**
 * Clear rhythm cache for user
 */
export declare function clearRhythmCache(userId: string): void;
/**
 * Get summary stats for context
 */
export declare function getRhythmStats(userId: string): {
    totalConversations: number;
    daysKnown: number;
    currentStreak: number;
    longestStreak: number;
    averageSessionsPerWeek: number;
    isConsistent: boolean;
    mostActiveTimeOfDay: string;
};
//# sourceMappingURL=rhythm-awareness.d.ts.map