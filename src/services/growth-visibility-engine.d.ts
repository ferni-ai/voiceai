/**
 * Growth Visibility Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: helping users see their own growth
 * when they can't see it themselves. Humans minimize their progress.
 * Ferni REMEMBERS and REFLECTS.
 *
 * Types of growth we track:
 * 1. **Capability Growth**: "You couldn't do X before, now you can"
 * 2. **Topic Comfort**: "This topic used to shut you down, now you discuss it freely"
 * 3. **Pattern Breaks**: "You used to avoid Y, now you tackle it head-on"
 * 4. **Consistency Improvement**: "You went from sporadic to regular"
 * 5. **Depth Increase**: "Your conversations have gotten deeper"
 * 6. **Emotional Regulation**: "You handle Z differently now"
 * 7. **Self-Awareness**: "You notice things about yourself you didn't before"
 *
 * Philosophy:
 * - Track LONGITUDINAL data (over time)
 * - Surface at the RIGHT moment (not randomly)
 * - Be SPECIFIC (not generic praise)
 * - Show the CONTRAST (before vs. after)
 *
 * @module GrowthVisibilityEngine
 */
import type { UserProfile } from '../types/user-profile.js';
export type GrowthType = 'capability_growth' | 'topic_comfort' | 'pattern_break' | 'consistency_improvement' | 'depth_increase' | 'emotional_regulation' | 'self_awareness';
export interface GrowthInsight {
    id: string;
    type: GrowthType;
    userId: string;
    /** What grew */
    area: string;
    /** What it was like before */
    before: string;
    /** What it's like now */
    after: string;
    /** Evidence for this growth */
    evidence: GrowthEvidence[];
    /** Time period of growth */
    timespan: {
        start: Date;
        end: Date;
        durationDays: number;
    };
    /** How confident are we in this insight (0-1) */
    confidence: number;
    /** Has this been surfaced to the user? */
    surfaced: boolean;
    /** When surfaced */
    surfacedAt?: Date;
    /** User's reaction */
    userReaction?: 'resonated' | 'neutral' | 'dismissed';
    /** Generated reflection */
    reflection?: string;
}
export interface GrowthEvidence {
    type: 'conversation' | 'behavior' | 'explicit_statement' | 'pattern';
    timestamp: Date;
    description: string;
    source?: string;
}
export interface GrowthSnapshot {
    userId: string;
    capturedAt: Date;
    /** Topics discussed and comfort level */
    topicComfort: Map<string, TopicComfortLevel>;
    /** Behavioral patterns observed */
    patterns: BehavioralPattern[];
    /** Emotional handling patterns */
    emotionalPatterns: EmotionalPattern[];
    /** Conversation depth metrics */
    conversationDepth: ConversationDepthMetrics;
    /** Self-awareness indicators */
    selfAwareness: SelfAwarenessIndicators;
}
export interface TopicComfortLevel {
    topic: string;
    comfortLevel: 'avoidant' | 'uncomfortable' | 'neutral' | 'comfortable' | 'open';
    lastDiscussed: Date;
    discussionCount: number;
    emotionalIntensityAvg: number;
}
export interface BehavioralPattern {
    pattern: string;
    frequency: 'rarely' | 'sometimes' | 'often' | 'consistently';
    firstObserved: Date;
    lastObserved: Date;
    occurrences: number;
}
export interface EmotionalPattern {
    trigger: string;
    typicalResponse: string;
    intensityTrend: 'increasing' | 'stable' | 'decreasing';
    observations: number;
}
export interface ConversationDepthMetrics {
    avgTurnLength: number;
    vulnerabilityFrequency: number;
    insightFrequency: number;
    questionFrequency: number;
}
export interface SelfAwarenessIndicators {
    selfReflectionCount: number;
    patternRecognition: number;
    emotionalLabeling: number;
    growthAcknowledgment: number;
}
export interface GrowthReflection {
    insight: GrowthInsight;
    reflection: string;
    ssml: string;
    suggestedMoment: 'session_start' | 'after_related_topic' | 'milestone' | 'anytime';
}
export declare class GrowthVisibilityEngine {
    private userId;
    private snapshots;
    private insights;
    private currentSnapshot;
    constructor(userId: string);
    /**
     * Create an empty snapshot
     */
    private createEmptySnapshot;
    /**
     * Take a snapshot of current state for later comparison
     */
    captureSnapshot(): void;
    /**
     * Record a conversation turn for growth tracking
     */
    recordTurn(turn: {
        userMessage: string;
        topic?: string;
        emotion?: {
            primary: string;
            intensity: number;
        };
        wasVulnerable?: boolean;
        hadInsight?: boolean;
    }): void;
    /**
     * Infer comfort level from emotional intensity
     */
    private inferComfortLevel;
    /**
     * Detect growth by comparing snapshots
     */
    detectGrowth(): GrowthInsight[];
    /**
     * Check if topic comfort improved
     */
    private hasComfortImproved;
    /**
     * Check if conversation depth increased
     */
    private hasDepthIncreased;
    /**
     * Check if self-awareness grew
     */
    private hasSelfAwarenessGrown;
    /**
     * Create a growth insight
     */
    private createGrowthInsight;
    /**
     * Generate a growth reflection for surfacing
     */
    generateReflection(insight: GrowthInsight): GrowthReflection;
    /**
     * Get reflection templates by type
     */
    private getReflectionTemplates;
    /**
     * Format timespan for natural language
     */
    private formatTimespan;
    /**
     * Get suggested moment to surface insight
     */
    private getSuggestedMoment;
    /**
     * Get insight to surface if appropriate
     */
    getInsightToSurface(context?: {
        currentTopic?: string;
        sessionStart?: boolean;
        milestone?: boolean;
    }): GrowthReflection | null;
    /**
     * Record user reaction to surfaced insight
     */
    recordReaction(insightId: string, reaction: 'resonated' | 'neutral' | 'dismissed'): void;
    /**
     * Import growth data from user profile
     */
    importFromProfile(profile: UserProfile): void;
    /**
     * Export growth data for profile persistence
     */
    exportForProfile(): {
        snapshots: GrowthSnapshot[];
        insights: GrowthInsight[];
    };
    /**
     * Get all detected insights
     */
    getAllInsights(): GrowthInsight[];
    /**
     * Get stats
     */
    getStats(): {
        totalInsights: number;
        surfaced: number;
        resonated: number;
        byType: Record<GrowthType, number>;
    };
    /**
     * Reset for new session (keep historical data)
     */
    reset(): void;
}
export declare function getGrowthVisibilityEngine(userId: string): GrowthVisibilityEngine;
export declare function resetGrowthVisibilityEngine(userId: string): void;
export default GrowthVisibilityEngine;
//# sourceMappingURL=growth-visibility-engine.d.ts.map