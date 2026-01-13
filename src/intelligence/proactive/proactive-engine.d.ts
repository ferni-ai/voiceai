/**
 * Proactive Engine - Unified Intelligence Level 5
 *
 * "Decides WHEN to share insights"
 *
 * This is the timing intelligence that makes Ferni feel truly present.
 * It's not enough to HAVE insights - you need to know WHEN to surface them.
 *
 * Priority System (from architecture):
 * 1. Late Night Check (Priority 1) - "You're up late..."
 * 2. Overwhelm Detection (Priority 2) - "Sounds like a lot..."
 * 3. Commitment Deadline (Priority 3) - "Remember you wanted to..."
 * 4. Habit Struggle (Priority 5) - "I noticed the habit streak..."
 * 5. Pattern Observation (Priority 6) - "I've been noticing..."
 * 6. Celebration Milestone (Priority 7) - "Wait - did you realize..."
 * 7. Inside Joke Callback (Priority 9) - "That reminds me of..."
 *
 * Rules:
 * - Max 2 proactive insights per session
 * - Cooldown periods honored
 * - Trust level requirements checked
 * - User preference learning applied
 *
 * @module intelligence/proactive/proactive-engine
 */
import type { ContextWindow } from '../context-assembler.js';
import type { CrossDomainCorrelation } from '../patterns/cross-domain-correlator.js';
/**
 * When to surface an insight
 */
export type SurfaceMoment = 'session_start' | 'natural_pause' | 'topic_relevant' | 'session_end';
/**
 * Category of proactive insight
 */
export type InsightCategory = 'late_night_support' | 'overwhelm_detection' | 'commitment_reminder' | 'habit_support' | 'pattern_observation' | 'milestone_celebration' | 'relationship_callback' | 'cross_domain_insight' | 'seasonal_awareness' | 'capacity_warning';
/**
 * A proactive insight ready to surface
 */
export interface ProactiveIntelligenceInsight {
    id: string;
    category: InsightCategory;
    message: string;
    followUp?: string;
    priority: number;
    surfaceMoment: SurfaceMoment;
    createdAt: Date;
    expiresAt?: Date;
    requiresTrustLevel?: number;
    metadata?: Record<string, unknown>;
}
/**
 * Result from checking proactive triggers
 */
export interface ProactiveTriggerResult {
    insights: ProactiveIntelligenceInsight[];
    sessionInsightCount: number;
    canSurfaceMore: boolean;
}
/**
 * User's proactive insight preferences (learned over time)
 */
export interface ProactivePreferences {
    enabled: boolean;
    maxPerSession: number;
    preferredMoments: SurfaceMoment[];
    dislikedCategories: InsightCategory[];
    cooldownDays: number;
}
/**
 * Check all proactive triggers and return applicable insights.
 *
 * Call this at key moments:
 * - Session start
 * - Natural pauses in conversation
 * - When relevant topics come up
 * - Session end
 */
export declare function checkProactiveTriggers(userId: string, context: ContextWindow, moment: SurfaceMoment, correlations?: CrossDomainCorrelation[]): ProactiveTriggerResult;
/**
 * Mark an insight as surfaced (shown to user).
 */
export declare function markInsightSurfaced(userId: string, insightId: string): void;
/**
 * Record user reaction to an insight.
 */
export declare function recordInsightReaction(userId: string, insightId: string, reaction: 'positive' | 'neutral' | 'negative'): void;
/**
 * Check if an insight was already surfaced.
 */
export declare function wasInsightSurfaced(userId: string, insightId: string): boolean;
/**
 * Get reaction to an insight.
 */
export declare function getInsightReaction(userId: string, insightId: string): 'positive' | 'neutral' | 'negative' | undefined;
/**
 * Initialize proactive state for a new session.
 */
export declare function initProactiveSession(userId: string): void;
/**
 * Clean up proactive state at session end.
 */
export declare function cleanupProactiveSession(userId: string): void;
/**
 * Get proactive preferences for a user.
 */
export declare function getProactivePreferences(userId: string): ProactivePreferences;
/**
 * Update proactive preferences.
 */
export declare function updateProactivePreferences(userId: string, updates: Partial<ProactivePreferences>): void;
/**
 * Clear all proactive state for a user.
 */
export declare function clearProactiveState(userId?: string): void;
export declare const proactiveEngine: {
    check: typeof checkProactiveTriggers;
    markSurfaced: typeof markInsightSurfaced;
    recordReaction: typeof recordInsightReaction;
    wasSurfaced: typeof wasInsightSurfaced;
    getReaction: typeof getInsightReaction;
    initSession: typeof initProactiveSession;
    cleanup: typeof cleanupProactiveSession;
    getPreferences: typeof getProactivePreferences;
    updatePreferences: typeof updateProactivePreferences;
    clear: typeof clearProactiveState;
};
//# sourceMappingURL=proactive-engine.d.ts.map