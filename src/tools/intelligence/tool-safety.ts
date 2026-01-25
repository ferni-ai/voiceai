/**
 * FTIS Safety Net
 *
 * Provides graceful degradation and safety mechanisms for FTIS:
 * - Timeout fallback: If FTIS takes too long, fall back gracefully
 * - Confidence floor: Below threshold, ask clarifying question
 * - Accuracy monitoring: Track accuracy and alert on drops
 * - Emergency rollback: FTIS_ONLY_MODE=false re-enables JSON workaround
 *
 * @module tools/intelligence/tool-safety
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FTISSafety' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Safety configuration
 */
export interface FTISSafetyConfig {
  /** Maximum time to wait for FTIS routing (ms) */
  routingTimeoutMs: number;
  /** Minimum confidence to execute a tool */
  confidenceFloor: number;
  /** Accuracy threshold for alerts */
  accuracyAlertThreshold: number;
  /** Whether FTIS-only mode is enabled */
  ftisOnlyMode: boolean;
}

const DEFAULT_CONFIG: FTISSafetyConfig = {
  routingTimeoutMs: 200, // 200ms max for routing decision
  confidenceFloor: 0.5, // Below 50% confidence, ask clarifying question
  accuracyAlertThreshold: 0.9, // Alert if accuracy drops below 90%
  ftisOnlyMode: process.env.FTIS_ONLY_MODE === 'true',
};

// ============================================================================
// TYPES
// ============================================================================

export interface SafetyCheckResult {
  /** Whether it's safe to proceed */
  safe: boolean;
  /** Reason for the decision */
  reason: string;
  /** Suggested action if not safe */
  suggestedAction?: 'ask_clarification' | 'fallback_to_gemini' | 'retry';
  /** Clarifying question to ask (if action is ask_clarification) */
  clarifyingQuestion?: string;
}

export interface AccuracyMetrics {
  /** Total routing decisions */
  totalDecisions: number;
  /** Successful tool executions */
  successfulExecutions: number;
  /** Failed tool executions */
  failedExecutions: number;
  /** User corrections */
  userCorrections: number;
  /** Calculated accuracy (0-1) */
  accuracy: number;
  /** Time period */
  periodStart: Date;
  /** Is accuracy below threshold */
  isAlertState: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let metricsState: AccuracyMetrics = {
  totalDecisions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  userCorrections: 0,
  accuracy: 1.0,
  periodStart: new Date(),
  isAlertState: false,
};

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

/**
 * Execute FTIS routing with timeout fallback.
 *
 * If FTIS takes longer than the timeout, returns a fallback result
 * that triggers a clarifying question instead of incorrect tool execution.
 *
 * @param routingPromise - Promise from FTIS routing
 * @param config - Safety configuration
 * @returns Routing result or fallback
 */
export async function withTimeout<T>(
  routingPromise: Promise<T>,
  config: FTISSafetyConfig = DEFAULT_CONFIG
): Promise<{ result: T | null; timedOut: boolean }> {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), config.routingTimeoutMs)
  );

  const result = await Promise.race([
    routingPromise.then((r) => ({ result: r, timedOut: false })),
    timeoutPromise.then(() => ({ result: null, timedOut: true })),
  ]);

  if (result.timedOut) {
    log.warn({ timeoutMs: config.routingTimeoutMs }, '⏱️ FTIS routing timed out - using fallback');
  }

  return result;
}

// ============================================================================
// CONFIDENCE CHECK
// ============================================================================

/**
 * Check if confidence is high enough to proceed with tool execution.
 *
 * Below the confidence floor, we should ask a clarifying question
 * instead of potentially executing the wrong tool.
 *
 * @param confidence - FTIS confidence score (0-1)
 * @param query - Original user query
 * @param config - Safety configuration
 * @returns Safety check result
 */
export function checkConfidence(
  confidence: number,
  query: string,
  config: FTISSafetyConfig = DEFAULT_CONFIG
): SafetyCheckResult {
  if (confidence >= config.confidenceFloor) {
    return {
      safe: true,
      reason: `Confidence ${Math.round(confidence * 100)}% meets threshold`,
    };
  }

  // Generate a clarifying question based on the query
  const clarifyingQuestion = generateClarifyingQuestion(query, confidence);

  log.info(
    {
      confidence: Math.round(confidence * 100),
      threshold: Math.round(config.confidenceFloor * 100),
      query: query.substring(0, 50),
    },
    '🤔 Low confidence - suggesting clarification'
  );

  return {
    safe: false,
    reason: `Confidence ${Math.round(confidence * 100)}% below threshold ${Math.round(config.confidenceFloor * 100)}%`,
    suggestedAction: 'ask_clarification',
    clarifyingQuestion,
  };
}

/**
 * Generate a natural clarifying question based on the query.
 */
function generateClarifyingQuestion(query: string, confidence: number): string {
  const queryLower = query.toLowerCase();

  // Context-specific clarifications
  if (queryLower.includes('that') || queryLower.includes('it')) {
    return 'I want to make sure I understand - what specifically are you referring to?';
  }

  if (queryLower.includes('help') && queryLower.length < 20) {
    return "I'd love to help! What specifically can I assist you with?";
  }

  if (queryLower.includes('can you')) {
    return "I can do a lot of things! Could you tell me more about what you're looking for?";
  }

  // Default clarification
  return 'I want to make sure I help you with the right thing. Could you tell me a bit more?';
}

// ============================================================================
// ACCURACY MONITORING
// ============================================================================

/**
 * Record a routing outcome for accuracy tracking.
 *
 * @param success - Whether the tool execution was successful
 * @param wasCorrection - Whether the user corrected the tool selection
 */
export function recordOutcome(success: boolean, wasCorrection: boolean = false): void {
  metricsState.totalDecisions++;

  if (success) {
    metricsState.successfulExecutions++;
  } else {
    metricsState.failedExecutions++;
  }

  if (wasCorrection) {
    metricsState.userCorrections++;
  }

  // Recalculate accuracy
  if (metricsState.totalDecisions > 0) {
    metricsState.accuracy = metricsState.successfulExecutions / metricsState.totalDecisions;
  }

  // Check alert state
  const wasAlertState = metricsState.isAlertState;
  metricsState.isAlertState = metricsState.accuracy < DEFAULT_CONFIG.accuracyAlertThreshold;

  // Log if entering alert state
  if (metricsState.isAlertState && !wasAlertState) {
    log.error(
      {
        accuracy: Math.round(metricsState.accuracy * 100),
        threshold: Math.round(DEFAULT_CONFIG.accuracyAlertThreshold * 100),
        totalDecisions: metricsState.totalDecisions,
        failures: metricsState.failedExecutions,
      },
      '🚨 FTIS accuracy dropped below threshold!'
    );
  }
}

/**
 * Get current accuracy metrics.
 */
export function getAccuracyMetrics(): AccuracyMetrics {
  return { ...metricsState };
}

/**
 * Reset accuracy metrics (e.g., for new time period).
 */
export function resetAccuracyMetrics(): void {
  metricsState = {
    totalDecisions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    userCorrections: 0,
    accuracy: 1.0,
    periodStart: new Date(),
    isAlertState: false,
  };
}

// ============================================================================
// EMERGENCY ROLLBACK
// ============================================================================

/**
 * Check if FTIS-only mode is enabled.
 *
 * Set FTIS_ONLY_MODE=false to re-enable the JSON workaround
 * as an emergency rollback.
 */
export function isFTISOnlyModeEnabled(): boolean {
  return process.env.FTIS_ONLY_MODE === 'true';
}

/**
 * Get safety configuration from environment.
 */
export function getSafetyConfig(): FTISSafetyConfig {
  return {
    routingTimeoutMs: parseInt(process.env.FTIS_ROUTING_TIMEOUT_MS || '200', 10),
    confidenceFloor: parseFloat(process.env.FTIS_CONFIDENCE_FLOOR || '0.50'),
    accuracyAlertThreshold: parseFloat(process.env.FTIS_ACCURACY_ALERT || '0.90'),
    ftisOnlyMode: process.env.FTIS_ONLY_MODE === 'true',
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Get FTIS safety health status.
 *
 * Returns a summary of safety metrics for monitoring dashboards.
 */
export function getHealthStatus(): {
  status: 'healthy' | 'degraded' | 'critical';
  metrics: AccuracyMetrics;
  config: FTISSafetyConfig;
  recommendations: string[];
} {
  const metrics = getAccuracyMetrics();
  const config = getSafetyConfig();
  const recommendations: string[] = [];

  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

  // Check accuracy
  if (metrics.isAlertState) {
    status = 'critical';
    recommendations.push(
      `Accuracy (${Math.round(metrics.accuracy * 100)}%) below threshold. ` +
        `Consider setting FTIS_ONLY_MODE=false to re-enable JSON workaround.`
    );
  } else if (metrics.accuracy < 0.95 && metrics.totalDecisions > 100) {
    status = 'degraded';
    recommendations.push(
      `Accuracy (${Math.round(metrics.accuracy * 100)}%) is below optimal. ` +
        `Review routing patterns and consider model retraining.`
    );
  }

  // Check user corrections
  if (metrics.userCorrections > metrics.totalDecisions * 0.1) {
    status = status === 'healthy' ? 'degraded' : status;
    recommendations.push(
      `High correction rate (${Math.round((metrics.userCorrections / metrics.totalDecisions) * 100)}%). ` +
        `Users are frequently correcting tool selections.`
    );
  }

  // Mode recommendation
  if (!config.ftisOnlyMode && metrics.accuracy > 0.98 && metrics.totalDecisions > 1000) {
    recommendations.push(
      `Accuracy is high (${Math.round(metrics.accuracy * 100)}%). ` +
        `Consider enabling FTIS_ONLY_MODE=true for better performance.`
    );
  }

  return {
    status,
    metrics,
    config,
    recommendations,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DEFAULT_CONFIG };
