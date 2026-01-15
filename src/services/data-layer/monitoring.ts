/**
 * Semantic Data Layer Monitoring
 *
 * Provides monitoring hooks for index size, latency, and freshness.
 *
 * @module data-layer/monitoring
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../../memory/firestore-vector-store/index.js';

const log = createLogger({ module: 'SemanticMonitoring' });

// ============================================================================
// METRICS COLLECTION
// ============================================================================

interface IndexingMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  lastOperationAt: number;
  operationsByEntityType: Map<string, number>;
  errorsByEntityType: Map<string, number>;
}

interface FreshnessMetrics {
  lastIndexedAt: Map<string, number>; // userId -> timestamp
  indexAgeByUser: Map<string, number>; // userId -> age in ms
}

// In-memory metrics store
const metrics: IndexingMetrics = {
  totalOperations: 0,
  successfulOperations: 0,
  failedOperations: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  minLatencyMs: Infinity,
  lastOperationAt: 0,
  operationsByEntityType: new Map(),
  errorsByEntityType: new Map(),
};

const freshnessMetrics: FreshnessMetrics = {
  lastIndexedAt: new Map(),
  indexAgeByUser: new Map(),
};

// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================

/**
 * Record a successful indexing operation
 */
export function recordIndexSuccess(entityType: string, userId: string, latencyMs: number): void {
  metrics.totalOperations++;
  metrics.successfulOperations++;
  metrics.totalLatencyMs += latencyMs;
  metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);
  metrics.minLatencyMs = Math.min(metrics.minLatencyMs, latencyMs);
  metrics.lastOperationAt = Date.now();

  const count = metrics.operationsByEntityType.get(entityType) || 0;
  metrics.operationsByEntityType.set(entityType, count + 1);

  // Update freshness
  freshnessMetrics.lastIndexedAt.set(userId, Date.now());

  log.debug({ entityType, userId, latencyMs }, '📊 Index operation recorded');
}

// Track recent errors for alerting
const recentErrors: Array<{ entityType: string; error: string; timestamp: number }> = [];
const MAX_RECENT_ERRORS = 50;
let lastAlertSent = 0;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between alerts

/**
 * Record a failed indexing operation
 */
export function recordIndexError(entityType: string, userId: string, error: string): void {
  metrics.totalOperations++;
  metrics.failedOperations++;
  metrics.lastOperationAt = Date.now();

  const count = metrics.errorsByEntityType.get(entityType) || 0;
  metrics.errorsByEntityType.set(entityType, count + 1);

  // Track recent errors
  recentErrors.push({ entityType, error, timestamp: Date.now() });
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }

  log.warn({ entityType, userId, error }, '⚠️ Index operation failed');

  // Check if we should send an alert
  void checkAndSendAlert();
}

/**
 * Check if we should send a Slack alert for sustained failures
 */
async function checkAndSendAlert(): Promise<void> {
  // Only alert if we have enough data
  if (metrics.totalOperations < 10) return;

  // Calculate current error rate
  const errorRate = metrics.failedOperations / metrics.totalOperations;

  // Alert if error rate > 10% and we haven't alerted recently
  if (errorRate > 0.1 && Date.now() - lastAlertSent > ALERT_COOLDOWN_MS) {
    lastAlertSent = Date.now();

    try {
      const { notifySlack } = await import('../integrations/slack-notifications.js');

      // Get recent error summary
      const recentErrorTypes = new Map<string, number>();
      const recentWindow = Date.now() - 5 * 60 * 1000; // Last 5 minutes
      for (const err of recentErrors) {
        if (err.timestamp > recentWindow) {
          recentErrorTypes.set(err.entityType, (recentErrorTypes.get(err.entityType) || 0) + 1);
        }
      }

      const errorSummary = Array.from(recentErrorTypes.entries())
        .map(([type, count]) => `• ${type}: ${count} errors`)
        .join(', ');

      await notifySlack({
        type: 'health_degraded',
        title: '🚨 Semantic Data Layer: High Error Rate',
        severity: errorRate > 0.25 ? 'error' : 'warning',
        message: `Indexing error rate is ${(errorRate * 100).toFixed(1)}%. Total ops: ${metrics.totalOperations}, Failed: ${metrics.failedOperations}. Recent errors: ${errorSummary || 'N/A'}`,
        metadata: {
          totalOperations: metrics.totalOperations,
          failedOperations: metrics.failedOperations,
          successRate: `${((1 - errorRate) * 100).toFixed(1)}%`,
          recentErrorsByType: Object.fromEntries(recentErrorTypes),
        },
      });

      log.info(
        { errorRate: errorRate.toFixed(3), totalOps: metrics.totalOperations },
        '📢 Sent Slack alert for high error rate'
      );
    } catch (alertErr) {
      log.debug({ error: String(alertErr) }, 'Failed to send Slack alert (non-fatal)');
    }
  }
}

/**
 * Get recent errors for diagnostics
 */
export function getRecentErrors(): Array<{ entityType: string; error: string; timestamp: number }> {
  return [...recentErrors];
}

/**
 * Record index freshness for a user
 */
export function recordUserIndexFreshness(userId: string): void {
  freshnessMetrics.lastIndexedAt.set(userId, Date.now());
}

// ============================================================================
// METRICS RETRIEVAL
// ============================================================================

export interface IndexMetricsSummary {
  totalOperations: number;
  successRate: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  lastOperationAt: string | null;
  operationsByEntityType: Record<string, number>;
  errorsByEntityType: Record<string, number>;
}

/**
 * Get current indexing metrics
 */
export function getIndexMetrics(): IndexMetricsSummary {
  const avgLatency =
    metrics.totalOperations > 0 ? metrics.totalLatencyMs / metrics.totalOperations : 0;

  return {
    totalOperations: metrics.totalOperations,
    successRate:
      metrics.totalOperations > 0 ? metrics.successfulOperations / metrics.totalOperations : 1,
    averageLatencyMs: Math.round(avgLatency),
    maxLatencyMs: metrics.maxLatencyMs,
    minLatencyMs: metrics.minLatencyMs === Infinity ? 0 : metrics.minLatencyMs,
    lastOperationAt: metrics.lastOperationAt
      ? new Date(metrics.lastOperationAt).toISOString()
      : null,
    operationsByEntityType: Object.fromEntries(metrics.operationsByEntityType),
    errorsByEntityType: Object.fromEntries(metrics.errorsByEntityType),
  };
}

export interface FreshnessSummary {
  usersTracked: number;
  oldestIndexMs: number;
  newestIndexMs: number;
  averageAgeMs: number;
  staleUsers: string[]; // Users with index older than threshold
}

/**
 * Get index freshness metrics
 * @param staleThresholdMs - Consider index stale after this many ms (default 1 hour)
 */
export function getFreshnessMetrics(staleThresholdMs = 3600_000): FreshnessSummary {
  const now = Date.now();
  const ages: number[] = [];
  const staleUsers: string[] = [];

  for (const [userId, lastIndexed] of freshnessMetrics.lastIndexedAt) {
    const age = now - lastIndexed;
    ages.push(age);
    if (age > staleThresholdMs) {
      staleUsers.push(userId);
    }
  }

  return {
    usersTracked: freshnessMetrics.lastIndexedAt.size,
    oldestIndexMs: ages.length > 0 ? Math.max(...ages) : 0,
    newestIndexMs: ages.length > 0 ? Math.min(...ages) : 0,
    averageAgeMs: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
    staleUsers,
  };
}

// ============================================================================
// INDEX SIZE MONITORING
// ============================================================================

export interface IndexSizeMetrics {
  estimatedDocuments: number;
  documentsPerUser: Record<string, number>;
  largestUsers: Array<{ userId: string; count: number }>;
}

/**
 * Get estimated index size metrics
 * Note: This is an estimate based on tracked operations, not actual store queries
 */
export function getIndexSizeEstimate(): IndexSizeMetrics {
  // This would need to query the actual vector store for accurate counts
  // For now, we track based on operations
  const userCounts = new Map<string, number>();

  // Count operations by user (rough estimate)
  for (const [userId] of freshnessMetrics.lastIndexedAt) {
    userCounts.set(userId, 1); // Would need actual counts
  }

  const sortedUsers = Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([userId, count]) => ({ userId, count }));

  return {
    estimatedDocuments: metrics.successfulOperations,
    documentsPerUser: Object.fromEntries(userCounts),
    largestUsers: sortedUsers,
  };
}

// ============================================================================
// HEALTH CHECK INTEGRATION
// ============================================================================

export interface SemanticHealthStatus {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    recentOperations: boolean;
    lowErrorRate: boolean;
    acceptableLatency: boolean;
    vectorStoreConnected: boolean;
  };
  metrics: IndexMetricsSummary;
  freshness: FreshnessSummary;
  recommendations: string[];
}

/**
 * Comprehensive health check for semantic indexing
 */
export async function getSemanticHealth(): Promise<SemanticHealthStatus> {
  const indexMetrics = getIndexMetrics();
  const freshness = getFreshnessMetrics();
  const recommendations: string[] = [];

  // Check vector store connectivity
  let vectorStoreConnected = false;
  try {
    const vectorStore = getFirestoreVectorStore();
    const healthResult = vectorStore.getHealth();
    vectorStoreConnected = healthResult.healthy;
  } catch {
    vectorStoreConnected = false;
  }

  // Check recent operations (within last 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const recentOperations = metrics.lastOperationAt > fiveMinutesAgo;

  // Check error rate (< 5% is acceptable)
  const lowErrorRate = indexMetrics.successRate >= 0.95;

  // Check latency (< 500ms average is acceptable)
  const acceptableLatency = indexMetrics.averageLatencyMs < 500;

  // Determine overall health
  const checks = {
    recentOperations,
    lowErrorRate,
    acceptableLatency,
    vectorStoreConnected,
  };

  const failedChecks = Object.values(checks).filter((v) => !v).length;
  let status: 'healthy' | 'degraded' | 'unhealthy';

  if (failedChecks === 0) {
    status = 'healthy';
  } else if (failedChecks <= 2) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  // Generate recommendations
  if (!recentOperations && metrics.totalOperations > 0) {
    recommendations.push('No recent indexing operations - check if services are calling hooks');
  }
  if (!lowErrorRate) {
    recommendations.push(
      `High error rate (${((1 - indexMetrics.successRate) * 100).toFixed(1)}%) - investigate failures`
    );
  }
  if (!acceptableLatency) {
    recommendations.push(
      `High latency (${indexMetrics.averageLatencyMs}ms avg) - consider optimization`
    );
  }
  if (!vectorStoreConnected) {
    recommendations.push('Vector store not connected - check Firestore configuration');
  }
  if (freshness.staleUsers.length > 0) {
    recommendations.push(
      `${freshness.staleUsers.length} users have stale indexes - consider re-indexing`
    );
  }

  return {
    healthy: status === 'healthy',
    status,
    checks,
    metrics: indexMetrics,
    freshness,
    recommendations,
  };
}

// ============================================================================
// RESET/CLEAR FUNCTIONS
// ============================================================================

/**
 * Reset all metrics (useful for testing or periodic reset)
 */
export function resetMetrics(): void {
  metrics.totalOperations = 0;
  metrics.successfulOperations = 0;
  metrics.failedOperations = 0;
  metrics.totalLatencyMs = 0;
  metrics.maxLatencyMs = 0;
  metrics.minLatencyMs = Infinity;
  metrics.lastOperationAt = 0;
  metrics.operationsByEntityType.clear();
  metrics.errorsByEntityType.clear();
  freshnessMetrics.lastIndexedAt.clear();
  freshnessMetrics.indexAgeByUser.clear();

  log.info('📊 Metrics reset');
}

/**
 * Record a cleanup run
 */
export function recordCleanupRun(params: {
  documentsDeleted: number;
  durationMs: number;
  success: boolean;
}): void {
  log.info(params, '🧹 TTL cleanup run completed');
}

/**
 * Record a cleanup error
 */
export function recordCleanupError(error: string): void {
  log.error({ error }, '🧹 TTL cleanup error');
}

/**
 * Get monitoring metrics for health endpoint
 */
export function getMonitoringMetrics(): {
  totalIndexed: number;
  totalErrors: number;
  successRate: number;
  byEntityType: Record<string, number>;
  recentErrors: Array<{ entityType: string; error: string; timestamp: string }>;
  avgLatencyMs: number;
} {
  return {
    totalIndexed: metrics.successfulOperations,
    totalErrors: metrics.failedOperations,
    successRate:
      metrics.totalOperations > 0
        ? (metrics.successfulOperations / metrics.totalOperations) * 100
        : 100,
    byEntityType: Object.fromEntries(metrics.operationsByEntityType),
    recentErrors: [], // Would need to track recent errors with timestamps
    avgLatencyMs:
      metrics.totalOperations > 0
        ? Math.round(metrics.totalLatencyMs / metrics.totalOperations)
        : 0,
  };
}

/**
 * Check freshness status for health endpoint
 */
export async function checkFreshness(): Promise<{
  lastIndexedAt: string | null;
  ageMs: number;
  isStale: boolean;
}> {
  const latest = Array.from(freshnessMetrics.lastIndexedAt.values()).sort((a, b) => b - a)[0];

  if (!latest) {
    return { lastIndexedAt: null, ageMs: 0, isStale: false };
  }

  const ageMs = Date.now() - latest;
  const STALE_THRESHOLD_MS = 3600_000; // 1 hour

  return {
    lastIndexedAt: new Date(latest).toISOString(),
    ageMs,
    isStale: ageMs > STALE_THRESHOLD_MS,
  };
}

/**
 * Get overall health status for health endpoint
 */
export function getHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthy: boolean;
} {
  const successRate =
    metrics.totalOperations > 0 ? metrics.successfulOperations / metrics.totalOperations : 1;

  if (successRate >= 0.95) {
    return { status: 'healthy', healthy: true };
  } else if (successRate >= 0.8) {
    return { status: 'degraded', healthy: true };
  }
  return { status: 'unhealthy', healthy: false };
}

/**
 * Export metrics for external monitoring (e.g., Prometheus)
 */
export function exportPrometheusMetrics(): string {
  return exportMetricsForPrometheus();
}

/**
 * Export metrics for external monitoring (e.g., Prometheus)
 * @deprecated Use exportPrometheusMetrics instead
 */
export function exportMetricsForPrometheus(): string {
  const m = getIndexMetrics();
  const f = getFreshnessMetrics();

  return [
    `# HELP semantic_index_operations_total Total indexing operations`,
    `# TYPE semantic_index_operations_total counter`,
    `semantic_index_operations_total ${m.totalOperations}`,
    ``,
    `# HELP semantic_index_success_rate Success rate of indexing operations`,
    `# TYPE semantic_index_success_rate gauge`,
    `semantic_index_success_rate ${m.successRate}`,
    ``,
    `# HELP semantic_index_latency_ms_avg Average indexing latency in milliseconds`,
    `# TYPE semantic_index_latency_ms_avg gauge`,
    `semantic_index_latency_ms_avg ${m.averageLatencyMs}`,
    ``,
    `# HELP semantic_index_users_tracked Number of users with tracked indexes`,
    `# TYPE semantic_index_users_tracked gauge`,
    `semantic_index_users_tracked ${f.usersTracked}`,
    ``,
    `# HELP semantic_index_stale_users Number of users with stale indexes`,
    `# TYPE semantic_index_stale_users gauge`,
    `semantic_index_stale_users ${f.staleUsers.length}`,
  ].join('\n');
}
