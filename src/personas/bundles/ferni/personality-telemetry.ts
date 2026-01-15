/**
 * Personality Telemetry & Transparency
 *
 * Real-time visibility into personality system decisions.
 * See exactly WHY Ferni chose a particular expression, what signals
 * influenced the decision, and how long each step took.
 *
 * "Better than human" means being able to explain ourselves.
 *
 * @module personas/bundles/ferni/personality-telemetry
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { diag } from '../../../services/observability/diagnostic-logger.js';
import type { PersonalityContext } from '../../shared/better-than-human-personality.js';
import type { NoticingResult } from '../../shared/realtime-noticing.js';
import type { ThemeCategory } from '../../../services/session-manager/session-variety-tracker.js';

const log = createLogger({ module: 'personality-telemetry' });

// ============================================================================
// TYPES
// ============================================================================

export interface TelemetrySnapshot {
  sessionId: string;
  turnCount: number;
  timestamp: Date;

  // Timing breakdown
  timing: {
    contextAssemblyMs: number;
    noticingDetectionMs: number;
    expressionLookupMs: number;
    totalMs: number;
  };

  // Decision factors
  decisions: {
    // Context factors
    timeOfDay: string;
    momentum: string;
    emotionalState: string;
    relationshipStage: string;
    distressLevel: number;

    // Voice signals
    voiceEmotion?: string;
    voiceConfidence?: number;
    speechPace?: string;
    energyLevel?: string;

    // What was detected
    noticingType?: string;
    noticingConfidence?: number;
    noticingShouldAcknowledge?: boolean;

    // What was chosen
    expressionTheme?: ThemeCategory;
    expressionSource?: 'llm' | 'composed' | 'pool' | 'memory' | 'cross-persona' | 'none';
    injectionPoint?: string;

    // Why
    decisionReason: string;
  };

  // What was actually injected
  output: {
    injected: boolean;
    content?: string;
    acknowledgment?: string;
  };
}

export interface PerformanceMetrics {
  // Rolling averages
  avgContextAssemblyMs: number;
  avgNoticingDetectionMs: number;
  avgExpressionLookupMs: number;
  avgTotalMs: number;

  // Counts
  totalTurns: number;
  turnsWithInjection: number;
  turnsWithNoticing: number;

  // Expression sources
  llmExpressions: number;
  composedExpressions: number;
  poolExpressions: number;

  // Cache performance
  cacheHits: number;
  cacheMisses: number;
}

// ============================================================================
// STATE
// ============================================================================

const sessionMetrics = new Map<string, PerformanceMetrics>();
const recentSnapshots = new Map<string, TelemetrySnapshot[]>();
const MAX_SNAPSHOTS = 20;

// ============================================================================
// TELEMETRY RECORDING
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

/**
 * Record a complete telemetry snapshot
 */
export function recordTelemetry(
  sessionId: string,
  snapshot: Omit<TelemetrySnapshot, 'timestamp'>
): void {
  const fullSnapshot: TelemetrySnapshot = {
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
 * Update rolling performance metrics
 */
function updateMetrics(sessionId: string, snapshot: TelemetrySnapshot): void {
  const existing = sessionMetrics.get(sessionId) || createDefaultMetrics();

  // Update timing averages
  const n = existing.totalTurns;
  existing.avgContextAssemblyMs =
    (existing.avgContextAssemblyMs * n + snapshot.timing.contextAssemblyMs) / (n + 1);
  existing.avgNoticingDetectionMs =
    (existing.avgNoticingDetectionMs * n + snapshot.timing.noticingDetectionMs) / (n + 1);
  existing.avgExpressionLookupMs =
    (existing.avgExpressionLookupMs * n + snapshot.timing.expressionLookupMs) / (n + 1);
  existing.avgTotalMs = (existing.avgTotalMs * n + snapshot.timing.totalMs) / (n + 1);

  // Update counts
  existing.totalTurns++;
  if (snapshot.output.injected) existing.turnsWithInjection++;
  if (snapshot.decisions.noticingType) existing.turnsWithNoticing++;

  // Update source counts
  switch (snapshot.decisions.expressionSource) {
    case 'llm':
      existing.llmExpressions++;
      existing.cacheHits++;
      break;
    case 'composed':
      existing.composedExpressions++;
      existing.cacheMisses++;
      break;
    case 'pool':
      existing.poolExpressions++;
      existing.cacheMisses++;
      break;
  }

  sessionMetrics.set(sessionId, existing);
}

function createDefaultMetrics(): PerformanceMetrics {
  return {
    avgContextAssemblyMs: 0,
    avgNoticingDetectionMs: 0,
    avgExpressionLookupMs: 0,
    avgTotalMs: 0,
    totalTurns: 0,
    turnsWithInjection: 0,
    turnsWithNoticing: 0,
    llmExpressions: 0,
    composedExpressions: 0,
    poolExpressions: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}

// ============================================================================
// TRANSPARENCY LOGGING
// ============================================================================

/**
 * Log detailed telemetry for debugging and transparency
 */
function logTelemetry(snapshot: TelemetrySnapshot): void {
  const { timing, decisions, output } = snapshot;

  // Performance summary
  const perfStatus = timing.totalMs < 50 ? '🟢' : timing.totalMs < 200 ? '🟡' : '🔴';

  diag.info(`${perfStatus} Personality Turn #${snapshot.turnCount}`, {
    timing: `${timing.totalMs}ms (ctx:${timing.contextAssemblyMs}, notice:${timing.noticingDetectionMs}, expr:${timing.expressionLookupMs})`,
    emotion: decisions.emotionalState,
    voiceEmotion: decisions.voiceEmotion || 'none',
    momentum: decisions.momentum,
    distress: decisions.distressLevel,
  });

  // Decision explanation
  if (output.injected) {
    log.debug(
      {
        theme: decisions.expressionTheme,
        source: decisions.expressionSource,
        reason: decisions.decisionReason,
        injection: decisions.injectionPoint,
      },
      '🎭 Expression chosen'
    );
  }

  if (decisions.noticingType) {
    log.debug(
      {
        type: decisions.noticingType,
        confidence: decisions.noticingConfidence,
        acknowledge: decisions.noticingShouldAcknowledge,
      },
      '👁️ Noticing detected'
    );
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get performance metrics for a session
 */
export function getSessionMetrics(sessionId: string): PerformanceMetrics | null {
  return sessionMetrics.get(sessionId) || null;
}

/**
 * Get recent telemetry snapshots for a session
 */
export function getRecentSnapshots(sessionId: string): TelemetrySnapshot[] {
  return recentSnapshots.get(sessionId) || [];
}

/**
 * Get a summary of all active sessions
 */
export function getAllSessionsSummary(): Array<{
  sessionId: string;
  turnCount: number;
  avgMs: number;
  injectionRate: number;
}> {
  const summaries: Array<{
    sessionId: string;
    turnCount: number;
    avgMs: number;
    injectionRate: number;
  }> = [];

  for (const [sessionId, metrics] of sessionMetrics.entries()) {
    summaries.push({
      sessionId,
      turnCount: metrics.totalTurns,
      avgMs: Math.round(metrics.avgTotalMs),
      injectionRate:
        metrics.totalTurns > 0
          ? Math.round((metrics.turnsWithInjection / metrics.totalTurns) * 100)
          : 0,
    });
  }

  return summaries;
}

/**
 * Format metrics as a human-readable string
 */
export function formatMetricsReport(sessionId: string): string {
  const metrics = sessionMetrics.get(sessionId);
  if (!metrics) return 'No metrics available for this session.';

  const injectionRate =
    metrics.totalTurns > 0
      ? Math.round((metrics.turnsWithInjection / metrics.totalTurns) * 100)
      : 0;

  const noticingRate =
    metrics.totalTurns > 0 ? Math.round((metrics.turnsWithNoticing / metrics.totalTurns) * 100) : 0;

  const cacheHitRate =
    metrics.cacheHits + metrics.cacheMisses > 0
      ? Math.round((metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100)
      : 0;

  return `
📊 Personality Telemetry Report
═══════════════════════════════════════

⏱️  Performance
   Avg Total:       ${Math.round(metrics.avgTotalMs)}ms
   Avg Context:     ${Math.round(metrics.avgContextAssemblyMs)}ms
   Avg Noticing:    ${Math.round(metrics.avgNoticingDetectionMs)}ms
   Avg Expression:  ${Math.round(metrics.avgExpressionLookupMs)}ms

📈 Activity
   Total Turns:     ${metrics.totalTurns}
   Injections:      ${metrics.turnsWithInjection} (${injectionRate}%)
   Noticings:       ${metrics.turnsWithNoticing} (${noticingRate}%)

🎭 Expression Sources
   LLM Generated:   ${metrics.llmExpressions}
   Composed:        ${metrics.composedExpressions}
   Pool-based:      ${metrics.poolExpressions}

💾 Cache Performance
   Hit Rate:        ${cacheHitRate}%
   Hits:            ${metrics.cacheHits}
   Misses:          ${metrics.cacheMisses}
`;
}

/**
 * Clear metrics for a session
 */
export function clearSessionMetrics(sessionId: string): void {
  sessionMetrics.delete(sessionId);
  recentSnapshots.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personalityTelemetry = {
  startTiming,
  record: recordTelemetry,
  getMetrics: getSessionMetrics,
  getSnapshots: getRecentSnapshots,
  getAllSummary: getAllSessionsSummary,
  formatReport: formatMetricsReport,
  clear: clearSessionMetrics,
};

export default personalityTelemetry;
