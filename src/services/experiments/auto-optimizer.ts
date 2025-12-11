/**
 * Auto-Optimizer Service
 *
 * AI-driven experiment optimization that:
 * 1. Monitors running experiments for statistical significance
 * 2. Auto-graduates winners when confidence thresholds are met
 * 3. Ships winning variants as new defaults
 * 4. Generates alerts and follow-up experiments
 *
 * Better than human: We never sleep on optimization opportunities.
 *
 * @module services/experiments/auto-optimizer
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  analyzeExperiment,
  completeWebExperiment,
  getRunningWebExperiments,
  type ExperimentAnalysis,
  type WebExperiment,
} from './web-experiments.js';

const log = createLogger({ module: 'AutoOptimizer' });

// ============================================================================
// TYPES
// ============================================================================

export interface AutoOptimizerConfig {
  // Significance thresholds
  minimumConfidence: number; // Default: 95%
  minimumSamples: number; // Default: 1000
  minimumDurationDays: number; // Default: 7 days (avoid novelty effects)

  // Safety rails
  maxLift: number; // Flag if >200% lift (likely bug)
  minConversionRate: number; // Flag if <0.1% (tracking issue)
  srmThreshold: number; // Sample ratio mismatch threshold

  // Actions
  autoShip: boolean; // Actually apply winner as default
  notifyOnWinner: boolean; // Send notifications
  createFollowUp: boolean; // Auto-create next experiment

  // Notification config
  slackWebhook?: string;
  notificationEmail?: string;
}

export interface WinnerDecision {
  hasWinner: boolean;
  winnerId: string | null;
  confidence: number;
  lift: number;
  recommendation: 'ship' | 'continue' | 'stop' | 'investigate' | 'wait_duration';
  reasoning: string;
  alerts: OptimizerAlert[];
}

export interface OptimizerAlert {
  type:
    | 'winner_detected'
    | 'anomaly'
    | 'stalled'
    | 'srm_detected'
    | 'low_conversion'
    | 'high_lift'
    | 'hypothesis_ready';
  severity: 'info' | 'warning' | 'critical';
  experimentId: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface OptimizationResult {
  experimentId: string;
  action: 'shipped' | 'continued' | 'stopped' | 'flagged';
  decision: WinnerDecision;
  analysis: ExperimentAnalysis;
}

export interface OptimizerStatus {
  isRunning: boolean;
  lastRun: Date | null;
  experimentsChecked: number;
  winnersShipped: number;
  pendingReview: string[];
  alerts: OptimizerAlert[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: AutoOptimizerConfig = {
  minimumConfidence: 95,
  minimumSamples: 1000,
  minimumDurationDays: 7,
  maxLift: 200,
  minConversionRate: 0.001, // 0.1%
  srmThreshold: 0.01, // 1% deviation
  autoShip: true,
  notifyOnWinner: true,
  createFollowUp: false,
};

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

let lastRunTimestamp: Date | null = null;
let isCurrentlyRunning = false;
const recentAlerts: OptimizerAlert[] = [];
const MAX_ALERTS = 100;

// ============================================================================
// CORE OPTIMIZATION LOOP
// ============================================================================

/**
 * Run the optimization loop for all running experiments
 */
export async function runOptimizationLoop(
  config: Partial<AutoOptimizerConfig> = {}
): Promise<OptimizationResult[]> {
  if (isCurrentlyRunning) {
    log.warn('Optimization loop already running, skipping');
    return [];
  }

  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  isCurrentlyRunning = true;
  const results: OptimizationResult[] = [];

  try {
    log.info('Starting optimization loop');

    // Get all running experiments
    const experiments = await getRunningWebExperiments();
    log.info({ experimentCount: experiments.length }, 'Found running experiments');

    for (const experiment of experiments) {
      try {
        const result = await optimizeExperiment(experiment, fullConfig);
        results.push(result);
      } catch (error) {
        log.error({ error, experimentId: experiment.id }, 'Failed to optimize experiment');
        addAlert({
          type: 'anomaly',
          severity: 'warning',
          experimentId: experiment.id,
          message: `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
        });
      }
    }

    lastRunTimestamp = new Date();

    // Log summary
    const shipped = results.filter((r) => r.action === 'shipped').length;
    const flagged = results.filter((r) => r.action === 'flagged').length;
    log.info(
      {
        total: results.length,
        shipped,
        flagged,
        continued: results.length - shipped - flagged,
      },
      'Optimization loop complete'
    );

    return results;
  } finally {
    isCurrentlyRunning = false;
  }
}

/**
 * Optimize a single experiment
 */
async function optimizeExperiment(
  experiment: WebExperiment,
  config: AutoOptimizerConfig
): Promise<OptimizationResult> {
  // Get current analysis
  const analysis = await analyzeExperiment(experiment.id);
  if (!analysis) {
    throw new Error(`Failed to analyze experiment ${experiment.id}`);
  }

  // Make decision
  const decision = detectWinner(experiment, analysis, config);

  // Take action based on decision
  let action: OptimizationResult['action'];

  switch (decision.recommendation) {
    case 'ship':
      if (config.autoShip && decision.winnerId) {
        await shipWinner(experiment.id, decision.winnerId, analysis.confidence);
        action = 'shipped';
      } else {
        // Mark for manual review
        await markForReview(experiment.id, decision);
        action = 'flagged';
      }
      break;

    case 'investigate':
    case 'stop':
      await markForReview(experiment.id, decision);
      action = 'flagged';
      break;

    case 'continue':
    case 'wait_duration':
    default:
      action = 'continued';
      break;
  }

  // Store alerts
  for (const alert of decision.alerts) {
    addAlert(alert);
  }

  // Log decision
  log.info(
    {
      experimentId: experiment.id,
      action,
      recommendation: decision.recommendation,
      confidence: decision.confidence,
      lift: decision.lift,
    },
    'Experiment optimization decision'
  );

  return {
    experimentId: experiment.id,
    action,
    decision,
    analysis,
  };
}

// ============================================================================
// WINNER DETECTION
// ============================================================================

/**
 * Analyze an experiment and determine if there's a winner
 */
function detectWinner(
  experiment: WebExperiment,
  analysis: ExperimentAnalysis,
  config: AutoOptimizerConfig
): WinnerDecision {
  const alerts: OptimizerAlert[] = [];
  const now = new Date();

  // Check experiment duration
  const startedAt = experiment.startedAt || experiment.createdAt;
  const daysRunning = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysRunning < config.minimumDurationDays) {
    return {
      hasWinner: false,
      winnerId: null,
      confidence: analysis.confidence,
      lift: 0,
      recommendation: 'wait_duration',
      reasoning: `Experiment has only run ${daysRunning.toFixed(1)} days. Minimum is ${config.minimumDurationDays} days to avoid novelty effects.`,
      alerts,
    };
  }

  // Check for Sample Ratio Mismatch (SRM)
  const srmCheck = checkSampleRatioMismatch(experiment, analysis, config.srmThreshold);
  if (srmCheck.hasSRM) {
    alerts.push({
      type: 'srm_detected',
      severity: 'critical',
      experimentId: experiment.id,
      message: `Sample Ratio Mismatch detected: ${srmCheck.details}`,
      data: srmCheck,
      timestamp: now,
    });

    return {
      hasWinner: false,
      winnerId: null,
      confidence: analysis.confidence,
      lift: 0,
      recommendation: 'investigate',
      reasoning: `SRM detected - data integrity issue. ${srmCheck.details}`,
      alerts,
    };
  }

  // Check minimum samples
  if (analysis.sampleSize < config.minimumSamples) {
    return {
      hasWinner: false,
      winnerId: null,
      confidence: analysis.confidence,
      lift: 0,
      recommendation: 'continue',
      reasoning: `Need more samples: ${analysis.sampleSize.toLocaleString()} / ${config.minimumSamples.toLocaleString()} minimum.`,
      alerts,
    };
  }

  // Check for anomalous conversion rates
  const controlVariant = analysis.variants.find((v) => v.id === 'control') || analysis.variants[0];
  if (controlVariant && controlVariant.conversionRate < config.minConversionRate) {
    alerts.push({
      type: 'low_conversion',
      severity: 'warning',
      experimentId: experiment.id,
      message: `Very low conversion rate: ${(controlVariant.conversionRate * 100).toFixed(3)}%`,
      data: { rate: controlVariant.conversionRate },
      timestamp: now,
    });

    return {
      hasWinner: false,
      winnerId: null,
      confidence: analysis.confidence,
      lift: 0,
      recommendation: 'investigate',
      reasoning: `Conversion rate (${(controlVariant.conversionRate * 100).toFixed(3)}%) is below minimum threshold. Possible tracking issue.`,
      alerts,
    };
  }

  // Check statistical significance
  if (analysis.confidence < config.minimumConfidence) {
    return {
      hasWinner: false,
      winnerId: null,
      confidence: analysis.confidence,
      lift: 0,
      recommendation: 'continue',
      reasoning: `Not yet significant: ${analysis.confidence}% confidence (need ${config.minimumConfidence}%).`,
      alerts,
    };
  }

  // We have a winner - but check for anomalous lift
  const winnerVariant = analysis.variants.find((v) => v.id === analysis.winner);
  const lift = winnerVariant?.improvement || 0;

  if (Math.abs(lift) > config.maxLift) {
    alerts.push({
      type: 'high_lift',
      severity: 'warning',
      experimentId: experiment.id,
      message: `Unusually high lift detected: ${lift.toFixed(1)}%`,
      data: { lift },
      timestamp: now,
    });

    return {
      hasWinner: true,
      winnerId: analysis.winner,
      confidence: analysis.confidence,
      lift,
      recommendation: 'investigate',
      reasoning: `Winner detected but lift (${lift.toFixed(1)}%) exceeds ${config.maxLift}% threshold. Manual review recommended.`,
      alerts,
    };
  }

  // Winner is valid - ship it!
  alerts.push({
    type: 'winner_detected',
    severity: 'info',
    experimentId: experiment.id,
    message: `Winner: ${analysis.winner} with ${lift.toFixed(1)}% lift at ${analysis.confidence}% confidence`,
    data: { winnerId: analysis.winner, lift, confidence: analysis.confidence },
    timestamp: now,
  });

  return {
    hasWinner: true,
    winnerId: analysis.winner,
    confidence: analysis.confidence,
    lift,
    recommendation: 'ship',
    reasoning: `Winner detected: ${analysis.winner} shows ${lift.toFixed(1)}% lift with ${analysis.confidence}% confidence. Ready to ship.`,
    alerts,
  };
}

/**
 * Check for Sample Ratio Mismatch
 */
function checkSampleRatioMismatch(
  experiment: WebExperiment,
  analysis: ExperimentAnalysis,
  threshold: number
): {
  hasSRM: boolean;
  details: string;
  expectedRatios: Record<string, number>;
  actualRatios: Record<string, number>;
} {
  const totalSamples = analysis.sampleSize;
  if (totalSamples === 0) {
    return { hasSRM: false, details: 'No samples yet', expectedRatios: {}, actualRatios: {} };
  }

  const expectedRatios: Record<string, number> = {};
  const actualRatios: Record<string, number> = {};

  let maxDeviation = 0;
  let deviationDetails = '';

  for (const variant of experiment.variants) {
    const expected = variant.weight / 100;
    expectedRatios[variant.id] = expected;

    const analysisVariant = analysis.variants.find((v) => v.id === variant.id);
    const actual = analysisVariant ? analysisVariant.exposures / totalSamples : 0;
    actualRatios[variant.id] = actual;

    const deviation = Math.abs(actual - expected);
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      deviationDetails = `${variant.id}: expected ${(expected * 100).toFixed(1)}%, got ${(actual * 100).toFixed(1)}%`;
    }
  }

  return {
    hasSRM: maxDeviation > threshold,
    details: deviationDetails,
    expectedRatios,
    actualRatios,
  };
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Ship a winning variant as the new default
 */
async function shipWinner(
  experimentId: string,
  winnerId: string,
  confidence: number
): Promise<void> {
  log.info({ experimentId, winnerId, confidence }, 'Shipping winner');

  // 1. Complete the experiment
  await completeWebExperiment(experimentId, winnerId, confidence);

  // 2. Log the shipment
  const db = getFirestore();
  await db.collection('experiment_shipments').add({
    experimentId,
    winnerId,
    confidence,
    shippedAt: FieldValue.serverTimestamp(),
    shippedBy: 'auto-optimizer',
  });

  // 3. Update variant library (so future experiments use winner as baseline)
  await updateVariantLibraryDefault(experimentId, winnerId);

  log.info({ experimentId, winnerId }, 'Winner shipped successfully');
}

/**
 * Mark an experiment for manual review
 */
async function markForReview(experimentId: string, decision: WinnerDecision): Promise<void> {
  const db = getFirestore();
  await db.collection('web_experiments').doc(experimentId).update({
    needsReview: true,
    reviewReason: decision.reasoning,
    reviewRecommendation: decision.recommendation,
    reviewRequestedAt: FieldValue.serverTimestamp(),
  });

  log.info({ experimentId, reason: decision.reasoning }, 'Experiment marked for review');
}

/**
 * Update the variant library with a new default
 */
async function updateVariantLibraryDefault(experimentId: string, winnerId: string): Promise<void> {
  const db = getFirestore();
  await db
    .collection('variant_library')
    .doc(experimentId)
    .set(
      {
        currentDefault: winnerId,
        updatedAt: FieldValue.serverTimestamp(),
        history: FieldValue.arrayUnion({
          variantId: winnerId,
          promotedAt: new Date().toISOString(),
        }),
      },
      { merge: true }
    );
}

// ============================================================================
// ALERTS
// ============================================================================

function addAlert(alert: OptimizerAlert): void {
  recentAlerts.unshift(alert);
  if (recentAlerts.length > MAX_ALERTS) {
    recentAlerts.pop();
  }
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get current optimizer status
 */
export function getOptimizerStatus(): OptimizerStatus {
  return {
    isRunning: isCurrentlyRunning,
    lastRun: lastRunTimestamp,
    experimentsChecked: 0, // Would need to track this
    winnersShipped: 0, // Would need to track this
    pendingReview: [],
    alerts: recentAlerts.slice(0, 20),
  };
}

/**
 * Get recent alerts
 */
export function getRecentAlerts(limit = 20): OptimizerAlert[] {
  return recentAlerts.slice(0, limit);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  runOptimizationLoop,
  getOptimizerStatus,
  getRecentAlerts,
  DEFAULT_CONFIG,
};
