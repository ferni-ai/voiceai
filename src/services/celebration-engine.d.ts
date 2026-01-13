/**
 * Celebration Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: systematically celebrating wins that
 * humans often minimize or forget. A human friend might say "that's cool"
 * and move on. Ferni CELEBRATES.
 *
 * Types of celebration:
 * 1. **Goal Completion**: Major achievement - you did it!
 * 2. **Milestone Reached**: Progress marker on the journey
 * 3. **Streak Achievement**: Consistency deserves recognition
 * 4. **Growth Recognition**: "Look how far you've come"
 * 5. **Effort Recognition**: Showing up matters, even without results
 * 6. **Relationship Milestone**: Our journey together
 * 7. **First-Time Achievement**: Doing something new
 * 8. **Breakthrough Moment**: An insight or realization
 *
 * Philosophy:
 * - Celebrate IMMEDIATELY when detected
 * - Celebrate PROPORTIONALLY to the achievement
 * - Celebrate PERSONALLY with specific details
 * - Never feel performative - genuine joy
 *
 * @module CelebrationEngine
 */
import type { UserProfile } from '../types/user-profile.js';
export type CelebrationType = 'goal_completed' | 'milestone_reached' | 'streak_achieved' | 'growth_recognized' | 'effort_recognized' | 'relationship_milestone' | 'first_time' | 'breakthrough';
export type CelebrationIntensity = 'subtle' | 'warm' | 'enthusiastic' | 'ecstatic';
export interface CelebrationTrigger {
    id: string;
    type: CelebrationType;
    userId: string;
    personaId: string;
    /** What specifically happened */
    achievement: string;
    /** Why this matters */
    significance: string;
    /** Specific evidence/details */
    evidence: string[];
    /** How big is this? */
    intensity: CelebrationIntensity;
    /** Timestamp */
    detectedAt: Date;
    /** Context for personalization */
    context?: {
        goalName?: string;
        streakDays?: number;
        milestoneName?: string;
        previousStruggle?: string;
        timeframe?: string;
        comparisonToStart?: string;
    };
}
export interface CelebrationResponse {
    /** The celebration message */
    message: string;
    /** SSML version with prosody */
    ssml: string;
    /** Suggested emoji expression for avatar */
    expression: 'delight' | 'pride' | 'warmth' | 'excited' | 'celebrating';
    /** Should we pause before delivering? */
    pauseBeforeMs: number;
    /** Energy level for delivery */
    energy: 'calm' | 'warm' | 'bright' | 'exuberant';
}
export interface CelebrationRecord {
    triggerId: string;
    type: CelebrationType;
    userId: string;
    celebratedAt: Date;
    userReaction?: 'positive' | 'neutral' | 'dismissed';
    messageDelivered: string;
}
export declare class CelebrationEngine {
    private userId;
    private personaId;
    private celebrationHistory;
    private lastCelebrationTurn;
    private celebrationCooldown;
    constructor(userId: string, personaId: string);
    /**
     * Detect celebration opportunities from user message
     */
    detectCelebration(userMessage: string, turnCount: number, context?: {
        activeGoals?: Array<{
            id: string;
            title: string;
            progress: number;
        }>;
        currentStreak?: {
            days: number;
            habit: string;
        };
        profile?: UserProfile;
    }): CelebrationTrigger | null;
    /**
     * Create a trigger with defaults
     */
    private createTrigger;
    /**
     * Generate celebration response for a trigger
     */
    generateCelebration(trigger: CelebrationTrigger): CelebrationResponse;
    /**
     * Get celebration templates by type and intensity
     */
    private getCelebrationTemplates;
    /**
     * Build SSML with appropriate prosody
     */
    private buildCelebrationSSML;
    /**
     * Get expression for avatar
     */
    private getExpression;
    /**
     * Get energy level for delivery
     */
    private getEnergy;
    /**
     * Trigger celebration from goal tracking system
     */
    celebrateGoalCompletion(goal: {
        id: string;
        title: string;
        domain: string;
        startedAt: Date;
    }): CelebrationResponse;
    /**
     * Trigger celebration from streak tracking
     */
    celebrateStreak(streak: {
        days: number;
        habit: string;
    }): CelebrationResponse;
    /**
     * Trigger growth celebration from growth visibility engine
     */
    celebrateGrowth(growth: {
        area: string;
        before: string;
        after: string;
        timespan: string;
    }): CelebrationResponse;
    /**
     * Trigger relationship milestone celebration
     */
    celebrateRelationshipMilestone(milestone: {
        type: 'conversations' | 'months' | 'vulnerability_shared';
        value: number;
    }): CelebrationResponse;
    /**
     * Record user reaction to celebration
     */
    recordReaction(triggerId: string, reaction: 'positive' | 'neutral' | 'dismissed'): void;
    /**
     * Get celebration stats
     */
    getStats(): {
        total: number;
        byType: Record<CelebrationType, number>;
        positiveReactions: number;
    };
    /**
     * Export history for persistence
     */
    exportHistory(): CelebrationRecord[];
    /**
     * Import history from persistence
     */
    importHistory(records: CelebrationRecord[]): void;
    /**
     * Reset for new session
     */
    reset(): void;
}
export declare function getCelebrationEngine(userId: string, personaId: string): CelebrationEngine;
export declare function resetCelebrationEngine(userId: string, personaId: string): void;
export default CelebrationEngine;
//# sourceMappingURL=celebration-engine.d.ts.map