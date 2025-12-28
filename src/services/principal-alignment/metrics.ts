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

import { createLogger } from '../../utils/safe-logger.js';
import type {
  AttachmentConcern,
  AttachmentSeverity,
  ManipulationRisk,
  PrincipalAlignmentMetrics,
  ReferralReason,
  TruthCategory,
  ValuesConflictType,
} from './types.js';

const log = createLogger({ module: 'PrincipalAlignmentMetrics' });

// ============================================================================
// METRICS STORAGE
// ============================================================================

interface MetricsEntry {
  timestamp: number;
  type: string;
  category?: string;
  severity?: string;
  actedOn: boolean;
  userId: string;
  sessionId: string;
}

const metricsBuffer: MetricsEntry[] = [];
const userMetrics = new Map<string, PrincipalAlignmentMetrics>();

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a truth obligation event
 */
export function recordTruthObligationEvent(
  userId: string,
  sessionId: string,
  data: {
    category: TruthCategory | null;
    severity: string;
    actedOn: boolean;
    confidence: number;
  }
): void {
  metricsBuffer.push({
    timestamp: Date.now(),
    type: 'truth_obligation',
    category: data.category || undefined,
    severity: data.severity,
    actedOn: data.actedOn,
    userId,
    sessionId,
  });

  // Update user metrics
  const metrics = getUserMetricsInternal(userId);
  metrics.truthObligationsDetected++;
  if (data.actedOn) {
    metrics.truthObligationsActedOn++;
  }
  metrics.lastUpdated = Date.now();

  log.debug(
    {
      userId,
      category: data.category,
      severity: data.severity,
      actedOn: data.actedOn,
    },
    'Truth obligation event recorded'
  );
}

/**
 * Record an attachment health event
 */
export function recordAttachmentHealthEvent(
  userId: string,
  sessionId: string,
  data: {
    severity: AttachmentSeverity;
    primaryConcern: AttachmentConcern | null;
    concernScore: number;
    interventionDelivered: boolean;
  }
): void {
  if (data.severity !== 'normal') {
    metricsBuffer.push({
      timestamp: Date.now(),
      type: 'attachment_concern',
      category: data.primaryConcern || undefined,
      severity: data.severity,
      actedOn: data.interventionDelivered,
      userId,
      sessionId,
    });

    const metrics = getUserMetricsInternal(userId);
    metrics.attachmentConcernsFlagged++;
    metrics.lastUpdated = Date.now();

    log.debug(
      {
        userId,
        severity: data.severity,
        primaryConcern: data.primaryConcern,
      },
      'Attachment health event recorded'
    );
  }
}

/**
 * Record a human referral event
 */
export function recordHumanReferralEvent(
  userId: string,
  sessionId: string,
  data: {
    reason: ReferralReason | null;
    urgency: string;
    suggested: boolean;
    acknowledged?: boolean;
  }
): void {
  if (data.suggested) {
    metricsBuffer.push({
      timestamp: Date.now(),
      type: 'human_referral',
      category: data.reason || undefined,
      severity: data.urgency,
      actedOn: data.acknowledged || false,
      userId,
      sessionId,
    });

    const metrics = getUserMetricsInternal(userId);
    metrics.humanReferralsSuggested++;
    if (data.acknowledged) {
      metrics.humanReferralsFollowed++;
    }
    metrics.lastUpdated = Date.now();

    log.debug(
      {
        userId,
        reason: data.reason,
        urgency: data.urgency,
        acknowledged: data.acknowledged,
      },
      'Human referral event recorded'
    );
  }
}

/**
 * Record a values conflict event
 */
export function recordValuesConflictEvent(
  userId: string,
  sessionId: string,
  data: {
    conflictType: ValuesConflictType | null;
    values: string[];
    significance: string;
    surfaced: boolean;
  }
): void {
  metricsBuffer.push({
    timestamp: Date.now(),
    type: 'values_conflict',
    category: data.conflictType || undefined,
    severity: data.significance,
    actedOn: data.surfaced,
    userId,
    sessionId,
  });

  const metrics = getUserMetricsInternal(userId);
  metrics.valuesConflictsSurfaced++;
  metrics.lastUpdated = Date.now();

  log.debug(
    {
      userId,
      conflictType: data.conflictType,
      values: data.values,
      surfaced: data.surfaced,
    },
    'Values conflict event recorded'
  );
}

/**
 * Record a manipulation check event
 */
export function recordManipulationCheckEvent(
  userId: string,
  sessionId: string,
  data: {
    riskType: ManipulationRisk | null;
    confidence: number;
    flagged: boolean;
    corrected: boolean;
  }
): void {
  if (data.flagged) {
    metricsBuffer.push({
      timestamp: Date.now(),
      type: 'manipulation_risk',
      category: data.riskType || undefined,
      severity: data.confidence > 0.7 ? 'high' : 'moderate',
      actedOn: data.corrected,
      userId,
      sessionId,
    });

    const metrics = getUserMetricsInternal(userId);
    metrics.manipulationRisksCaught++;
    metrics.lastUpdated = Date.now();

    log.debug(
      {
        userId,
        riskType: data.riskType,
        confidence: data.confidence,
        corrected: data.corrected,
      },
      'Manipulation check event recorded'
    );
  }
}

/**
 * Record alignment score
 */
export function recordAlignmentScore(userId: string, sessionId: string, score: number): void {
  const metrics = getUserMetricsInternal(userId);

  // Running average
  const totalScores =
    metrics.averageAlignmentScore * (metrics.truthObligationsDetected + 1) + score;
  metrics.averageAlignmentScore = totalScores / (metrics.truthObligationsDetected + 2);
  metrics.lastUpdated = Date.now();
}

// ============================================================================
// METRICS RETRIEVAL
// ============================================================================

/**
 * Get user's principal alignment metrics
 */
export function getUserMetrics(userId: string): PrincipalAlignmentMetrics | null {
  return userMetrics.get(userId) || null;
}

/**
 * Get aggregate metrics across all users
 */
export function getAggregateMetrics(): {
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
} {
  let totalTruthObligations = 0;
  let totalTruthObligationsActedOn = 0;
  let totalAttachmentConcerns = 0;
  let totalReferrals = 0;
  let totalReferralsFollowed = 0;
  let totalValuesConflicts = 0;
  let totalManipulationRisks = 0;
  let totalAlignmentScore = 0;
  let alignmentCount = 0;

  for (const metrics of userMetrics.values()) {
    totalTruthObligations += metrics.truthObligationsDetected;
    totalTruthObligationsActedOn += metrics.truthObligationsActedOn;
    totalAttachmentConcerns += metrics.attachmentConcernsFlagged;
    totalReferrals += metrics.humanReferralsSuggested;
    totalReferralsFollowed += metrics.humanReferralsFollowed;
    totalValuesConflicts += metrics.valuesConflictsSurfaced;
    totalManipulationRisks += metrics.manipulationRisksCaught;
    if (metrics.averageAlignmentScore > 0) {
      totalAlignmentScore += metrics.averageAlignmentScore;
      alignmentCount++;
    }
  }

  return {
    totalTruthObligations,
    totalTruthObligationsActedOn,
    truthActionRate:
      totalTruthObligations > 0 ? totalTruthObligationsActedOn / totalTruthObligations : 1.0,
    totalAttachmentConcerns,
    totalReferrals,
    referralFollowRate: totalReferrals > 0 ? totalReferralsFollowed / totalReferrals : 0,
    totalValuesConflicts,
    totalManipulationRisks,
    averageAlignmentScore: alignmentCount > 0 ? totalAlignmentScore / alignmentCount : 1.0,
    activeUsers: userMetrics.size,
  };
}

/**
 * Get recent events (for debugging/dashboards)
 */
export function getRecentEvents(
  limit = 100,
  filters?: {
    type?: string;
    userId?: string;
    actedOn?: boolean;
  }
): MetricsEntry[] {
  let events = [...metricsBuffer].sort((a, b) => b.timestamp - a.timestamp);

  if (filters) {
    if (filters.type) {
      events = events.filter((e) => e.type === filters.type);
    }
    if (filters.userId) {
      events = events.filter((e) => e.userId === filters.userId);
    }
    if (filters.actedOn !== undefined) {
      events = events.filter((e) => e.actedOn === filters.actedOn);
    }
  }

  return events.slice(0, limit);
}

/**
 * Get events by type with counts
 */
export function getEventBreakdown(): Record<
  string,
  {
    total: number;
    actedOn: number;
    rate: number;
  }
> {
  const breakdown: Record<string, { total: number; actedOn: number; rate: number }> = {};

  for (const event of metricsBuffer) {
    if (!breakdown[event.type]) {
      breakdown[event.type] = { total: 0, actedOn: 0, rate: 0 };
    }
    breakdown[event.type].total++;
    if (event.actedOn) {
      breakdown[event.type].actedOn++;
    }
  }

  // Calculate rates
  for (const key of Object.keys(breakdown)) {
    breakdown[key].rate =
      breakdown[key].total > 0 ? breakdown[key].actedOn / breakdown[key].total : 0;
  }

  return breakdown;
}

/**
 * Get health check for principal alignment system
 */
export function getHealthCheck(): {
  healthy: boolean;
  issues: string[];
  metrics: {
    truthActionRate: number;
    referralFollowRate: number;
    averageAlignmentScore: number;
    manipulationRiskRate: number;
  };
} {
  const aggregate = getAggregateMetrics();
  const issues: string[] = [];

  // Check for concerning patterns
  if (aggregate.truthActionRate < 0.5 && aggregate.totalTruthObligations > 10) {
    issues.push(`Low truth action rate: ${(aggregate.truthActionRate * 100).toFixed(1)}%`);
  }

  if (aggregate.referralFollowRate < 0.2 && aggregate.totalReferrals > 5) {
    issues.push(`Low referral follow-through: ${(aggregate.referralFollowRate * 100).toFixed(1)}%`);
  }

  if (aggregate.averageAlignmentScore < 0.7) {
    issues.push(`Low average alignment score: ${aggregate.averageAlignmentScore.toFixed(2)}`);
  }

  const manipulationRiskRate =
    metricsBuffer.length > 0
      ? metricsBuffer.filter((e) => e.type === 'manipulation_risk').length / metricsBuffer.length
      : 0;

  if (manipulationRiskRate > 0.1) {
    issues.push(`High manipulation risk rate: ${(manipulationRiskRate * 100).toFixed(1)}%`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    metrics: {
      truthActionRate: aggregate.truthActionRate,
      referralFollowRate: aggregate.referralFollowRate,
      averageAlignmentScore: aggregate.averageAlignmentScore,
      manipulationRiskRate,
    },
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getUserMetricsInternal(userId: string): PrincipalAlignmentMetrics {
  let metrics = userMetrics.get(userId);
  if (!metrics) {
    metrics = {
      userId,
      truthObligationsDetected: 0,
      truthObligationsActedOn: 0,
      attachmentConcernsFlagged: 0,
      humanReferralsSuggested: 0,
      humanReferralsFollowed: 0,
      valuesConflictsSurfaced: 0,
      manipulationRisksCaught: 0,
      averageAlignmentScore: 1.0,
      lastUpdated: Date.now(),
    };
    userMetrics.set(userId, metrics);
  }
  return metrics;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear metrics buffer (keep user metrics)
 */
export function clearMetricsBuffer(): void {
  metricsBuffer.length = 0;
}

/**
 * Clear all metrics
 */
export function clearAllMetrics(): void {
  metricsBuffer.length = 0;
  userMetrics.clear();
}

/**
 * Clear metrics for a specific user
 */
export function clearUserMetrics(userId: string): void {
  userMetrics.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { MetricsEntry };
