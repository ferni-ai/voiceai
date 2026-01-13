/**
 * Re-engagement Nudge System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects when users go quiet and reaches out thoughtfully.
 * Not "we miss you!" marketing - genuine care.
 *
 * Philosophy:
 * - Absence might mean they're doing well (celebrate that!)
 * - Or it might mean they're struggling (be gentle)
 * - Never pushy, always warm
 *
 * @module Reengagement
 */
export type AbsenceReason = 'thriving' | 'busy' | 'struggling' | 'forgot' | 'unknown';
export type NudgeType = 'gentle_checkin' | 'celebrating_independence' | 'supportive_reach' | 'casual_hello' | 'milestone_based';
export interface ReengagementNudge {
    type: NudgeType;
    message: string;
    ssml: string;
    tone: 'warm' | 'curious' | 'supportive' | 'celebratory';
}
export interface UserEngagementProfile {
    userId: string;
    lastSessionDate: Date;
    averageSessionGap: number;
    longestGap: number;
    totalSessions: number;
    currentAbsenceDays: number;
    nudgesSent: Array<{
        date: Date;
        type: NudgeType;
        responded: boolean;
    }>;
    lastSessionContext?: {
        topics: string[];
        emotionalState: string;
        pendingGoals: string[];
        upcomingEvents: string[];
    };
    reengagementOptOut: boolean;
    preferredNudgeStyle?: NudgeType;
}
/**
 * Record a new session
 */
export declare function recordSession(userId: string, context?: UserEngagementProfile['lastSessionContext']): void;
/**
 * Check if user needs a re-engagement nudge
 */
export declare function shouldSendNudge(userId: string): {
    shouldNudge: boolean;
    nudgeType?: NudgeType;
    reason?: string;
};
/**
 * Generate a re-engagement nudge
 */
export declare function generateNudge(userId: string): ReengagementNudge | null;
/**
 * Get all users needing nudges
 */
export declare function getUsersNeedingNudges(): string[];
/**
 * Opt out of re-engagement nudges
 */
export declare function optOutOfReengagement(userId: string): void;
/**
 * Opt back in to re-engagement nudges
 */
export declare function optInToReengagement(userId: string): void;
export declare function exportEngagementProfile(userId: string): UserEngagementProfile | null;
export declare function importEngagementProfile(profile: UserEngagementProfile): void;
declare const _default: {
    recordSession: typeof recordSession;
    shouldSendNudge: typeof shouldSendNudge;
    generateNudge: typeof generateNudge;
    getUsersNeedingNudges: typeof getUsersNeedingNudges;
    optOutOfReengagement: typeof optOutOfReengagement;
    optInToReengagement: typeof optInToReengagement;
    exportEngagementProfile: typeof exportEngagementProfile;
    importEngagementProfile: typeof importEngagementProfile;
};
export default _default;
//# sourceMappingURL=reengagement.d.ts.map