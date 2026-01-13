/**
 * Principal Alignment Metrics
 *
 * > "You can't improve what you can't measure."
 *
 * Observability for the Principal Alignment system:
 * - Truth obligations detected and acted upon
 * - Attachment concern patterns over time
 * - Human referral effectiveness
 * - Values conflict surfacing rate
 * - Manipulation risk detection
 *
 * @module @ferni/principal-alignment/metrics
 */
import type { AttachmentConcern, AttachmentSeverity, ManipulationRisk, PrincipalAlignmentMetrics, ReferralReason, TruthCategory, ValuesConflictType } from './types.js';
interface MetricsEntry {
    timestamp: number;
    type: string;
    category?: string;
    severity?: string;
    actedOn: boolean;
    userId: string;
    sessionId: string;
}
/**
 * Record a truth obligation event
 */
export declare function recordTruthObligationEvent(userId: string, sessionId: string, data: {
    category: TruthCategory | null;
    severity: string;
    actedOn: boolean;
    confidence: number;
}): void;
/**
 * Record an attachment health event
 */
export declare function recordAttachmentHealthEvent(userId: string, sessionId: string, data: {
    severity: AttachmentSeverity;
    primaryConcern: AttachmentConcern | null;
    concernScore: number;
    interventionDelivered: boolean;
}): void;
/**
 * Record a human referral event
 */
export declare function recordHumanReferralEvent(userId: string, sessionId: string, data: {
    reason: ReferralReason | null;
    urgency: string;
    suggested: boolean;
    acknowledged?: boolean;
}): void;
/**
 * Record a values conflict event
 */
export declare function recordValuesConflictEvent(userId: string, sessionId: string, data: {
    conflictType: ValuesConflictType | null;
    values: string[];
    significance: string;
    surfaced: boolean;
}): void;
/**
 * Record a manipulation check event
 */
export declare function recordManipulationCheckEvent(userId: string, sessionId: string, data: {
    riskType: ManipulationRisk | null;
    confidence: number;
    flagged: boolean;
    corrected: boolean;
}): void;
/**
 * Record alignment score
 */
export declare function recordAlignmentScore(userId: string, sessionId: string, score: number): void;
/**
 * Get user's principal alignment metrics
 */
export declare function getUserMetrics(userId: string): PrincipalAlignmentMetrics | null;
/**
 * Get aggregate metrics across all users
 */
export declare function getAggregateMetrics(): {
    totalTruthObligations: number;
    totalTruthObligationsActedOn: number;
    truthActionRate: number;
    totalAttachmentConcerns: number;
    totalReferrals: number;
    referralFollowRate: number;
    totalValuesConflicts: number;
    totalManipulationRisks: number;
    averageAlignmentScore: number;
    activeUsers: number;
};
/**
 * Get recent events (for debugging/dashboards)
 */
export declare function getRecentEvents(limit?: number, filters?: {
    type?: string;
    userId?: string;
    actedOn?: boolean;
}): MetricsEntry[];
/**
 * Get events by type with counts
 */
export declare function getEventBreakdown(): Record<string, {
    total: number;
    actedOn: number;
    rate: number;
}>;
/**
 * Get health check for principal alignment system
 */
export declare function getHealthCheck(): {
    healthy: boolean;
    issues: string[];
    metrics: {
        truthActionRate: number;
        referralFollowRate: number;
        averageAlignmentScore: number;
        manipulationRiskRate: number;
    };
};
/**
 * Clear metrics buffer (keep user metrics)
 */
export declare function clearMetricsBuffer(): void;
/**
 * Clear all metrics
 */
export declare function clearAllMetrics(): void;
/**
 * Clear metrics for a specific user
 */
export declare function clearUserMetrics(userId: string): void;
export type { MetricsEntry };
//# sourceMappingURL=metrics.d.ts.map