/**
 * Onboarding Check-In Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * A warm, intentional sequence of proactive touchpoints during the first 14 days
 * to build relationship, establish habit, and move toward "trusted advisor" status.
 *
 * Philosophy:
 * - NOT a drip campaign - each touchpoint has genuine purpose
 * - Responsive to user engagement level
 * - Uses ML timing for optimal send times
 * - Feels like a friend who genuinely cares about your success
 *
 * Arc Structure:
 * - Day 1: Welcome + first check-in (same day as signup)
 * - Day 2: "How did yesterday go?" follow-up
 * - Day 3-4: First topic deep-dive check-in
 * - Day 5-7: First week reflection
 * - Day 10-14: Building momentum check-in
 * - Day 14: Two-week milestone celebration
 *
 * @module OnboardingCheckInArc
 */
import type { UserProfile } from '../../types/user-profile.js';
export type OnboardingMilestone = 'signup' | 'first_conversation' | 'first_followup' | 'first_topic_explored' | 'first_week' | 'second_week' | 'first_month';
export type CheckInType = 'welcome_followup' | 'next_day_check' | 'topic_deepdive' | 'first_week_reflection' | 'momentum_check' | 'two_week_celebration' | 'habit_nudge' | 'win_celebration';
export type EngagementLevel = 'high' | 'medium' | 'low' | 'silent';
export interface OnboardingState {
    userId: string;
    signupDate: Date;
    daysSinceSignup: number;
    milestonesReached: OnboardingMilestone[];
    lastMilestoneDate?: Date;
    conversationCount: number;
    lastConversationDate?: Date;
    engagementLevel: EngagementLevel;
    checkInsSent: Array<{
        type: CheckInType;
        sentAt: Date;
        responseReceived: boolean;
    }>;
    primaryConcern?: string;
    name?: string;
    preferredPersona?: string;
    arcComplete: boolean;
    arcCompletedAt?: Date;
}
export interface ScheduledCheckIn {
    id: string;
    userId: string;
    type: CheckInType;
    scheduledFor: Date;
    persona: string;
    message: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
}
/**
 * Initialize onboarding state for a new user
 */
export declare function initializeOnboarding(userId: string, profile?: Partial<UserProfile>): OnboardingState;
/**
 * Get onboarding state for a user
 */
export declare function getOnboardingState(userId: string): OnboardingState | undefined;
/**
 * Update onboarding state after a conversation
 */
export declare function recordConversation(userId: string, context?: {
    primaryConcern?: string;
    persona?: string;
}): void;
/**
 * Record that a topic was explored in depth
 */
export declare function recordTopicExplored(userId: string, topic: string): void;
/**
 * Mark a check-in as sent
 */
export declare function recordCheckInSent(userId: string, type: CheckInType, responseReceived?: boolean): void;
/**
 * Mark that user responded to a check-in
 */
export declare function recordCheckInResponse(userId: string): void;
/**
 * Get pending check-ins for a user based on their onboarding state
 */
export declare function getPendingCheckIns(userId: string): Promise<ScheduledCheckIn[]>;
/**
 * Check if user is in onboarding period
 */
export declare function isInOnboardingPeriod(userId: string): boolean;
/**
 * Get onboarding progress summary
 */
export declare function getOnboardingProgress(userId: string): {
    daysSinceSignup: number;
    milestonesReached: number;
    checkInsSent: number;
    engagementLevel: EngagementLevel;
    arcComplete: boolean;
} | null;
export declare const onboardingArc: {
    initialize: typeof initializeOnboarding;
    getState: typeof getOnboardingState;
    recordConversation: typeof recordConversation;
    recordTopicExplored: typeof recordTopicExplored;
    recordCheckInSent: typeof recordCheckInSent;
    recordCheckInResponse: typeof recordCheckInResponse;
    getPendingCheckIns: typeof getPendingCheckIns;
    isInOnboarding: typeof isInOnboardingPeriod;
    getProgress: typeof getOnboardingProgress;
};
export default onboardingArc;
//# sourceMappingURL=onboarding-checkin-arc.d.ts.map