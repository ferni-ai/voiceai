/**
 * Memory Engagement Engine
 *
 * Makes personas proactively use their memory of users in delightful ways.
 * This transforms "I remember that" into genuine relationship moments.
 *
 * CAPABILITIES:
 *   - Surprise callbacks to past conversations
 *   - Progress celebrations based on tracked data
 *   - Pattern reveals that feel like gifts
 *   - Emotional continuity across sessions
 *   - "I've been thinking about you" moments
 */
import type { UserProfile } from '../../types/user-profile.js';
export interface MemoryCallback {
    type: 'anniversary' | 'progress' | 'follow_up' | 'prediction_check' | 'emotional_continuity' | 'small_detail' | 'story_connection' | 'growth_mirror' | 'shared_history';
    content: string;
    triggerCondition?: string;
    personaId: string;
    priority: number;
    expiresAt?: Date;
    deliveredAt?: Date;
}
export interface ProgressMilestone {
    type: string;
    description: string;
    achievedAt: Date;
    celebrationDelivered: boolean;
    personaId: string;
}
export interface PredictionTracker {
    id: string;
    userId: string;
    prediction: string;
    madeAt: Date;
    checkDate: Date;
    outcome?: 'correct' | 'incorrect' | 'partial' | 'unknown';
    followUpDelivered: boolean;
}
export interface RelationshipMilestone {
    type: 'first_conversation' | 'one_week' | 'one_month' | 'three_months' | 'six_months' | 'one_year' | 'conversation_count' | 'first_vulnerability' | 'first_breakthrough' | 'first_celebration';
    achievedAt: Date;
    acknowledged: boolean;
}
export declare const CALLBACK_TEMPLATES: {
    anniversary: {
        one_week: string[];
        one_month: string[];
        three_months: string[];
        six_months: string[];
        one_year: string[];
    };
    progress: {
        ferni: string[];
        'maya-santos': string[];
        'jordan-taylor': string[];
        'peter-john': string[];
    };
    emotional_continuity: string[];
    small_detail: {
        person: string[];
        pet: string[];
        place: string[];
        event: string[];
        health: string[];
    };
    growth_mirror: string[];
    shared_history: string[];
};
export declare const PROACTIVE_TRIGGERS: {
    /**
     * "I've been thinking about you" moments
     * Used when persona wants to initiate based on user data
     */
    thinking_about: string[];
    /**
     * Pattern-based proactive insights (Peter)
     */
    pattern_gift: string[];
    /**
     * Prediction check-ins
     */
    prediction_check: string[];
    /**
     * Goal proximity alerts
     */
    goal_proximity: string[];
    /**
     * Streak protection
     */
    streak_at_risk: string[];
};
export declare class MemoryEngagementEngine {
    private pendingCallbacks;
    private milestones;
    private predictions;
    /**
     * Generate all available callbacks for a user based on their profile
     */
    generateCallbacks(userId: string, profile: UserProfile | null, personaId: string): MemoryCallback[];
    /**
     * Check for relationship anniversary
     */
    private checkAnniversary;
    /**
     * Generate progress callbacks from key moments
     */
    private generateProgressCallbacks;
    /**
     * Check emotional continuity from last session
     */
    private checkEmotionalContinuity;
    /**
     * Generate small detail follow-ups
     */
    private generateDetailCallbacks;
    /**
     * Check if we should mirror user's growth
     */
    private shouldMirrorGrowth;
    /**
     * Generate growth mirror callback
     */
    private generateGrowthMirror;
    /**
     * Get the highest priority callback for delivery
     */
    getNextCallback(userId: string): MemoryCallback | null;
    /**
     * Mark a callback as delivered
     */
    markDelivered(userId: string, callbackType: MemoryCallback['type']): void;
    /**
     * Register a prediction for future follow-up
     */
    registerPrediction(userId: string, prediction: string, checkDate: Date): string;
    /**
     * Get predictions due for follow-up
     */
    getDuePredictions(userId: string): PredictionTracker[];
    /**
     * Record prediction outcome
     */
    recordPredictionOutcome(predictionId: string, outcome: PredictionTracker['outcome']): void;
    /**
     * Generate "I've been thinking about you" moment
     */
    generateThinkingAbout(profile: UserProfile, topic: string): string;
    /**
     * Generate streak-at-risk alert
     */
    generateStreakAlert(streakType: string, days: number): string;
    /**
     * Generate goal proximity alert
     */
    generateGoalProximity(goal: string, percentage: number): string;
    private formatTimeAgo;
    private summarizeMoment;
}
/**
 * Build memory engagement context for prompt injection
 * This helps personas naturally incorporate memory callbacks
 */
export declare function buildMemoryEngagementContext(profile: UserProfile | null, personaId: string, turnCount: number): string;
export declare function getMemoryEngagementEngine(): MemoryEngagementEngine;
export declare function resetMemoryEngagementEngine(): void;
export default MemoryEngagementEngine;
//# sourceMappingURL=memory-engagement.d.ts.map