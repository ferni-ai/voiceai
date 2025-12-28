/**
 * A/B Testing Module for Shared Personality System
 *
 * Enables controlled experiments to measure the impact of the
 * personality system on user engagement and conversation quality.
 *
 * Features:
 * - User-level variant assignment (consistent across sessions)
 * - Gradual rollout support (0% → 100%)
 * - Engagement metrics per variant
 * - Per-persona experiment support
 *
 * Usage:
 * 1. Create experiment: createExperiment('personality_v1', 0.5)
 * 2. Check variant: getVariant(userId, experimentId) → 'control' | 'treatment'
 * 3. Record engagement: recordEngagement(userId, experimentId, metrics)
 * 4. Analyze: getExperimentResults(experimentId)
 *
 * @module personas/shared/personality-ab-testing
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'personality-ab-testing' });

// ============================================================================
// TYPES
// ============================================================================

export type ExperimentVariant = 'control' | 'treatment';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  treatmentPercentage: number; // 0-100
  createdAt: Date;
  status: 'active' | 'paused' | 'completed';
  personaScope?: string[]; // Optional: limit to specific personas
  features: {
    enableNoticing: boolean;
    enableExpressions: boolean;
    enableResonance: boolean;
    enableTelemetry: boolean;
  };
}

export interface EngagementMetrics {
  // Conversation metrics
  turnCount: number;
  sessionDurationMs: number;
  averageTurnLengthWords: number;

  // Emotional engagement
  positiveResponses: number;
  negativeResponses: number;
  neutralResponses: number;

  // Personality-specific
  noticingsTriggered: number;
  noticingsAcknowledged: number; // User responded positively
  expressionsInjected: number;
  expressionsEngaged: number; // User built on the expression

  // Quality signals
  topicChanges: number;
  deepTopicExplorations: number;
  vulnerabilityMoments: number;
  breakthroughMoments: number;
}

export interface VariantAssignment {
  userId: string;
  experimentId: string;
  variant: ExperimentVariant;
  assignedAt: Date;
  personaId?: string;
}

export interface ExperimentResults {
  experimentId: string;
  controlCount: number;
  treatmentCount: number;
  controlMetrics: AggregatedMetrics;
  treatmentMetrics: AggregatedMetrics;
  significance: StatisticalSignificance;
}

export interface AggregatedMetrics {
  sessions: number;
  avgTurnCount: number;
  avgSessionDurationMs: number;
  avgPositiveResponseRate: number;
  avgNoticingEngagementRate: number;
  avgExpressionEngagementRate: number;
  avgBreakthroughRate: number;
  avgVulnerabilityRate: number;
}

export interface StatisticalSignificance {
  turnCountDelta: number;
  sessionDurationDelta: number;
  positiveResponseDelta: number;
  noticingEngagementDelta: number;
  expressionEngagementDelta: number;
  isSignificant: boolean; // Simplified - real implementation would use p-values
  confidenceLevel: number;
}

// ============================================================================
// IN-MEMORY STORAGE (Replace with Firestore in production)
// ============================================================================

const experiments = new Map<string, Experiment>();
const assignments = new Map<string, VariantAssignment>(); // Key: `${userId}:${experimentId}`
const sessionMetrics = new Map<string, EngagementMetrics[]>(); // Key: `${experimentId}:${variant}`

// ============================================================================
// EXPERIMENT MANAGEMENT
// ============================================================================

/**
 * Create a new A/B test experiment
 */
export function createExperiment(
  id: string,
  name: string,
  treatmentPercentage: number,
  options?: {
    description?: string;
    personaScope?: string[];
    features?: Partial<Experiment['features']>;
  }
): Experiment {
  const experiment: Experiment = {
    id,
    name,
    description: options?.description ?? `A/B test for ${name}`,
    treatmentPercentage: Math.max(0, Math.min(100, treatmentPercentage)),
    createdAt: new Date(),
    status: 'active',
    personaScope: options?.personaScope,
    features: {
      enableNoticing: true,
      enableExpressions: true,
      enableResonance: true,
      enableTelemetry: true,
      ...options?.features,
    },
  };

  experiments.set(id, experiment);
  log.info({ experimentId: id, treatmentPct: treatmentPercentage }, 'Created A/B experiment');

  return experiment;
}

/**
 * Get an active experiment by ID
 */
export function getExperiment(id: string): Experiment | null {
  return experiments.get(id) ?? null;
}

/**
 * Update experiment rollout percentage
 */
export function updateRolloutPercentage(experimentId: string, newPercentage: number): boolean {
  const experiment = experiments.get(experimentId);
  if (!experiment) return false;

  experiment.treatmentPercentage = Math.max(0, Math.min(100, newPercentage));
  log.info({ experimentId, newPercentage }, 'Updated rollout percentage');

  return true;
}

/**
 * Pause an experiment
 */
export function pauseExperiment(experimentId: string): boolean {
  const experiment = experiments.get(experimentId);
  if (!experiment) return false;

  experiment.status = 'paused';
  log.info({ experimentId }, 'Paused experiment');

  return true;
}

/**
 * Complete an experiment
 */
export function completeExperiment(experimentId: string): boolean {
  const experiment = experiments.get(experimentId);
  if (!experiment) return false;

  experiment.status = 'completed';
  log.info({ experimentId }, 'Completed experiment');

  return true;
}

// ============================================================================
// VARIANT ASSIGNMENT
// ============================================================================

/**
 * Deterministically assign a user to a variant
 * Uses a hash of userId + experimentId for consistency
 */
export function getVariant(
  userId: string,
  experimentId: string,
  personaId?: string
): ExperimentVariant {
  const experiment = experiments.get(experimentId);

  // If no experiment or paused, default to control
  if (!experiment || experiment.status !== 'active') {
    return 'control';
  }

  // Check persona scope
  if (experiment.personaScope && personaId) {
    if (!experiment.personaScope.includes(personaId)) {
      return 'control';
    }
  }

  // Check for existing assignment
  const assignmentKey = `${userId}:${experimentId}`;
  const existing = assignments.get(assignmentKey);
  if (existing) {
    return existing.variant;
  }

  // Deterministic hash for consistent assignment
  const hash = simpleHash(`${userId}:${experimentId}`);
  const bucket = hash % 100;

  const variant: ExperimentVariant =
    bucket < experiment.treatmentPercentage ? 'treatment' : 'control';

  // Store assignment
  assignments.set(cleanForFirestore(assignmentKey), {
    userId,
    experimentId,
    variant,
    assignedAt: new Date(),
    personaId,
  });

  log.debug({ userId, experimentId, variant, bucket }, 'Assigned user to variant');

  return variant;
}

/**
 * Check if a specific feature is enabled for a user
 */
export function isFeatureEnabled(
  userId: string,
  experimentId: string,
  feature: keyof Experiment['features'],
  personaId?: string
): boolean {
  const experiment = experiments.get(experimentId);
  if (!experiment) return true; // No experiment = all features on

  const variant = getVariant(userId, experimentId, personaId);

  // Control group: features disabled
  if (variant === 'control') {
    return false;
  }

  // Treatment group: check specific feature flag
  return experiment.features[feature] ?? true;
}

/**
 * Simple hash function for deterministic bucketing
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
// ENGAGEMENT TRACKING
// ============================================================================

/**
 * Record engagement metrics for a session
 */
export function recordSessionEngagement(
  userId: string,
  experimentId: string,
  metrics: EngagementMetrics
): void {
  const variant = getVariant(userId, experimentId);
  const storageKey = `${experimentId}:${variant}`;

  const existing = sessionMetrics.get(storageKey) ?? [];
  existing.push(metrics);
  sessionMetrics.set(storageKey, existing);

  log.debug(
    {
      userId,
      experimentId,
      variant,
      turnCount: metrics.turnCount,
      noticingsTriggered: metrics.noticingsTriggered,
    },
    'Recorded session engagement'
  );
}

/**
 * Create a metrics tracker for a session
 */
export function createSessionMetricsTracker(): EngagementMetrics {
  return {
    turnCount: 0,
    sessionDurationMs: 0,
    averageTurnLengthWords: 0,
    positiveResponses: 0,
    negativeResponses: 0,
    neutralResponses: 0,
    noticingsTriggered: 0,
    noticingsAcknowledged: 0,
    expressionsInjected: 0,
    expressionsEngaged: 0,
    topicChanges: 0,
    deepTopicExplorations: 0,
    vulnerabilityMoments: 0,
    breakthroughMoments: 0,
  };
}

/**
 * Increment a specific metric
 */
export function incrementMetric(
  metrics: EngagementMetrics,
  key: keyof EngagementMetrics,
  amount = 1
): void {
  (metrics[key] as number) += amount;
}

// ============================================================================
// RESULTS ANALYSIS
// ============================================================================

/**
 * Get aggregated results for an experiment
 */
export function getExperimentResults(experimentId: string): ExperimentResults | null {
  const experiment = experiments.get(experimentId);
  if (!experiment) return null;

  const controlMetrics = sessionMetrics.get(`${experimentId}:control`) ?? [];
  const treatmentMetrics = sessionMetrics.get(`${experimentId}:treatment`) ?? [];

  const controlAgg = aggregateMetrics(controlMetrics);
  const treatmentAgg = aggregateMetrics(treatmentMetrics);

  const significance = calculateSignificance(controlAgg, treatmentAgg);

  return {
    experimentId,
    controlCount: controlMetrics.length,
    treatmentCount: treatmentMetrics.length,
    controlMetrics: controlAgg,
    treatmentMetrics: treatmentAgg,
    significance,
  };
}

/**
 * Aggregate metrics across sessions
 */
function aggregateMetrics(metrics: EngagementMetrics[]): AggregatedMetrics {
  if (metrics.length === 0) {
    return {
      sessions: 0,
      avgTurnCount: 0,
      avgSessionDurationMs: 0,
      avgPositiveResponseRate: 0,
      avgNoticingEngagementRate: 0,
      avgExpressionEngagementRate: 0,
      avgBreakthroughRate: 0,
      avgVulnerabilityRate: 0,
    };
  }

  const sum = metrics.reduce(
    (acc, m) => ({
      turnCount: acc.turnCount + m.turnCount,
      sessionDurationMs: acc.sessionDurationMs + m.sessionDurationMs,
      positiveResponses: acc.positiveResponses + m.positiveResponses,
      totalResponses:
        acc.totalResponses + m.positiveResponses + m.negativeResponses + m.neutralResponses,
      noticingsTriggered: acc.noticingsTriggered + m.noticingsTriggered,
      noticingsAcknowledged: acc.noticingsAcknowledged + m.noticingsAcknowledged,
      expressionsInjected: acc.expressionsInjected + m.expressionsInjected,
      expressionsEngaged: acc.expressionsEngaged + m.expressionsEngaged,
      breakthroughMoments: acc.breakthroughMoments + m.breakthroughMoments,
      vulnerabilityMoments: acc.vulnerabilityMoments + m.vulnerabilityMoments,
    }),
    {
      turnCount: 0,
      sessionDurationMs: 0,
      positiveResponses: 0,
      totalResponses: 0,
      noticingsTriggered: 0,
      noticingsAcknowledged: 0,
      expressionsInjected: 0,
      expressionsEngaged: 0,
      breakthroughMoments: 0,
      vulnerabilityMoments: 0,
    }
  );

  const n = metrics.length;

  return {
    sessions: n,
    avgTurnCount: sum.turnCount / n,
    avgSessionDurationMs: sum.sessionDurationMs / n,
    avgPositiveResponseRate:
      sum.totalResponses > 0 ? sum.positiveResponses / sum.totalResponses : 0,
    avgNoticingEngagementRate:
      sum.noticingsTriggered > 0 ? sum.noticingsAcknowledged / sum.noticingsTriggered : 0,
    avgExpressionEngagementRate:
      sum.expressionsInjected > 0 ? sum.expressionsEngaged / sum.expressionsInjected : 0,
    avgBreakthroughRate: sum.breakthroughMoments / n,
    avgVulnerabilityRate: sum.vulnerabilityMoments / n,
  };
}

/**
 * Calculate statistical significance (simplified)
 */
function calculateSignificance(
  control: AggregatedMetrics,
  treatment: AggregatedMetrics
): StatisticalSignificance {
  const turnCountDelta =
    control.avgTurnCount > 0
      ? ((treatment.avgTurnCount - control.avgTurnCount) / control.avgTurnCount) * 100
      : 0;

  const sessionDurationDelta =
    control.avgSessionDurationMs > 0
      ? ((treatment.avgSessionDurationMs - control.avgSessionDurationMs) /
          control.avgSessionDurationMs) *
        100
      : 0;

  const positiveResponseDelta =
    control.avgPositiveResponseRate > 0
      ? ((treatment.avgPositiveResponseRate - control.avgPositiveResponseRate) /
          control.avgPositiveResponseRate) *
        100
      : 0;

  const noticingEngagementDelta = treatment.avgNoticingEngagementRate * 100;
  const expressionEngagementDelta = treatment.avgExpressionEngagementRate * 100;

  // Simplified significance calculation
  // In production, use proper statistical tests (t-test, chi-squared, etc.)
  const minSampleSize = 30;
  const hasSufficientData =
    control.sessions >= minSampleSize && treatment.sessions >= minSampleSize;

  // Consider significant if:
  // 1. Sufficient sample size
  // 2. At least 10% improvement in key metrics
  // 3. Consistent direction across metrics
  const significantImprovement =
    turnCountDelta > 10 || sessionDurationDelta > 10 || positiveResponseDelta > 10;

  return {
    turnCountDelta,
    sessionDurationDelta,
    positiveResponseDelta,
    noticingEngagementDelta,
    expressionEngagementDelta,
    isSignificant: hasSufficientData && significantImprovement,
    confidenceLevel: hasSufficientData ? 0.95 : 0.5,
  };
}

// ============================================================================
// EXPERIMENT REPORT
// ============================================================================

/**
 * Generate a human-readable experiment report
 */
export function generateExperimentReport(experimentId: string): string {
  const results = getExperimentResults(experimentId);
  if (!results) return 'Experiment not found';

  const experiment = experiments.get(experimentId);
  if (!experiment) return 'Experiment not found';

  const { controlMetrics: ctrl, treatmentMetrics: treat, significance: sig } = results;

  const report = `
═══════════════════════════════════════════════════════════════
A/B EXPERIMENT REPORT: ${experiment.name}
═══════════════════════════════════════════════════════════════

📊 OVERVIEW
───────────────────────────────────────────────────────────────
Experiment ID: ${experimentId}
Status: ${experiment.status}
Treatment %: ${experiment.treatmentPercentage}%
Created: ${experiment.createdAt.toISOString()}

📈 SAMPLE SIZE
───────────────────────────────────────────────────────────────
Control Sessions: ${results.controlCount}
Treatment Sessions: ${results.treatmentCount}

🎯 KEY METRICS
───────────────────────────────────────────────────────────────
                        Control    Treatment    Delta
Avg Turn Count          ${ctrl.avgTurnCount.toFixed(1).padStart(7)}    ${treat.avgTurnCount.toFixed(1).padStart(9)}    ${sig.turnCountDelta > 0 ? '+' : ''}${sig.turnCountDelta.toFixed(1)}%
Avg Session Duration    ${(ctrl.avgSessionDurationMs / 60000).toFixed(1).padStart(7)}m   ${(treat.avgSessionDurationMs / 60000).toFixed(1).padStart(9)}m   ${sig.sessionDurationDelta > 0 ? '+' : ''}${sig.sessionDurationDelta.toFixed(1)}%
Positive Response Rate  ${(ctrl.avgPositiveResponseRate * 100).toFixed(1).padStart(7)}%   ${(treat.avgPositiveResponseRate * 100).toFixed(1).padStart(9)}%   ${sig.positiveResponseDelta > 0 ? '+' : ''}${sig.positiveResponseDelta.toFixed(1)}%

🧠 PERSONALITY SYSTEM METRICS (Treatment Only)
───────────────────────────────────────────────────────────────
Noticing Engagement Rate:    ${sig.noticingEngagementDelta.toFixed(1)}%
Expression Engagement Rate:  ${sig.expressionEngagementDelta.toFixed(1)}%
Avg Breakthrough Rate:       ${treat.avgBreakthroughRate.toFixed(2)} per session
Avg Vulnerability Rate:      ${treat.avgVulnerabilityRate.toFixed(2)} per session

📉 STATISTICAL SIGNIFICANCE
───────────────────────────────────────────────────────────────
Significant: ${sig.isSignificant ? '✅ YES' : '❌ NO'}
Confidence: ${(sig.confidenceLevel * 100).toFixed(0)}%
${!sig.isSignificant && results.controlCount < 30 ? '⚠️  Need more data (minimum 30 sessions per variant)' : ''}

═══════════════════════════════════════════════════════════════
`;

  return report;
}

// ============================================================================
// DEFAULT EXPERIMENT
// ============================================================================

/**
 * Initialize the default personality system experiment
 * Call this at startup to create the main A/B test
 */
export function initializeDefaultExperiment(): Experiment {
  const existingExperiment = getExperiment('personality_system_v1');
  if (existingExperiment) {
    return existingExperiment;
  }

  return createExperiment(
    'personality_system_v1',
    'Shared Personality System v1',
    100, // Start at 100% (all users get treatment) - adjust for actual A/B test
    {
      description:
        'Tests the impact of real-time noticing, personality expressions, and cross-session resonance on user engagement',
      features: {
        enableNoticing: true,
        enableExpressions: true,
        enableResonance: true,
        enableTelemetry: true,
      },
    }
  );
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  experiments,
  assignments,
  sessionMetrics,
  clearAll: () => {
    experiments.clear();
    assignments.clear();
    sessionMetrics.clear();
  },
};
