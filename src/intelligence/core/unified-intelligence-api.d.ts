/**
 * Unified Intelligence API
 *
 * Single entry point for the unified intelligence system.
 * Coordinates Context Assembly, Cross-Domain Correlation, and Proactive Intelligence.
 *
 * Architecture Levels:
 * - Level 2: Context Assembly (context-assembler.ts)
 * - Level 4: Cross-Domain Correlation (patterns/cross-domain-correlator.ts)
 * - Level 5: Proactive Intelligence (proactive/proactive-engine.ts)
 *
 * @module intelligence/unified-intelligence-api
 */
import { type ContextWindow, type ImmediateContext } from './context-assembler.js';
import { type DomainSignal, type CrossDomainCorrelation } from '../patterns/cross-domain-correlator.js';
import { type SurfaceMoment, type ProactiveIntelligenceInsight } from '../proactive/proactive-engine.js';
import type { Persona } from '../../personas/types.js';
export type { SurfaceMoment, DomainSignal, ImmediateContext, ContextWindow };
export type { CrossDomainCorrelation, ProactiveIntelligenceInsight };
/**
 * Options for getting intelligence for a turn
 */
export interface IntelligenceOptions {
    moment: SurfaceMoment;
    voiceEmotion?: {
        primary?: string;
        valence?: string;
        energy?: number;
    };
    calendarEvents?: Array<{
        title: string;
        startTime: Date;
        isImportant?: boolean;
    }>;
    recentTopics?: string[];
    currentTopic?: string;
    persona?: Persona;
    forceRefresh?: boolean;
}
/**
 * Result from getIntelligenceForTurn
 */
export interface IntelligenceForTurnResult {
    context: ContextWindow;
    correlations: CrossDomainCorrelation[];
    proactiveInsights: ProactiveIntelligenceInsight[];
    formattedContext: string;
}
/**
 * Initialize intelligence for a new session.
 * Call this at session start.
 */
export declare function initIntelligenceSession(userId: string): void;
/**
 * Clean up intelligence at session end.
 * Call this when a session ends.
 */
export declare function cleanupIntelligence(userId: string): void;
/**
 * Get all intelligence for a conversation turn.
 *
 * This is the main entry point - call this once per turn to get
 * everything Ferni needs to respond intelligently.
 *
 * @example
 * ```typescript
 * const intelligence = await getIntelligenceForTurn(userId, {
 *   moment: 'session_start',
 *   voiceEmotion: { primary: 'anxious', energy: 0.3 },
 *   recentTopics: ['work stress', 'sleep issues'],
 * });
 *
 * // Use in prompt
 * systemPrompt += intelligence.formattedContext;
 *
 * // Check for proactive insight to surface
 * if (intelligence.proactiveInsights.length > 0) {
 *   const insight = intelligence.proactiveInsights[0];
 *   // Surface it and mark as delivered
 *   markInsightSurfaced(userId, insight.id);
 * }
 * ```
 */
export declare function getIntelligenceForTurn(userId: string, options: IntelligenceOptions): Promise<IntelligenceForTurnResult>;
/**
 * Record a domain signal for cross-domain correlation.
 *
 * Call this whenever you observe a meaningful change in any domain:
 * - User mentions being tired → sleep domain
 * - Habit completed → habits domain
 * - Stress detected in voice → stress domain
 * - Person mentioned → person_mentioned domain
 *
 * @example
 * ```typescript
 * // When user mentions sleep issues
 * recordDomainSignal(userId, {
 *   domain: 'sleep',
 *   store: 'conversation',
 *   metric: 'quality',
 *   direction: 'decreased',
 *   magnitude: 'moderate',
 *   timestamp: new Date(),
 * });
 *
 * // When habit is completed
 * recordDomainSignal(userId, {
 *   domain: 'habits',
 *   store: 'habit-coaching',
 *   metric: 'morning_routine',
 *   direction: 'completed',
 *   magnitude: 'moderate',
 *   timestamp: new Date(),
 * });
 * ```
 */
export declare function recordDomainSignal(userId: string, signal: DomainSignal): void;
/**
 * Mark a proactive insight as surfaced (shown to user).
 * Call this after you've delivered an insight to the user.
 */
export declare function markInsightSurfaced(userId: string, insightId: string): void;
/**
 * Record user reaction to a proactive insight.
 * Use this to learn what insights land well.
 */
export declare function recordInsightReaction(userId: string, insightId: string, reaction: 'positive' | 'neutral' | 'negative'): void;
/**
 * Get all domain signals for a user (for debugging/testing).
 */
export declare function getDomainSignals(userId: string): DomainSignal[];
/**
 * Check if an insight was surfaced.
 */
export declare function wasInsightSurfaced(userId: string, insightId: string): boolean;
/**
 * Get reaction to an insight.
 */
export declare function getInsightReaction(userId: string, insightId: string): 'positive' | 'neutral' | 'negative' | undefined;
/**
 * Get all correlations for a user (for debugging/advanced use).
 */
export declare function getAllCorrelations(userId: string): CrossDomainCorrelation[];
/**
 * Clear all caches for a user.
 * Useful when significant changes occur that invalidate cached data.
 */
export declare function clearIntelligenceCaches(userId?: string): void;
/**
 * Quick check if there are proactive insights ready for a moment.
 * Lighter weight than full getIntelligenceForTurn.
 */
export declare function hasProactiveInsight(userId: string, moment: SurfaceMoment): Promise<boolean>;
/**
 * Get the top proactive insight for a moment without full context assembly.
 */
export declare function getTopProactiveInsight(userId: string, moment: SurfaceMoment): Promise<ProactiveIntelligenceInsight | null>;
//# sourceMappingURL=unified-intelligence-api.d.ts.map