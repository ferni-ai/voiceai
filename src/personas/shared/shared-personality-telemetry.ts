/**
 * Shared Personality Telemetry & A/B Testing
 *
 * Real-time visibility into personality system decisions for ALL personas.
 * See exactly WHY a persona chose a particular expression, what signals
 * influenced the decision, and how long each step took.
 *
 * Also supports A/B testing of personality features.
 *
 * "Better than human" means being able to explain ourselves.
 *
 * @module personas/shared/shared-personality-telemetry
 */

import { createLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';
import type { NoticingType } from './realtime-noticing.js';

const log = createLogger({ module: 'shared-personality-telemetry' });

// ============================================================================
// TYPES
// ============================================================================

export interface SharedTelemetrySnapshot {
  sessionId: string;
  personaId: string;
  userId?: string;
  turnCount: number;
  timestamp: Date;

  // Timing breakdown
  timing: {
    contextAssemblyMs: number;
    noticingDetectionMs: number;
    expressionCompositionMs: number;
    resonanceLookupMs: number;
    totalMs: number;
  };

  // Context dimensions captured
  context: {
    timeOfDay: string;
    momentum: string;
    emotionalState?: string;
    emotionalIntensity: number;
    distressLevel: number;
    relationshipStage: string;
    userSpeechPace: string;
    voiceEnergyLevel: string;
    currentTopic?: string;
    topicShiftDetected: boolean;
  };

  // Decision factors
  decisions: {
    // Voice signals
    voiceEmotion?: string;
    voiceConfidence?: number;

    // What was detected
    noticingType?: NoticingType;
    noticingConfidence?: number;
    noticingShouldAcknowledge?: boolean;
    noticingThrottled?: boolean;

    // What was chosen
    expressionTheme?: ThemeCategory;
    expressionIntimacy?: number;
    expressionTiming?: string;
    expressionSource: 'llm' | 'building_blocks' | 'resonance_match' | 'none';

    // Why (human-readable)
    decisionReason: string;

    // A/B test info
    abTestVariant?: string;
    abTestId?: string;
  };

  // What was actually injected
  output: {
    injected: boolean;
    injectionPoint?: string;
    contentPreview?: string; // First 100 chars
    acknowledgment?: string;
  };
}

export interface SharedPerformanceMetrics {
  // Identity
  personaId: string;

  // Rolling averages
  avgContextAssemblyMs: number;
  avgNoticingDetectionMs: number;
  avgExpressionCompositionMs: number;
  avgResonanceLookupMs: number;
  avgTotalMs: number;

  // Counts
  totalTurns: number;
  turnsWithInjection: number;
  turnsWithNoticing: number;
  turnsThrottled: number;

  // Noticing breakdown by type
  noticingByType: Partial<Record<NoticingType, number>>;

  // Expression themes used
  themeUsage: Partial<Record<ThemeCategory, number>>;

  // Engagement tracking
  positiveEngagements: number;
  negativeEngagements: number;
  neutralEngagements: number;
}

// ============================================================================
// A/B TESTING TYPES
// ============================================================================

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  variants: Array<{
    id: string;
    weight: number; // 0-1, all weights should sum to 1
    config: Record<string, unknown>;
  }>;
  startDate: Date;
  endDate?: Date;
  personaIds?: string[]; // If specified, only run for these personas
  enabled: boolean;
}

export interface ABTestAssignment {
  testId: string;
  variantId: string;
  assignedAt: Date;
}

// ============================================================================
// STATE
// ============================================================================

const sessionMetrics = new Map<string, SharedPerformanceMetrics>();
const recentSnapshots = new Map<string, SharedTelemetrySnapshot[]>();
const MAX_SNAPSHOTS = 20;

// A/B test state
const activeTests = new Map<string, ABTestConfig>();
const userAssignments = new Map<string, Map<string, ABTestAssignment>>(); // userId -> testId -> assignment

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Start timing a telemetry step
 */
export function startTiming(): { elapsed: () => number } {
  const start = performance.now();
  return {
    elapsed: () => Math.round(performance.now() - start),
  };
}

// ============================================================================
// TELEMETRY RECORDING
// ============================================================================

/**
 * Record a complete telemetry snapshot
 */
export function recordTelemetry(
  sessionId: string,
  snapshot: Omit<SharedTelemetrySnapshot, 'timestamp'>
): void {
  const fullSnapshot: SharedTelemetrySnapshot = {
    ...snapshot,
    timestamp: new Date(),
  };

  // Store in recent snapshots
  const existing = recentSnapshots.get(sessionId) || [];
  existing.push(fullSnapshot);
  if (existing.length > MAX_SNAPSHOTS) {
    existing.shift();
  }
  recentSnapshots.set(sessionId, existing);

  // Update rolling metrics
  updateMetrics(sessionId, fullSnapshot);

  // Log transparency info
  logTelemetry(fullSnapshot);
}

/**
 * Record engagement feedback for resonance learning
 */
export function recordEngagement(
  sessionId: string,
  personaId: string,
  engagement: 'positive' | 'neutral' | 'negative'
): void {
  const metrics = sessionMetrics.get(`${personaId}-${sessionId}`);
  if (!metrics) return;

  switch (engagement) {
    case 'positive':
      metrics.positiveEngagements++;
      break;
    case 'negative':
      metrics.negativeEngagements++;
      break;
    case 'neutral':
      metrics.neutralEngagements++;
      break;
  }
}

/**
 * Update rolling performance metrics
 */
function updateMetrics(sessionId: string, snapshot: SharedTelemetrySnapshot): void {
  const key = `${snapshot.personaId}-${sessionId}`;
  const existing = sessionMetrics.get(key) || createDefaultMetrics(snapshot.personaId);

  // Update timing averages (exponential moving average)
  const alpha = 0.2; // Smoothing factor
  existing.avgContextAssemblyMs =
    alpha * snapshot.timing.contextAssemblyMs + (1 - alpha) * existing.avgContextAssemblyMs;
  existing.avgNoticingDetectionMs =
    alpha * snapshot.timing.noticingDetectionMs + (1 - alpha) * existing.avgNoticingDetectionMs;
  existing.avgExpressionCompositionMs =
    alpha * snapshot.timing.expressionCompositionMs +
    (1 - alpha) * existing.avgExpressionCompositionMs;
  existing.avgResonanceLookupMs =
    alpha * snapshot.timing.resonanceLookupMs + (1 - alpha) * existing.avgResonanceLookupMs;
  existing.avgTotalMs = alpha * snapshot.timing.totalMs + (1 - alpha) * existing.avgTotalMs;

  // Update counts
  existing.totalTurns++;
  if (snapshot.output.injected) existing.turnsWithInjection++;
  if (snapshot.decisions.noticingType) existing.turnsWithNoticing++;
  if (snapshot.decisions.noticingThrottled) existing.turnsThrottled++;

  // Track noticing by type
  if (snapshot.decisions.noticingType) {
    existing.noticingByType[snapshot.decisions.noticingType] =
      (existing.noticingByType[snapshot.decisions.noticingType] || 0) + 1;
  }

  // Track theme usage
  if (snapshot.decisions.expressionTheme) {
    existing.themeUsage[snapshot.decisions.expressionTheme] =
      (existing.themeUsage[snapshot.decisions.expressionTheme] || 0) + 1;
  }

  sessionMetrics.set(key, existing);
}

function createDefaultMetrics(personaId: string): SharedPerformanceMetrics {
  return {
    personaId,
    avgContextAssemblyMs: 0,
    avgNoticingDetectionMs: 0,
    avgExpressionCompositionMs: 0,
    avgResonanceLookupMs: 0,
    avgTotalMs: 0,
    totalTurns: 0,
    turnsWithInjection: 0,
    turnsWithNoticing: 0,
    turnsThrottled: 0,
    noticingByType: {},
    themeUsage: {},
    positiveEngagements: 0,
    negativeEngagements: 0,
    neutralEngagements: 0,
  };
}

// ============================================================================
// TRANSPARENCY LOGGING
// ============================================================================

/**
 * Log detailed telemetry for debugging and transparency
 */
function logTelemetry(snapshot: SharedTelemetrySnapshot): void {
  const { timing, decisions, output, context } = snapshot;

  // Performance status
  const perfStatus = timing.totalMs < 50 ? '🟢' : timing.totalMs < 200 ? '🟡' : '🔴';

  diag.info(`${perfStatus} [${snapshot.personaId}] Personality Turn #${snapshot.turnCount}`, {
    timing: `${timing.totalMs}ms (ctx:${timing.contextAssemblyMs}, notice:${timing.noticingDetectionMs}, expr:${timing.expressionCompositionMs}, res:${timing.resonanceLookupMs})`,
    emotion: context.emotionalState || 'unknown',
    momentum: context.momentum,
    distress: context.distressLevel.toFixed(2),
    relationship: context.relationshipStage,
  });

  // Decision explanation
  if (output.injected) {
    log.debug(
      {
        personaId: snapshot.personaId,
        theme: decisions.expressionTheme,
        source: decisions.expressionSource,
        reason: decisions.decisionReason,
        injection: output.injectionPoint,
        intimacy: decisions.expressionIntimacy,
      },
      '🎭 Expression injected'
    );
  }

  if (decisions.noticingType) {
    log.debug(
      {
        personaId: snapshot.personaId,
        type: decisions.noticingType,
        confidence: decisions.noticingConfidence,
        acknowledge: decisions.noticingShouldAcknowledge,
        throttled: decisions.noticingThrottled,
      },
      '👁️ Noticing detected'
    );
  }

  // A/B test logging
  if (decisions.abTestId) {
    log.debug(
      {
        testId: decisions.abTestId,
        variant: decisions.abTestVariant,
        personaId: snapshot.personaId,
      },
      '🧪 A/B test active'
    );
  }
}

// ============================================================================
// A/B TESTING
// ============================================================================

/**
 * Register an A/B test
 */
export function registerABTest(config: ABTestConfig): void {
  activeTests.set(config.id, config);
  log.info({ testId: config.id, name: config.name }, '🧪 A/B test registered');
}

/**
 * Get or assign a user to an A/B test variant
 */
export function getABTestVariant(
  userId: string,
  testId: string
): { variantId: string; config: Record<string, unknown> } | null {
  const test = activeTests.get(testId);
  if (!test || !test.enabled) return null;

  // Check if test has ended
  if (test.endDate && new Date() > test.endDate) return null;

  // Check existing assignment
  const userTests = userAssignments.get(userId);
  const existing = userTests?.get(testId);

  if (existing) {
    const variant = test.variants.find((v) => v.id === existing.variantId);
    if (variant) {
      return { variantId: variant.id, config: variant.config };
    }
  }

  // Assign new variant based on weights
  const rand = Math.random();
  let cumulative = 0;

  for (const variant of test.variants) {
    cumulative += variant.weight;
    if (rand <= cumulative) {
      // Record assignment
      const assignments = userAssignments.get(userId) || new Map();
      assignments.set(testId, {
        testId,
        variantId: variant.id,
        assignedAt: new Date(),
      });
      userAssignments.set(userId, assignments);

      return { variantId: variant.id, config: variant.config };
    }
  }

  // Fallback to first variant
  const fallback = test.variants[0];
  return fallback ? { variantId: fallback.id, config: fallback.config } : null;
}

/**
 * Get all active A/B tests
 */
export function getActiveABTests(): ABTestConfig[] {
  const now = new Date();
  return Array.from(activeTests.values()).filter(
    (t) => t.enabled && (!t.endDate || now < t.endDate)
  );
}

/**
 * Deactivate an A/B test
 */
export function deactivateABTest(testId: string): void {
  const test = activeTests.get(testId);
  if (test) {
    test.enabled = false;
    log.info({ testId }, '🧪 A/B test deactivated');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get performance metrics for a persona+session
 */
export function getSessionMetrics(
  personaId: string,
  sessionId: string
): SharedPerformanceMetrics | null {
  return sessionMetrics.get(`${personaId}-${sessionId}`) || null;
}

/**
 * Get recent telemetry snapshots for a session
 */
export function getRecentSnapshots(sessionId: string): SharedTelemetrySnapshot[] {
  return recentSnapshots.get(sessionId) || [];
}

/**
 * Get aggregated metrics across all sessions for a persona
 */
export function getPersonaAggregateMetrics(personaId: string): SharedPerformanceMetrics | null {
  const allMetrics = Array.from(sessionMetrics.values()).filter((m) => m.personaId === personaId);

  if (allMetrics.length === 0) return null;

  // Aggregate
  const aggregate = createDefaultMetrics(personaId);
  for (const m of allMetrics) {
    aggregate.totalTurns += m.totalTurns;
    aggregate.turnsWithInjection += m.turnsWithInjection;
    aggregate.turnsWithNoticing += m.turnsWithNoticing;
    aggregate.turnsThrottled += m.turnsThrottled;
    aggregate.positiveEngagements += m.positiveEngagements;
    aggregate.negativeEngagements += m.negativeEngagements;
    aggregate.neutralEngagements += m.neutralEngagements;

    // Aggregate noticing by type
    for (const [type, count] of Object.entries(m.noticingByType)) {
      const noticingType = type as NoticingType;
      aggregate.noticingByType[noticingType] =
        (aggregate.noticingByType[noticingType] || 0) + (count || 0);
    }

    // Aggregate theme usage
    for (const [theme, count] of Object.entries(m.themeUsage)) {
      const themeCategory = theme as ThemeCategory;
      aggregate.themeUsage[themeCategory] =
        (aggregate.themeUsage[themeCategory] || 0) + (count || 0);
    }
  }

  // Average the timing values
  aggregate.avgTotalMs = allMetrics.reduce((sum, m) => sum + m.avgTotalMs, 0) / allMetrics.length;
  aggregate.avgContextAssemblyMs =
    allMetrics.reduce((sum, m) => sum + m.avgContextAssemblyMs, 0) / allMetrics.length;
  aggregate.avgNoticingDetectionMs =
    allMetrics.reduce((sum, m) => sum + m.avgNoticingDetectionMs, 0) / allMetrics.length;
  aggregate.avgExpressionCompositionMs =
    allMetrics.reduce((sum, m) => sum + m.avgExpressionCompositionMs, 0) / allMetrics.length;
  aggregate.avgResonanceLookupMs =
    allMetrics.reduce((sum, m) => sum + m.avgResonanceLookupMs, 0) / allMetrics.length;

  return aggregate;
}

/**
 * Format metrics as a human-readable string
 */
export function formatMetricsReport(personaId: string, sessionId?: string): string {
  const metrics = sessionId
    ? getSessionMetrics(personaId, sessionId)
    : getPersonaAggregateMetrics(personaId);

  if (!metrics) return `No metrics available for ${personaId}.`;

  const injectionRate =
    metrics.totalTurns > 0
      ? Math.round((metrics.turnsWithInjection / metrics.totalTurns) * 100)
      : 0;

  const noticingRate =
    metrics.totalTurns > 0 ? Math.round((metrics.turnsWithNoticing / metrics.totalTurns) * 100) : 0;

  const throttleRate =
    metrics.turnsWithNoticing > 0
      ? Math.round((metrics.turnsThrottled / metrics.turnsWithNoticing) * 100)
      : 0;

  const totalEngagements =
    metrics.positiveEngagements + metrics.negativeEngagements + metrics.neutralEngagements;
  const engagementScore =
    totalEngagements > 0 ? Math.round((metrics.positiveEngagements / totalEngagements) * 100) : 0;

  // Top noticing types
  const topNoticings = Object.entries(metrics.noticingByType)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  // Top themes
  const topThemes = Object.entries(metrics.themeUsage)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, 3)
    .map(([theme, count]) => `${theme}: ${count}`)
    .join(', ');

  return `
📊 Personality Telemetry Report: ${personaId}
═══════════════════════════════════════

⏱️  Performance
   Avg Total:       ${Math.round(metrics.avgTotalMs)}ms
   Avg Context:     ${Math.round(metrics.avgContextAssemblyMs)}ms
   Avg Noticing:    ${Math.round(metrics.avgNoticingDetectionMs)}ms
   Avg Expression:  ${Math.round(metrics.avgExpressionCompositionMs)}ms
   Avg Resonance:   ${Math.round(metrics.avgResonanceLookupMs)}ms

📈 Activity
   Total Turns:     ${metrics.totalTurns}
   Injections:      ${metrics.turnsWithInjection} (${injectionRate}%)
   Noticings:       ${metrics.turnsWithNoticing} (${noticingRate}%)
   Throttled:       ${metrics.turnsThrottled} (${throttleRate}% of noticings)

👁️ Top Noticings
   ${topNoticings || 'None'}

🎭 Top Themes
   ${topThemes || 'None'}

💚 Engagement
   Positive:        ${metrics.positiveEngagements}
   Neutral:         ${metrics.neutralEngagements}
   Negative:        ${metrics.negativeEngagements}
   Score:           ${engagementScore}%
`;
}

/**
 * Clear metrics for a session
 */
export function clearSessionMetrics(personaId: string, sessionId: string): void {
  sessionMetrics.delete(`${personaId}-${sessionId}`);
  recentSnapshots.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedPersonalityTelemetry = {
  // Timing
  startTiming,

  // Recording
  record: recordTelemetry,
  recordEngagement,

  // Retrieval
  getMetrics: getSessionMetrics,
  getSnapshots: getRecentSnapshots,
  getPersonaAggregate: getPersonaAggregateMetrics,
  formatReport: formatMetricsReport,

  // Cleanup
  clear: clearSessionMetrics,

  // A/B Testing
  registerTest: registerABTest,
  getVariant: getABTestVariant,
  getActiveTests: getActiveABTests,
  deactivateTest: deactivateABTest,
};

export default sharedPersonalityTelemetry;
