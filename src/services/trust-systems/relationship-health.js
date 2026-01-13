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
import { createLogger } from '../../utils/safe-logger.js';
import { indexTrustMilestone } from '../data-layer/integrations/trust-integration.js';
const log = createLogger({ module: 'RelationshipHealth' });
// Activity recording helper (lazy import to avoid circular deps)
async function recordTrustActivity(event) {
    try {
        const dashboard = await import('../../api/v1/admin/dashboard.js');
        dashboard.recordActivity({
            type: event.type,
            action: event.action,
            description: event.description,
            metadata: event.metadata,
        });
    }
    catch {
        // Silently fail if dashboard module not available
    }
}
// ============================================================================
// WEIGHTS - How much each factor contributes to overall health
// ============================================================================
const FACTOR_WEIGHTS = {
    boundaryRespect: 0.2, // 20% - Critical for trust
    emotionalAttunement: 0.18, // 18% - Core to connection
    growthAcknowledgment: 0.15, // 15% - Shows we notice
    callbackSuccess: 0.12, // 12% - Shared history matters
    outreachReception: 0.12, // 12% - Proactive care
    sessionDepth: 0.13, // 13% - Meaningful conversations
    consistency: 0.1, // 10% - Regular engagement
};
// ============================================================================
// THRESHOLDS
// ============================================================================
const STAGE_THRESHOLDS = {
    new: { min: 0, max: 20 },
    building: { min: 21, max: 45 },
    established: { min: 46, max: 65 },
    deep: { min: 66, max: 85 },
    flourishing: { min: 86, max: 100 },
};
const TREND_THRESHOLDS = {
    improving: 5, // +5 points or more
    declining: -5, // -5 points or less
};
// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================
const healthScores = new Map();
const factorInputs = new Map();
// ============================================================================
// FACTOR CALCULATION
// ============================================================================
/**
 * Calculate boundary respect factor
 */
export function calculateBoundaryRespect(userId, metrics) {
    if (metrics.boundariesSet === 0)
        return 100; // No boundaries = perfect respect
    const respectRate = metrics.boundariesRespected / (metrics.boundariesRespected + metrics.boundariesCrossed);
    // Perfect respect = 100, each crossing drops score significantly
    return Math.max(0, Math.round(respectRate * 100));
}
/**
 * Calculate emotional attunement factor
 */
export function calculateEmotionalAttunement(userId, metrics) {
    let score = 50; // Start neutral
    // Detection bonus
    if (metrics.unsaidSignalsDetected > 0) {
        const actedOnRate = metrics.unsaidSignalsActedOn / metrics.unsaidSignalsDetected;
        score += actedOnRate * 25;
    }
    // Emotional mismatch detection is valuable
    score += Math.min(metrics.emotionalMismatchesCaught * 5, 15);
    // Support acceptance rate
    if (metrics.supportOffered > 0) {
        const acceptanceRate = metrics.supportAccepted / metrics.supportOffered;
        score += acceptanceRate * 10;
    }
    return Math.min(100, Math.round(score));
}
/**
 * Calculate growth acknowledgment factor
 */
export function calculateGrowthAcknowledgment(userId, metrics) {
    if (metrics.growthPatternsDetected === 0)
        return 50; // Neutral if no data
    let score = 40; // Base score
    // Bonus for detecting growth
    score += Math.min(metrics.growthPatternsDetected * 5, 20);
    // Big bonus for sharing and it landing well
    if (metrics.growthReflectionsShared > 0) {
        const wellReceivedRate = metrics.reflectionsReceivedWell / metrics.growthReflectionsShared;
        score += wellReceivedRate * 40;
    }
    return Math.min(100, Math.round(score));
}
/**
 * Calculate callback success factor
 */
export function calculateCallbackSuccess(userId, metrics) {
    if (metrics.callbacksAttempted === 0)
        return 50; // Neutral if no callbacks yet
    const landedRate = metrics.callbacksLanded / metrics.callbacksAttempted;
    const awkwardRate = metrics.callbacksAwkward / metrics.callbacksAttempted;
    // High landing rate = good, awkward callbacks hurt
    return Math.max(0, Math.round(landedRate * 100 - awkwardRate * 30));
}
/**
 * Calculate outreach reception factor
 */
export function calculateOutreachReception(userId, metrics) {
    if (metrics.outreachSent === 0)
        return 50; // Neutral if no outreach
    const engagementRate = metrics.outreachEngaged / metrics.outreachSent;
    const ignoreRate = metrics.outreachIgnored / metrics.outreachSent;
    // Good engagement = high score, ignoring = lower
    const score = 50 + engagementRate * 50 - ignoreRate * 20;
    return Math.max(0, Math.min(100, Math.round(score)));
}
/**
 * Calculate session depth factor
 */
export function calculateSessionDepth(userId, metrics) {
    let score = 30; // Base
    // Duration bonus (up to 10 min = more engaged)
    score += Math.min(metrics.avgSessionDurationMinutes * 3, 25);
    // Deep conversation ratio
    if (metrics.totalSessions > 0) {
        const deepRatio = metrics.deepConversations / metrics.totalSessions;
        score += deepRatio * 30;
    }
    // Emotional shares indicate trust
    score += Math.min(metrics.emotionalShares * 2, 15);
    return Math.min(100, Math.round(score));
}
/**
 * Calculate consistency factor
 */
export function calculateConsistency(userId, metrics) {
    if (metrics.sessionDates.length < 2)
        return 50; // Not enough data
    // Calculate gaps between sessions
    const gaps = [];
    const sorted = [...metrics.sessionDates].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
        const gap = (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
        gaps.push(gap);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const gapVariance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length;
    // Consistent, regular engagement = higher score
    // Too long gaps or irregular = lower
    let score = 100;
    // Penalty for long average gaps
    if (avgGap > metrics.expectedCadenceDays * 2) {
        score -= 30;
    }
    else if (avgGap > metrics.expectedCadenceDays) {
        score -= 15;
    }
    // Penalty for inconsistency (high variance)
    score -= Math.min(Math.sqrt(gapVariance) * 5, 30);
    return Math.max(0, Math.round(score));
}
// ============================================================================
// MAIN SCORE CALCULATION
// ============================================================================
/**
 * Calculate overall relationship health score
 */
export function calculateHealthScore(userId, allFactorScores) {
    const existing = healthScores.get(userId);
    // Calculate weighted score
    let totalWeight = 0;
    let weightedSum = 0;
    const factors = [];
    for (const [factorName, weight] of Object.entries(FACTOR_WEIGHTS)) {
        const score = allFactorScores[factorName] ?? 50;
        weightedSum += score * weight;
        totalWeight += weight;
        // Determine trend for this factor
        const trend = calculateFactorTrend(userId, factorName, score);
        factors.push({
            name: factorName,
            weight,
            score,
            trend,
            lastUpdated: new Date(),
        });
        // Store for trend calculation
        recordFactorInput(userId, factorName, score);
    }
    const overallScore = Math.round(weightedSum / totalWeight);
    // Determine stage
    const stage = determineStage(overallScore);
    // Calculate overall trend
    const overallTrend = calculateOverallTrend(userId, overallScore);
    // Generate alerts
    const alerts = generateAlerts(factors, overallScore, existing);
    // Create snapshot for history
    const snapshot = {
        date: new Date(),
        score: overallScore,
        factors: allFactorScores,
    };
    const history = existing?.history || [];
    history.push(snapshot);
    // Keep last 90 days of history
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const trimmedHistory = history.filter((h) => h.date > cutoff);
    const healthScore = {
        userId,
        overallScore,
        overallTrend,
        factors,
        stage,
        alerts,
        lastCalculated: new Date(),
        history: trimmedHistory,
    };
    healthScores.set(userId, healthScore);
    // Record stage change to activity log
    if (existing && existing.stage !== stage) {
        void recordTrustActivity({
            type: 'trust',
            action: 'stage_change',
            description: `User ${userId} advanced to "${getStageName(stage)}" stage`,
            metadata: { userId, previousStage: existing.stage, newStage: stage, score: overallScore },
        });
    }
    log.info({
        userId,
        score: overallScore,
        stage,
        trend: overallTrend,
        alertCount: alerts.filter((a) => !a.acknowledged).length,
    }, '💚 Relationship health calculated');
    return healthScore;
}
/**
 * Record factor input for trend tracking
 */
function recordFactorInput(userId, factor, score) {
    let userInputs = factorInputs.get(userId);
    if (!userInputs) {
        userInputs = new Map();
        factorInputs.set(userId, userInputs);
    }
    let factorHistory = userInputs.get(factor) || [];
    factorHistory.push(score);
    // Keep last 30 values
    if (factorHistory.length > 30) {
        factorHistory = factorHistory.slice(-30);
    }
    userInputs.set(factor, factorHistory);
}
/**
 * Calculate trend for a specific factor
 */
function calculateFactorTrend(userId, factor, currentScore) {
    const userInputs = factorInputs.get(userId);
    if (!userInputs)
        return 'stable';
    const history = userInputs.get(factor);
    if (!history || history.length < 3)
        return 'stable';
    // Compare current to average of last 5
    const recentAvg = history.slice(-5).reduce((a, b) => a + b, 0) / Math.min(history.length, 5);
    const diff = currentScore - recentAvg;
    if (diff >= TREND_THRESHOLDS.improving)
        return 'improving';
    if (diff <= TREND_THRESHOLDS.declining)
        return 'declining';
    return 'stable';
}
/**
 * Calculate overall trend
 */
function calculateOverallTrend(userId, currentScore) {
    const existing = healthScores.get(userId);
    if (!existing || existing.history.length < 3)
        return 'stable';
    // Compare to 7-day ago score
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoSnapshot = existing.history.find((h) => h.date >= weekAgo);
    if (!weekAgoSnapshot)
        return 'stable';
    const diff = currentScore - weekAgoSnapshot.score;
    if (diff >= TREND_THRESHOLDS.improving)
        return 'improving';
    if (diff <= TREND_THRESHOLDS.declining)
        return 'declining';
    return 'stable';
}
/**
 * Determine relationship stage from score
 */
function determineStage(score) {
    for (const [stage, { min, max }] of Object.entries(STAGE_THRESHOLDS)) {
        if (score >= min && score <= max) {
            return stage;
        }
    }
    return 'new';
}
/**
 * Generate health alerts
 */
function generateAlerts(factors, overallScore, existing) {
    const alerts = [];
    const existingAlerts = existing?.alerts || [];
    // Check for declining factors
    for (const factor of factors) {
        if (factor.trend === 'declining' && factor.score < 40) {
            const existingAlert = existingAlerts.find((a) => a.factor === factor.name && !a.acknowledged);
            if (!existingAlert) {
                alerts.push({
                    id: `${factor.name}-${Date.now()}`,
                    severity: factor.score < 20 ? 'concern' : 'warning',
                    message: getAlertMessage(factor.name, factor.score),
                    factor: factor.name,
                    suggestion: getAlertSuggestion(factor.name),
                    createdAt: new Date(),
                    acknowledged: false,
                });
            }
            else {
                alerts.push(existingAlert);
            }
        }
    }
    // Overall health alerts
    if (overallScore < 30) {
        alerts.push({
            id: `overall-${Date.now()}`,
            severity: 'concern',
            message: 'Relationship health needs attention',
            factor: 'overall',
            suggestion: 'Focus on consistent, quality conversations',
            createdAt: new Date(),
            acknowledged: false,
        });
    }
    return alerts;
}
/**
 * Get alert message for a factor
 */
function getAlertMessage(factor, score) {
    const messages = {
        boundaryRespect: 'Some boundaries may have been crossed',
        emotionalAttunement: 'Missing emotional cues more often',
        growthAcknowledgment: "Haven't noticed growth patterns recently",
        callbackSuccess: 'Callbacks not landing well lately',
        outreachReception: 'Check-ins being ignored more often',
        sessionDepth: 'Conversations feel more surface-level',
        consistency: 'Engagement has become irregular',
    };
    return messages[factor] || `${factor} score is low (${score})`;
}
/**
 * Get suggestion for alert
 */
function getAlertSuggestion(factor) {
    const suggestions = {
        boundaryRespect: 'Review boundary list before next conversation',
        emotionalAttunement: 'Listen more carefully for unsaid signals',
        growthAcknowledgment: 'Look for small changes to acknowledge',
        callbackSuccess: 'Be more selective with callbacks',
        outreachReception: 'Reduce outreach frequency or change timing',
        sessionDepth: 'Ask more open-ended questions',
        consistency: 'Gentle re-engagement outreach might help',
    };
    return suggestions[factor] || 'Review recent interactions';
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Get current health score
 */
export function getHealthScore(userId) {
    return healthScores.get(userId) || null;
}
/**
 * Get health trend over a period
 */
export function getHealthTrend(userId, period) {
    const health = healthScores.get(userId);
    if (!health || health.history.length < 2)
        return null;
    const periodDays = { week: 7, month: 30, quarter: 90 };
    const cutoff = new Date(Date.now() - periodDays[period] * 24 * 60 * 60 * 1000);
    const relevantHistory = health.history.filter((h) => h.date >= cutoff);
    if (relevantHistory.length < 2)
        return null;
    const startScore = relevantHistory[0].score;
    const endScore = relevantHistory[relevantHistory.length - 1].score;
    const change = endScore - startScore;
    const changePercent = (change / startScore) * 100;
    let direction = 'stable';
    if (change >= 5)
        direction = 'improving';
    else if (change <= -5)
        direction = 'declining';
    return {
        period,
        startScore,
        endScore,
        change,
        changePercent,
        direction,
    };
}
/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(userId, alertId) {
    const health = healthScores.get(userId);
    if (!health)
        return false;
    const alert = health.alerts.find((a) => a.id === alertId);
    if (!alert)
        return false;
    alert.acknowledged = true;
    return true;
}
/**
 * Record a milestone
 */
export function recordMilestone(userId, type, description) {
    const milestone = {
        id: `${type}-${Date.now()}`,
        type,
        description,
        achievedAt: new Date(),
        score: healthScores.get(userId)?.overallScore || 0,
    };
    // Record to activity log
    void recordTrustActivity({
        type: 'trust',
        action: 'milestone',
        description: `Trust milestone for ${userId}: ${description}`,
        metadata: { userId, milestoneType: type, score: milestone.score },
    });
    // Index to semantic memory
    indexTrustMilestone(userId, {
        id: milestone.id,
        milestone: description,
        level: type,
        evidence: `Score at milestone: ${milestone.score}`,
    });
    log.info({ userId, milestone }, '🏆 Relationship milestone recorded');
    return milestone;
}
/**
 * Get stage name for display
 */
export function getStageName(stage) {
    const names = {
        new: 'Just Getting Started',
        building: 'Building Trust',
        established: 'Established Connection',
        deep: 'Deep Understanding',
        flourishing: 'Flourishing Relationship',
    };
    return names[stage];
}
/**
 * Get stage description
 */
export function getStageDescription(stage) {
    const descriptions = {
        new: "We're just beginning to get to know each other",
        building: "We're learning what matters to you",
        established: 'We have a solid foundation of understanding',
        deep: 'I really understand what you need',
        flourishing: "We've built something special together",
    };
    return descriptions[stage];
}
/**
 * Export health data for user
 */
export function exportHealthData(userId) {
    return {
        score: getHealthScore(userId),
        trends: {
            week: getHealthTrend(userId, 'week'),
            month: getHealthTrend(userId, 'month'),
            quarter: getHealthTrend(userId, 'quarter'),
        },
    };
}
// ============================================================================
// AGGREGATE ANALYTICS (for Admin Dashboard)
// ============================================================================
/**
 * Get aggregate trust analytics across all users
 * Used by admin dashboard for real metrics
 */
export function getTrustAggregates() {
    const profiles = Array.from(healthScores.values());
    const totalProfiles = profiles.length;
    if (totalProfiles === 0) {
        return {
            totalProfiles: 0,
            avgTrustScore: 0,
            stageDistribution: {
                new: 0,
                building: 0,
                established: 0,
                deep: 0,
                flourishing: 0,
            },
            activeRelationships: 0,
        };
    }
    // Calculate average score
    const totalScore = profiles.reduce((sum, p) => sum + p.overallScore, 0);
    const avgTrustScore = Math.round(totalScore / totalProfiles);
    // Count stage distribution
    const stageDistribution = {
        new: 0,
        building: 0,
        established: 0,
        deep: 0,
        flourishing: 0,
    };
    for (const profile of profiles) {
        stageDistribution[profile.stage]++;
    }
    // Count "active" as profiles updated in last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeRelationships = profiles.filter((p) => p.lastCalculated > oneWeekAgo).length;
    return {
        totalProfiles,
        avgTrustScore,
        stageDistribution,
        activeRelationships,
    };
}
/**
 * Get stage distribution as percentages for charts
 */
export function getStageDistributionPercent() {
    const aggregates = getTrustAggregates();
    const total = aggregates.totalProfiles || 1; // Avoid division by zero
    const stages = [
        'new',
        'building',
        'established',
        'deep',
        'flourishing',
    ];
    return stages.map((stage) => ({
        stage,
        name: getStageName(stage),
        count: aggregates.stageDistribution[stage],
        percent: Math.round((aggregates.stageDistribution[stage] / total) * 100),
    }));
}
/**
 * Get all health scores for admin view
 */
export function getAllHealthScores() {
    return Array.from(healthScores.values());
}
// ============================================================================
// WARMTH STATISTICS (for Admin Dashboard)
// ============================================================================
// Track warmth changes for today
const warmthChangesToday = new Map();
/**
 * Convert relationship stage to warmth value (0-1)
 */
function stageToWarmth(stage) {
    const warmthMap = {
        new: 0.3,
        building: 0.5,
        established: 0.7,
        deep: 0.85,
        flourishing: 0.95,
    };
    return warmthMap[stage];
}
/**
 * Record a warmth increase (call this when stage changes)
 */
export function recordWarmthChange(userId, previousStage, newStage) {
    const previousWarmth = stageToWarmth(previousStage);
    const newWarmth = stageToWarmth(newStage);
    if (newWarmth > previousWarmth) {
        warmthChangesToday.set(userId, {
            previous: previousWarmth,
            current: newWarmth,
            timestamp: new Date(),
        });
    }
}
/**
 * Clean up old warmth changes (call periodically)
 */
function cleanupOldWarmthChanges() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    for (const [userId, change] of warmthChangesToday.entries()) {
        if (change.timestamp < startOfToday) {
            warmthChangesToday.delete(userId);
        }
    }
}
/**
 * Get warmth statistics for the admin dashboard
 * Returns real data based on relationship health scores
 */
export function getWarmthStatistics() {
    // Clean up old changes first
    cleanupOldWarmthChanges();
    const profiles = Array.from(healthScores.values());
    if (profiles.length === 0) {
        return {
            avgWarmth: 0,
            usersAtMaxWarmth: 0,
            warmthIncreasesToday: 0,
        };
    }
    // Calculate average warmth across all users
    const totalWarmth = profiles.reduce((sum, p) => sum + stageToWarmth(p.stage), 0);
    const avgWarmth = Math.round((totalWarmth / profiles.length) * 100) / 100;
    // Count users at "max warmth" (deep or flourishing stages)
    const usersAtMaxWarmth = profiles.filter((p) => p.stage === 'deep' || p.stage === 'flourishing').length;
    // Count warmth increases today
    const warmthIncreasesToday = warmthChangesToday.size;
    return {
        avgWarmth,
        usersAtMaxWarmth,
        warmthIncreasesToday,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    calculateHealthScore,
    getHealthScore,
    getHealthTrend,
    acknowledgeAlert,
    recordMilestone,
    getStageName,
    getStageDescription,
    exportHealthData,
    calculateBoundaryRespect,
    calculateEmotionalAttunement,
    calculateGrowthAcknowledgment,
    calculateCallbackSuccess,
    calculateOutreachReception,
    calculateSessionDepth,
    calculateConsistency,
    getTrustAggregates,
    getStageDistributionPercent,
    getAllHealthScores,
};
//# sourceMappingURL=relationship-health.js.map