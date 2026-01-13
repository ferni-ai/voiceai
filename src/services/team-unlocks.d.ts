/**
 * Team Unlock System - "Get to Know Ferni First"
 *
 * A relationship-based unlock system where team members become available
 * as your friendship with Ferni deepens. Subscribers get immediate access,
 * but free users can EARN everything through genuine engagement.
 *
 * Philosophy:
 * - In real life, you meet one person, then they introduce their friends
 * - Ferni is your gateway to the team
 * - Trust is earned through conversations, not credit cards
 * - Subscribers skip the wait, but don't get exclusive content
 *
 * Unlock Flow:
 * 1. First Meeting → Ferni only (get to know each other)
 * 2. Getting Started → +Maya (your first teammate!)
 * 3. Building Trust → +Peter (ready for deeper insights)
 * 4. Established → +Alex, Jordan (the whole team)
 * 5. Deep Partnership → +Nayan (the sage, earned through commitment)
 */
import type { UserProfile } from '../types/user-profile.js';
export declare function parseBypassConfig(): Set<TeamMemberId> | 'all' | null;
/**
 * Check if a member is bypassed via env config.
 */
export declare function isMemberBypassed(memberId: TeamMemberId): boolean;
/**
 * Calculate conversation streaks from profile data.
 * A streak is consecutive days with at least one conversation.
 */
export declare function calculateStreaks(profile: UserProfile | null): {
    currentStreak: number;
    longestStreak: number;
};
export type RelationshipStage = 'first-meeting' | 'getting-started' | 'building-trust' | 'established' | 'deep-partnership';
export type TeamMemberId = 'ferni' | 'maya-santos' | 'peter-john' | 'alex-chen' | 'jordan-taylor' | 'nayan-patel';
export interface TeamMemberUnlock {
    memberId: TeamMemberId;
    displayName: string;
    role: string;
    description: string;
    /** When this member unlocks for free users */
    unlocksAt: RelationshipStage;
    /** What Ferni says when introducing them */
    introductionMessage: string;
    /** Teaser shown when member is still locked */
    teaserMessage: string;
    /** Whether this is a "premium" unlock (Nayan - the sage) */
    premium?: boolean;
}
export interface UnlockStatus {
    /** Is this member available? */
    unlocked: boolean;
    /** Why it's locked (if locked) */
    lockReason?: string;
    /** How to unlock it */
    unlockHint?: string;
    /** Progress toward unlock (0-1) */
    progress?: number;
    /** What's needed to unlock */
    requirement?: string;
}
export interface TeamUnlockState {
    /** User's current relationship stage */
    stage: RelationshipStage;
    /** Subscription tier (subscribers bypass relationship requirements) */
    tier: 'free' | 'friend' | 'partner';
    /** Which team members are unlocked */
    unlockedMembers: TeamMemberId[];
    /** Recently unlocked (for celebration) */
    newlyUnlocked?: TeamMemberId;
    /** Next unlock available */
    nextUnlock?: {
        member: TeamMemberUnlock;
        conversationsNeeded: number;
        daysNeeded: number;
    };
}
/**
 * The Ferni team and when they unlock.
 * Order matters - this is the order they're introduced.
 */
export declare const TEAM_MEMBERS: TeamMemberUnlock[];
/**
 * Calculate relationship stage from user metrics.
 */
export declare function calculateRelationshipStage(metrics: {
    totalConversations: number;
    daysSinceFirstMeeting: number;
    currentStreak: number;
    longestStreak: number;
}): RelationshipStage;
/**
 * Get unlock status for a team member.
 */
export declare function getTeamMemberUnlockStatus(member: TeamMemberUnlock, stage: RelationshipStage, tier: 'free' | 'friend' | 'partner', metrics?: {
    totalConversations: number;
    daysSinceFirstMeeting: number;
    currentStreak?: number;
    longestStreak?: number;
}): UnlockStatus;
/**
 * Get complete team unlock state for a user.
 */
export declare function getTeamUnlockState(profile: UserProfile | null, tier?: 'free' | 'friend' | 'partner'): TeamUnlockState;
/**
 * Check if a specific team member is available for a user.
 *
 * NOTE: This inherits BYPASS_TEAM_UNLOCKS behavior from getTeamUnlockState().
 * When BYPASS_TEAM_UNLOCKS=true, all members are considered available.
 */
export declare function isTeamMemberAvailable(memberId: TeamMemberId, profile: UserProfile | null, tier?: 'free' | 'friend' | 'partner'): boolean;
/**
 * Check if all core team members are unlocked for a user.
 * Marketplace agents require the full team to be unlocked first.
 */
export declare function isFullTeamUnlocked(profile: UserProfile | null, tier?: 'free' | 'friend' | 'partner'): boolean;
/**
 * Get the team member that was most recently unlocked (for celebration).
 * Compare previous and current unlock states to detect new unlocks.
 */
export declare function detectNewUnlock(previousMembers: TeamMemberId[], currentMembers: TeamMemberId[]): TeamMemberUnlock | null;
/**
 * Get Ferni's introduction message when a team member is unlocked.
 */
export declare function getUnlockIntroduction(memberId: TeamMemberId): string | null;
/**
 * Get the teaser message for a locked team member.
 */
export declare function getLockedTeaser(memberId: TeamMemberId): string | null;
/**
 * Messages Ferni can use to tease upcoming unlocks naturally in conversation.
 * These should be sprinkled in occasionally, not every time.
 */
export declare const UNLOCK_TEASERS: {
    nearMayaUnlock: string[];
    nearPeterUnlock: string[];
    topicTeaser: {
        habits: string;
        research: string;
        communication: string;
        planning: string;
        wisdom: string;
    };
};
/**
 * Get a contextual teaser about upcoming unlocks.
 * Use sparingly - maybe 10% of conversations.
 */
export declare function getContextualUnlockTeaser(state: TeamUnlockState, topic?: string): string | null;
/**
 * Get team data formatted for frontend display.
 */
export declare function getTeamDisplayData(state: TeamUnlockState): Array<{
    id: TeamMemberId;
    name: string;
    role: string;
    description: string;
    unlocked: boolean;
    progress: number;
    unlockHint?: string;
    premium?: boolean;
}>;
//# sourceMappingURL=team-unlocks.d.ts.map