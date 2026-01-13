/**
 * Relationship Health Score
 *
 * Aggregates trust metrics into a single "relationship health" score.
 * Tracks trends over time and alerts when health is declining.
 *
 * Philosophy: Like a friendship that deepens over time, we measure
 * the quality of connection, not just activity.
 *
 * Health Factors:
 * - Boundary respect rate (are we honoring their limits?)
 * - Emotional attunement (do we notice what's unsaid?)
 * - Growth acknowledgment (do we celebrate their evolution?)
 * - Callback success (do our references land?)
 * - Outreach reception (do they engage with check-ins?)
 * - Session depth (are conversations meaningful?)
 *
 * @module RelationshipHealth
 */
export interface HealthFactor {
    name: string;
    weight: number;
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    lastUpdated: Date;
    details?: string;
}
export interface RelationshipHealthScore {
    userId: string;
    overallScore: number;
    overallTrend: 'improving' | 'stable' | 'declining';
    factors: HealthFactor[];
    stage: 'new' | 'building' | 'established' | 'deep' | 'flourishing';
    alerts: HealthAlert[];
    lastCalculated: Date;
    history: HealthSnapshot[];
}
export interface HealthAlert {
    id: string;
    severity: 'info' | 'warning' | 'concern';
    message: string;
    factor: string;
    suggestion: string;
    createdAt: Date;
    acknowledged: boolean;
}
export interface HealthSnapshot {
    date: Date;
    score: number;
    factors: Record<string, number>;
}
export interface HealthTrend {
    period: 'week' | 'month' | 'quarter';
    startScore: number;
    endScore: number;
    change: number;
    changePercent: number;
    direction: 'improving' | 'stable' | 'declining';
}
export interface RelationshipMilestone {
    id: string;
    type: 'first_callback' | 'boundary_respected' | 'growth_noticed' | 'deep_share' | 'trust_level_up';
    description: string;
    achievedAt: Date;
    score: number;
}
/**
 * Calculate boundary respect factor
 */
export declare function calculateBoundaryRespect(userId: string, metrics: {
    boundariesSet: number;
    boundariesRespected: number;
    boundariesCrossed: number;
}): number;
/**
 * Calculate emotional attunement factor
 */
export declare function calculateEmotionalAttunement(userId: string, metrics: {
    unsaidSignalsDetected: number;
    unsaidSignalsActedOn: number;
    emotionalMismatchesCaught: number;
    supportOffered: number;
    supportAccepted: number;
}): number;
/**
 * Calculate growth acknowledgment factor
 */
export declare function calculateGrowthAcknowledgment(userId: string, metrics: {
    growthPatternsDetected: number;
    growthReflectionsShared: number;
    reflectionsReceivedWell: number;
}): number;
/**
 * Calculate callback success factor
 */
export declare function calculateCallbackSuccess(userId: string, metrics: {
    callbacksAttempted: number;
    callbacksLanded: number;
    callbacksAwkward: number;
}): number;
/**
 * Calculate outreach reception factor
 */
export declare function calculateOutreachReception(userId: string, metrics: {
    outreachSent: number;
    outreachOpened: number;
    outreachEngaged: number;
    outreachIgnored: number;
}): number;
/**
 * Calculate session depth factor
 */
export declare function calculateSessionDepth(userId: string, metrics: {
    avgSessionDurationMinutes: number;
    deepConversations: number;
    totalSessions: number;
    emotionalShares: number;
}): number;
/**
 * Calculate consistency factor
 */
export declare function calculateConsistency(userId: string, metrics: {
    sessionDates: Date[];
    expectedCadenceDays: number;
}): number;
/**
 * Calculate overall relationship health score
 */
export declare function calculateHealthScore(userId: string, allFactorScores: Record<string, number>): RelationshipHealthScore;
/**
 * Get current health score
 */
export declare function getHealthScore(userId: string): RelationshipHealthScore | null;
/**
 * Get health trend over a period
 */
export declare function getHealthTrend(userId: string, period: 'week' | 'month' | 'quarter'): HealthTrend | null;
/**
 * Acknowledge an alert
 */
export declare function acknowledgeAlert(userId: string, alertId: string): boolean;
/**
 * Record a milestone
 */
export declare function recordMilestone(userId: string, type: RelationshipMilestone['type'], description: string): RelationshipMilestone;
/**
 * Get stage name for display
 */
export declare function getStageName(stage: RelationshipHealthScore['stage']): string;
/**
 * Get stage description
 */
export declare function getStageDescription(stage: RelationshipHealthScore['stage']): string;
/**
 * Export health data for user
 */
export declare function exportHealthData(userId: string): {
    score: RelationshipHealthScore | null;
    trends: Record<string, HealthTrend | null>;
};
/**
 * Get aggregate trust analytics across all users
 * Used by admin dashboard for real metrics
 */
export declare function getTrustAggregates(): {
    totalProfiles: number;
    avgTrustScore: number;
    stageDistribution: Record<RelationshipHealthScore['stage'], number>;
    activeRelationships: number;
};
/**
 * Get stage distribution as percentages for charts
 */
export declare function getStageDistributionPercent(): Array<{
    stage: RelationshipHealthScore['stage'];
    name: string;
    count: number;
    percent: number;
}>;
/**
 * Get all health scores for admin view
 */
export declare function getAllHealthScores(): RelationshipHealthScore[];
/**
 * Record a warmth increase (call this when stage changes)
 */
export declare function recordWarmthChange(userId: string, previousStage: RelationshipHealthScore['stage'], newStage: RelationshipHealthScore['stage']): void;
/**
 * Get warmth statistics for the admin dashboard
 * Returns real data based on relationship health scores
 */
export declare function getWarmthStatistics(): {
    avgWarmth: number;
    usersAtMaxWarmth: number;
    warmthIncreasesToday: number;
};
declare const _default: {
    calculateHealthScore: typeof calculateHealthScore;
    getHealthScore: typeof getHealthScore;
    getHealthTrend: typeof getHealthTrend;
    acknowledgeAlert: typeof acknowledgeAlert;
    recordMilestone: typeof recordMilestone;
    getStageName: typeof getStageName;
    getStageDescription: typeof getStageDescription;
    exportHealthData: typeof exportHealthData;
    calculateBoundaryRespect: typeof calculateBoundaryRespect;
    calculateEmotionalAttunement: typeof calculateEmotionalAttunement;
    calculateGrowthAcknowledgment: typeof calculateGrowthAcknowledgment;
    calculateCallbackSuccess: typeof calculateCallbackSuccess;
    calculateOutreachReception: typeof calculateOutreachReception;
    calculateSessionDepth: typeof calculateSessionDepth;
    calculateConsistency: typeof calculateConsistency;
    getTrustAggregates: typeof getTrustAggregates;
    getStageDistributionPercent: typeof getStageDistributionPercent;
    getAllHealthScores: typeof getAllHealthScores;
};
export default _default;
//# sourceMappingURL=relationship-health.d.ts.map