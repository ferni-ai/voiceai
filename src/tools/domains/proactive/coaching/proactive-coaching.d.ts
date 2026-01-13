/**
 * Proactive Coaching System
 *
 * Makes coaches REAL partners who:
 * - Notice when you haven't shown up
 * - Celebrate your milestones before you forget
 * - Spot patterns and offer help
 * - Check in during life transitions
 * - Know when to push and when to give space
 *
 * TRIGGERS include:
 * - Life Coaching: loneliness_check_in, social_win_celebration, belonging_milestone
 * - Quiet Growth: rest_permission_needed, plateau_celebration, seasonal_transition
 * - Standard: silence_check_in, streak_at_risk, pattern_detected, mood_trend
 */
import { llm } from '@livekit/agents';
export type ProactiveTriggerType = 'silence_check_in' | 'streak_at_risk' | 'streak_milestone' | 'challenge_reminder' | 'challenge_milestone' | 'pattern_detected' | 'mood_trend' | 'level_up_ready' | 'life_transition_check' | 'celebration_due' | 'encouragement_needed' | 'accountability_reminder' | 'weekly_reflection_due' | 'habit_anniversary' | 'comeback_opportunity' | 'loneliness_check_in' | 'social_win_celebration' | 'belonging_milestone' | 'conversation_follow_up' | 'boundary_check_in' | 'rebuilding_milestone' | 'fresh_start_anniversary' | 'transition_stage_shift' | 'rest_permission_needed' | 'plateau_celebration' | 'seasonal_transition' | 'enough_for_today' | 'gentle_pace_check';
export interface ProactiveTrigger {
    id: string;
    type: ProactiveTriggerType;
    userId: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    habitId?: string;
    challengeId?: string;
    data: Record<string, unknown>;
    detectedAt: Date;
    message: ProactiveMessage;
    dismissed: boolean;
    actedOn: boolean;
}
export interface ProactiveMessage {
    opener: string;
    body: string;
    question?: string;
    actionSuggestion?: string;
    tone: 'warm' | 'celebratory' | 'gentle' | 'encouraging' | 'curious';
}
interface DetectionContext {
    userId: string;
    tendency?: string;
    lifeStage?: string;
    lastActivity?: Date;
    activeHabits: Array<{
        id: string;
        name: string;
        currentStreak: number;
        lastCompletion?: Date;
        level: number;
        successRate: number;
    }>;
    activeChallenge?: {
        id: string;
        type: string;
        currentDay: number;
        completedDays: number;
    };
    recentMoods: Array<{
        mood: string;
        energy: string;
        date: Date;
    }>;
    weeklyReflectionsDue: boolean;
}
/**
 * Detect all proactive triggers for a user
 */
export declare function detectProactiveTriggers(context: DetectionContext): ProactiveTrigger[];
/**
 * Connection domain: Loneliness check-in
 */
export declare function generateLonelinessCheckInMessage(): ProactiveMessage;
/**
 * Connection domain: Social win celebration
 */
export declare function generateSocialWinCelebrationMessage(winType: string): ProactiveMessage;
/**
 * Difficult Conversations domain: Follow-up on conversation
 */
export declare function generateConversationFollowUpMessage(conversationType: string): ProactiveMessage;
/**
 * Difficult Conversations domain: Boundary check-in
 */
export declare function generateBoundaryCheckInMessage(boundaryName: string): ProactiveMessage;
/**
 * Second Chances domain: Rebuilding milestone
 */
export declare function generateRebuildingMilestoneMessage(milestone: string, journeyType: string): ProactiveMessage;
/**
 * Second Chances domain: Fresh start anniversary
 */
export declare function generateFreshStartAnniversaryMessage(duration: string): ProactiveMessage;
/**
 * Life Transitions domain: Transition stage shift
 */
export declare function generateTransitionStageShiftMessage(fromStage: string, toStage: string, transitionType: string): ProactiveMessage;
/**
 * Life Transitions domain: General check-in
 */
export declare function generateLifeTransitionCheckInMessage(transitionType: string): ProactiveMessage;
/**
 * Connection domain: Belonging milestone
 */
export declare function generateBelongingMilestoneMessage(milestone: string): ProactiveMessage;
/**
 * Quiet Growth: Rest permission needed
 */
export declare function generateRestPermissionMessage(signType: 'overwork' | 'burnout' | 'relentless' | 'no_breaks'): ProactiveMessage;
/**
 * Quiet Growth: Plateau celebration
 */
export declare function generatePlateauCelebrationMessage(plateauType: 'maintaining' | 'integration' | 'holding_gains'): ProactiveMessage;
/**
 * Quiet Growth: Seasonal transition wisdom
 */
export declare function generateSeasonalTransitionMessage(season: 'spring' | 'summer' | 'autumn' | 'winter'): ProactiveMessage;
/**
 * Quiet Growth: Enough for today reminder
 */
export declare function generateEnoughForTodayMessage(): ProactiveMessage;
/**
 * Quiet Growth: Gentle pace check
 */
export declare function generateGentlePaceCheckMessage(paceType: 'rushing' | 'comparing' | 'urgency'): ProactiveMessage;
export declare function createProactiveCoachingTools(): {
    /**
     * Check for proactive coaching opportunities
     */
    checkForProactiveOpportunities: llm.FunctionTool<Record<string, never>, unknown, {
        hasOpportunities: boolean;
        message: string;
        topPriority?: undefined;
        otherTriggers?: undefined;
        suggestion?: undefined;
    } | {
        hasOpportunities: boolean;
        topPriority: {
            type: ProactiveTriggerType;
            priority: "medium" | "low" | "high" | "urgent";
            message: ProactiveMessage;
        };
        otherTriggers: {
            type: ProactiveTriggerType;
            priority: "medium" | "low" | "high" | "urgent";
        }[];
        suggestion: string;
        message?: undefined;
    }>;
    /**
     * Generate personalized proactive message
     */
    generateProactiveMessage: llm.FunctionTool<{
        triggerType: "streak_at_risk" | "streak_milestone" | "pattern_detected" | "silence_check_in" | "challenge_reminder" | "challenge_milestone" | "mood_trend" | "level_up_ready" | "life_transition_check" | "celebration_due" | "encouragement_needed" | "accountability_reminder" | "weekly_reflection_due" | "habit_anniversary" | "comeback_opportunity";
        context?: string | undefined;
    }, unknown, {
        message: ProactiveMessage;
        tendencyAdjusted: boolean;
        tip: string;
    }>;
    /**
     * Schedule a follow-up check-in
     */
    scheduleFollowUp: llm.FunctionTool<{
        reason: string;
        timing: "tomorrow" | "in_3_days" | "next_week" | "in_2_weeks" | "next_month";
        habitId?: string | undefined;
        priority?: "medium" | "low" | "high" | undefined;
    }, unknown, {
        scheduled: boolean;
        date: string;
        daysUntil: number;
        reason: string;
        message: string;
    }>;
    /**
     * Get pending follow-ups
     */
    getPendingFollowUps: llm.FunctionTool<Record<string, never>, unknown, {
        dueNow: {
            id: string;
            reason: string;
            scheduledFor: string;
            priority: string;
        }[];
        upcomingCount: number;
        suggestion: string;
    }>;
    /**
     * Mark follow-up as complete
     */
    completeFollowUp: llm.FunctionTool<{
        followUpId: string;
        outcome?: string | undefined;
    }, unknown, {
        completed: boolean;
        message: string;
    }>;
    /**
     * Celebrate an achievement proactively
     */
    celebrateAchievement: llm.FunctionTool<{
        achievementType: "breakthrough" | "consistency" | "comeback" | "streak_milestone" | "challenge_complete" | "level_up" | "first_habit" | "life_win";
        details: string;
    }, unknown, {
        celebration: string;
        details: string;
        followUp: string;
        suggestion: string;
    }>;
};
export default createProactiveCoachingTools;
//# sourceMappingURL=proactive-coaching.d.ts.map