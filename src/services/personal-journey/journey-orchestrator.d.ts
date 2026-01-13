/**
 * Journey Orchestrator
 *
 * The central coordinator for Personal Journey Awareness.
 * Aggregates moments from all sources and decides what/when to share.
 *
 * Responsibilities:
 * 1. Gather moments from all journey services
 * 2. Prioritize based on relevance, timing, and relationship stage
 * 3. Prevent repetition
 * 4. Track delivery for learning
 *
 * Philosophy: Not every moment should be shared. The orchestrator
 * ensures insights feel like gifts, not data dumps.
 *
 * @module services/personal-journey/journey-orchestrator
 */
import type { DeliveryRecord, JourneyMoment, JourneySnapshot } from './types.js';
/**
 * Initialize delivery history from persisted data
 */
export declare function initializeDeliveryHistory(userId: string, persistedDeliveries?: DeliveryRecord[]): void;
/**
 * Gather all available moments from all journey services
 */
export declare function gatherAllMoments(userId: string): JourneyMoment[];
/**
 * Filter moments based on cooldowns and relationship stage
 */
export declare function filterMoments(userId: string, moments: JourneyMoment[]): JourneyMoment[];
/**
 * Prioritize moments based on context
 */
export declare function prioritizeMoments(moments: JourneyMoment[], context: {
    isGreeting?: boolean;
    userText?: string;
    turnCount?: number;
}): JourneyMoment[];
/**
 * Select the best moment for the current turn
 * Returns null if no moment should be shared
 */
export declare function selectMomentForTurn(userId: string, context: {
    isGreeting?: boolean;
    userText?: string;
    turnCount?: number;
}): JourneyMoment | null;
/** Metrics for monitoring Personal Journey performance */
interface JourneyMetrics {
    totalDeliveries: number;
    deliveriesByType: Record<string, number>;
    suppressions: number;
    suppressionsByReason: Record<string, number>;
    reactionsByType: Record<string, {
        positive: number;
        neutral: number;
        negative: number;
    }>;
}
/**
 * Get current metrics snapshot for monitoring
 */
export declare function getJourneyMetrics(): JourneyMetrics;
/**
 * Record that a moment was suppressed (for monitoring)
 */
export declare function recordSuppression(userId: string, reason: 'cooldown' | 'relationship_stage' | 'repetition' | 'feature_flag' | 'no_moments'): void;
/**
 * Record that a moment was delivered
 */
export declare function recordDelivery(userId: string, moment: JourneyMoment, reaction?: 'positive' | 'neutral' | 'negative'): void;
/**
 * Get journey-aware greeting context
 * Aggregates from all services and picks the best greeting enhancement
 */
export declare function getJourneyGreetingContext(userId: string): {
    hasJourneyInsight: boolean;
    insight?: string;
    source?: string;
    priority?: number;
};
/**
 * Get a snapshot of the user's journey state
 */
export declare function getJourneySnapshot(userId: string): JourneySnapshot;
/**
 * Get delivery history for persistence
 */
export declare function getDeliveryHistoryForPersistence(userId: string): DeliveryRecord[];
/**
 * Clear all journey caches for user
 */
export declare function clearAllJourneyCaches(userId: string): void;
export {};
//# sourceMappingURL=journey-orchestrator.d.ts.map