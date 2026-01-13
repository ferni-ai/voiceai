/**
 * Meeting Pattern Learning Service
 *
 * "Better Than Human" capability: Learn user's optimal meeting patterns from their
 * calendar history to provide superhuman scheduling suggestions.
 *
 * Learns:
 * - Preferred meeting start times by day of week
 * - Optimal meeting durations by type
 * - Days/times the user typically avoids
 * - Energy peaks based on meeting acceptance patterns
 * - Focus time preferences (morning vs afternoon vs evening)
 * - Meeting clustering preferences (batched vs spread)
 *
 * No human assistant can track these patterns as accurately over time.
 *
 * @module services/calendar/meeting-pattern-learning
 */
export interface MeetingPattern {
    preferredStartTimes: Record<number, number[]>;
    avoidDays: number[];
    avoidHours: number[];
    optimalDurationByType: {
        oneOnOne: number;
        teamMeeting: number;
        clientCall: number;
        standup: number;
        general: number;
    };
    energyPeaks: number[];
    focusTimePreference: 'morning' | 'afternoon' | 'evening' | 'variable';
    clusteringPreference: 'batched' | 'spread' | 'variable';
    learnedFromEventCount: number;
    updatedAt: string;
}
/**
 * Get learned meeting patterns for a user
 */
export declare function getMeetingPatterns(userId: string): Promise<MeetingPattern>;
/**
 * Learn meeting patterns from calendar history
 * Should be called periodically (e.g., weekly) to update patterns
 */
export declare function learnMeetingPatterns(userId: string): Promise<MeetingPattern>;
/**
 * Get optimal time suggestions for a new meeting
 */
export declare function getOptimalMeetingTimes(userId: string, durationMinutes: number, meetingType?: 'oneOnOne' | 'teamMeeting' | 'clientCall' | 'standup' | 'general'): Promise<{
    day: number;
    hour: number;
    score: number;
}[]>;
/**
 * Check if a proposed meeting time is optimal
 */
export declare function isOptimalMeetingTime(userId: string, dateTime: Date, durationMinutes: number): Promise<{
    optimal: boolean;
    score: number;
    reason?: string;
}>;
declare const _default: {
    getMeetingPatterns: typeof getMeetingPatterns;
    learnMeetingPatterns: typeof learnMeetingPatterns;
    getOptimalMeetingTimes: typeof getOptimalMeetingTimes;
    isOptimalMeetingTime: typeof isOptimalMeetingTime;
};
export default _default;
//# sourceMappingURL=meeting-pattern-learning.d.ts.map