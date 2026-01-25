/**
 * FTIS Gradual Rollout Manager
 *
 * Manages the gradual rollout of FTIS-only mode using the existing
 * A/B testing infrastructure. Provides percentage-based traffic splitting,
 * automatic rollback on degradation, and metrics tracking.
 *
 * Usage:
 *   // Enable for 10% of traffic
 *   await setFTISRolloutPercentage(10);
 *
 *   // Check if current session should use FTIS-only
 *   const useFTIS = shouldUseFTISOnly(userId, sessionId);
 *
 *   // Monitor rollout health
 *   const health = getFTISRolloutHealth();
 *
 * @module tools/intelligence/learning/routing-rollout
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getAccuracyMetrics } from '../tool-safety.js';

const log = createLogger({ module: 'routing-rollout' });

// ============================================================================
// TYPES
// ============================================================================

export interface RolloutConfig {
  /** Percentage of traffic using FTIS-only (0-100) */
  percentage: number;
  /** Minimum accuracy before auto-rollback */
  minAccuracy: number;
  /** Minimum sample size before evaluating accuracy */
  minSampleSize: number;
  /** Whether auto-rollback is enabled */
  autoRollback: boolean;
  /** List of user IDs that always use FTIS (for testing) */
  alwaysFTISUsers: string[];
  /** List of user IDs that never use FTIS */
  neverFTISUsers: string[];
}

export interface RolloutState {
  /** Current rollout percentage */
  percentage: number;
  /** Whether rollout is paused due to issues */
  isPaused: boolean;
  /** Reason for pause (if paused) */
  pauseReason?: string;
  /** When the current percentage was set */
  percentageSetAt: Date;
  /** History of percentage changes */
  history: Array<{
    percentage: number;
    setAt: Date;
    reason: string;
  }>;
}

export interface RolloutHealth {
  /** Overall health status */
  status: 'healthy' | 'warning' | 'critical';
  /** Current rollout percentage */
  percentage: number;
  /** Whether rollout is paused */
  isPaused: boolean;
  /** Current accuracy in FTIS cohort */
  ftisAccuracy: number;
  /** Sample size in FTIS cohort */
  ftisSampleSize: number;
  /** Recommendations */
  recommendations: string[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: RolloutConfig = {
  percentage: 0,
  minAccuracy: 0.85, // Rollback if accuracy drops below 85%
  minSampleSize: 100, // Need 100 samples before evaluating
  autoRollback: true,
  alwaysFTISUsers: [],
  neverFTISUsers: [],
};

// ============================================================================
// STATE
// ============================================================================

let rolloutConfig: RolloutConfig = { ...DEFAULT_CONFIG };
let rolloutState: RolloutState = {
  percentage: 0,
  isPaused: false,
  percentageSetAt: new Date(),
  history: [],
};

// Cohort tracking
const userCohorts = new Map<string, 'ftis' | 'legacy'>();

// ============================================================================
// ROLLOUT MANAGEMENT
// ============================================================================

/**
 * Set the FTIS rollout percentage.
 *
 * @param percentage - Percentage of traffic to route to FTIS-only (0-100)
 * @param reason - Reason for the change (for audit log)
 */
export function setFTISRolloutPercentage(
  percentage: number,
  reason: string = 'Manual adjustment'
): void {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  log.info(
    {
      previousPercentage: rolloutState.percentage,
      newPercentage: clampedPercentage,
      reason,
    },
    '📊 FTIS rollout percentage changed'
  );

  rolloutState.history.push({
    percentage: rolloutState.percentage,
    setAt: rolloutState.percentageSetAt,
    reason: `Changed to ${clampedPercentage}%: ${reason}`,
  });

  rolloutState.percentage = clampedPercentage;
  rolloutState.percentageSetAt = new Date();
  rolloutConfig.percentage = clampedPercentage;

  // Unpause if we're setting a new percentage
  if (rolloutState.isPaused) {
    rolloutState.isPaused = false;
    rolloutState.pauseReason = undefined;
    log.info('🔄 Rollout unpaused due to percentage change');
  }
}

/**
 * Pause the FTIS rollout (all traffic goes to legacy).
 */
export function pauseFTISRollout(reason: string): void {
  log.warn({ reason }, '⏸️ FTIS rollout PAUSED');

  rolloutState.isPaused = true;
  rolloutState.pauseReason = reason;

  rolloutState.history.push({
    percentage: rolloutState.percentage,
    setAt: new Date(),
    reason: `PAUSED: ${reason}`,
  });
}

/**
 * Resume the FTIS rollout.
 */
export function resumeFTISRollout(): void {
  log.info('▶️ FTIS rollout resumed');

  rolloutState.isPaused = false;
  rolloutState.pauseReason = undefined;

  rolloutState.history.push({
    percentage: rolloutState.percentage,
    setAt: new Date(),
    reason: 'Resumed',
  });
}

// ============================================================================
// COHORT ASSIGNMENT
// ============================================================================

/**
 * Determine if a session should use FTIS-only mode.
 *
 * Uses consistent hashing so the same user always gets the same experience
 * during a rollout period.
 *
 * @param userId - User ID
 * @param sessionId - Session ID (optional, for additional entropy)
 * @returns Whether to use FTIS-only mode
 */
export function shouldUseFTISOnly(userId: string, sessionId?: string): boolean {
  // If paused, never use FTIS
  if (rolloutState.isPaused) {
    return false;
  }

  // Check overrides
  if (rolloutConfig.alwaysFTISUsers.includes(userId)) {
    userCohorts.set(userId, 'ftis');
    return true;
  }

  if (rolloutConfig.neverFTISUsers.includes(userId)) {
    userCohorts.set(userId, 'legacy');
    return false;
  }

  // If 0%, no one uses FTIS
  if (rolloutState.percentage === 0) {
    userCohorts.set(userId, 'legacy');
    return false;
  }

  // If 100%, everyone uses FTIS
  if (rolloutState.percentage === 100) {
    userCohorts.set(userId, 'ftis');
    return true;
  }

  // Consistent hash for user
  const hash = simpleHash(userId + (sessionId || ''));
  const bucket = hash % 100;

  const useFTIS = bucket < rolloutState.percentage;
  userCohorts.set(userId, useFTIS ? 'ftis' : 'legacy');

  return useFTIS;
}

/**
 * Get the cohort for a user (for metrics).
 */
export function getUserCohort(userId: string): 'ftis' | 'legacy' | 'unknown' {
  return userCohorts.get(userId) || 'unknown';
}

// ============================================================================
// AUTO-ROLLBACK
// ============================================================================

/**
 * Check if auto-rollback should trigger.
 *
 * Called periodically to monitor FTIS health and auto-pause if degraded.
 */
export function checkAutoRollback(): boolean {
  if (!rolloutConfig.autoRollback) {
    return false;
  }

  if (rolloutState.isPaused) {
    return false;
  }

  if (rolloutState.percentage === 0) {
    return false;
  }

  const metrics = getAccuracyMetrics();

  // Need enough samples
  if (metrics.totalDecisions < rolloutConfig.minSampleSize) {
    return false;
  }

  // Check accuracy
  if (metrics.accuracy < rolloutConfig.minAccuracy) {
    log.error(
      {
        accuracy: metrics.accuracy,
        minAccuracy: rolloutConfig.minAccuracy,
        totalDecisions: metrics.totalDecisions,
      },
      '🚨 AUTO-ROLLBACK: FTIS accuracy below threshold'
    );

    pauseFTISRollout(
      `Accuracy (${(metrics.accuracy * 100).toFixed(1)}%) below threshold (${rolloutConfig.minAccuracy * 100}%)`
    );

    return true;
  }

  return false;
}

// ============================================================================
// HEALTH & MONITORING
// ============================================================================

/**
 * Get FTIS rollout health status.
 */
export function getFTISRolloutHealth(): RolloutHealth {
  const metrics = getAccuracyMetrics();
  const recommendations: string[] = [];

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';

  // Check if paused
  if (rolloutState.isPaused) {
    status = 'critical';
    recommendations.push(`Rollout paused: ${rolloutState.pauseReason}`);
  }

  // Check accuracy
  if (metrics.totalDecisions >= rolloutConfig.minSampleSize) {
    if (metrics.accuracy < rolloutConfig.minAccuracy) {
      status = 'critical';
      recommendations.push(
        `Accuracy (${(metrics.accuracy * 100).toFixed(1)}%) is below threshold. Consider reducing rollout percentage.`
      );
    } else if (metrics.accuracy < rolloutConfig.minAccuracy + 0.05) {
      status = status === 'healthy' ? 'warning' : status;
      recommendations.push(
        `Accuracy (${(metrics.accuracy * 100).toFixed(1)}%) is approaching threshold. Monitor closely.`
      );
    }
  } else {
    recommendations.push(
      `Insufficient samples (${metrics.totalDecisions}/${rolloutConfig.minSampleSize}) for accuracy evaluation.`
    );
  }

  // Suggest next steps
  if (status === 'healthy' && rolloutState.percentage < 100) {
    if (metrics.totalDecisions >= rolloutConfig.minSampleSize * 2) {
      recommendations.push(
        `Metrics are healthy with ${metrics.totalDecisions} samples. Consider increasing rollout percentage.`
      );
    }
  }

  return {
    status,
    percentage: rolloutState.percentage,
    isPaused: rolloutState.isPaused,
    ftisAccuracy: metrics.accuracy,
    ftisSampleSize: metrics.totalDecisions,
    recommendations,
  };
}

/**
 * Get current rollout state.
 */
export function getRolloutState(): RolloutState {
  return { ...rolloutState };
}

/**
 * Get current rollout config.
 */
export function getRolloutConfig(): RolloutConfig {
  return { ...rolloutConfig };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Update rollout configuration.
 */
export function updateRolloutConfig(config: Partial<RolloutConfig>): void {
  rolloutConfig = { ...rolloutConfig, ...config };
  log.info({ config: rolloutConfig }, 'Rollout config updated');
}

/**
 * Add a user to always use FTIS (for testing).
 */
export function addAlwaysFTISUser(userId: string): void {
  if (!rolloutConfig.alwaysFTISUsers.includes(userId)) {
    rolloutConfig.alwaysFTISUsers.push(userId);
  }
}

/**
 * Add a user to never use FTIS (for testing).
 */
export function addNeverFTISUser(userId: string): void {
  if (!rolloutConfig.neverFTISUsers.includes(userId)) {
    rolloutConfig.neverFTISUsers.push(userId);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Simple hash function for consistent cohort assignment.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize FTIS rollout from environment variables.
 */
export function initializeFTISRollout(): void {
  const envPercentage = process.env.FTIS_ROLLOUT_PERCENTAGE;
  if (envPercentage) {
    const percentage = parseInt(envPercentage, 10);
    if (!isNaN(percentage)) {
      setFTISRolloutPercentage(percentage, 'Initialized from environment');
    }
  }

  const envMinAccuracy = process.env.FTIS_ROLLOUT_MIN_ACCURACY;
  if (envMinAccuracy) {
    const minAccuracy = parseFloat(envMinAccuracy);
    if (!isNaN(minAccuracy)) {
      rolloutConfig.minAccuracy = minAccuracy;
    }
  }

  const envAutoRollback = process.env.FTIS_AUTO_ROLLBACK;
  if (envAutoRollback === 'false') {
    rolloutConfig.autoRollback = false;
  }

  log.info(
    {
      percentage: rolloutState.percentage,
      minAccuracy: rolloutConfig.minAccuracy,
      autoRollback: rolloutConfig.autoRollback,
    },
    '🚀 FTIS rollout initialized'
  );
}

// ============================================================================
// RESET (for testing)
// ============================================================================

export function resetRollout(): void {
  rolloutConfig = { ...DEFAULT_CONFIG };
  rolloutState = {
    percentage: 0,
    isPaused: false,
    percentageSetAt: new Date(),
    history: [],
  };
  userCohorts.clear();
}
