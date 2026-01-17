/**
 * Growth Module Observability & Metrics
 *
 * Tracks performance, success rates, and operational metrics
 * for the growth automation system.
 */

// ============================================================================
// METRIC TYPES
// ============================================================================

export interface OperationMetric {
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregatedMetrics {
  totalOperations: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  operationsByType: Record<string, {
    count: number;
    successRate: number;
    avgDuration: number;
  }>;
}

export interface GrowthMetricsSummary {
  period: string;
  content: {
    generated: number;
    posted: number;
    failed: number;
    platforms: Record<string, number>;
  };
  influencers: {
    contacted: number;
    responded: number;
    converted: number;
  };
  tasks: {
    scheduled: number;
    completed: number;
    failed: number;
  };
  apiCalls: {
    reddit: { calls: number; errors: number };
    tiktok: { calls: number; errors: number };
    email: { calls: number; errors: number };
    openai: { calls: number; errors: number };
    anthropic: { calls: number; errors: number };
  };
  performance: AggregatedMetrics;
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

type ApiPlatform = 'reddit' | 'tiktok' | 'email' | 'openai' | 'anthropic';
type ApiCallCounts = Record<ApiPlatform, { calls: number; errors: number }>;

class GrowthMetricsCollector {
  private operations: OperationMetric[] = [];
  private apiCallCounts: ApiCallCounts = {
    reddit: { calls: 0, errors: 0 },
    tiktok: { calls: 0, errors: 0 },
    email: { calls: 0, errors: 0 },
    openai: { calls: 0, errors: 0 },
    anthropic: { calls: 0, errors: 0 },
  };
  private contentStats = {
    generated: 0,
    posted: 0,
    failed: 0,
    platforms: {} as Record<string, number>,
  };
  private influencerStats = {
    contacted: 0,
    responded: 0,
    converted: 0,
  };
  private taskStats = {
    scheduled: 0,
    completed: 0,
    failed: 0,
  };

  /**
   * Start tracking an operation
   */
  startOperation(operation: string, metadata?: Record<string, unknown>): OperationTracker {
    const metric: OperationMetric = {
      operation,
      startTime: Date.now(),
      success: false,
      metadata,
    };
    this.operations.push(metric);
    return new OperationTracker(metric);
  }

  /**
   * Record an API call
   */
  recordApiCall(api: 'reddit' | 'tiktok' | 'email' | 'openai' | 'anthropic', success: boolean): void {
    if (this.apiCallCounts[api]) {
      this.apiCallCounts[api].calls++;
      if (!success) {
        this.apiCallCounts[api].errors++;
      }
    }
  }

  /**
   * Record content generation
   */
  recordContentGenerated(platform: string): void {
    this.contentStats.generated++;
    this.contentStats.platforms[platform] = (this.contentStats.platforms[platform] || 0) + 1;
  }

  /**
   * Record content posted
   */
  recordContentPosted(platform: string): void {
    this.contentStats.posted++;
    this.contentStats.platforms[platform] = (this.contentStats.platforms[platform] || 0) + 1;
  }

  /**
   * Record content posting failure
   */
  recordContentFailed(): void {
    this.contentStats.failed++;
  }

  /**
   * Record influencer outreach
   */
  recordInfluencerContacted(): void {
    this.influencerStats.contacted++;
  }

  /**
   * Record influencer response
   */
  recordInfluencerResponded(): void {
    this.influencerStats.responded++;
  }

  /**
   * Record influencer conversion
   */
  recordInfluencerConverted(): void {
    this.influencerStats.converted++;
  }

  /**
   * Record task scheduled
   */
  recordTaskScheduled(): void {
    this.taskStats.scheduled++;
  }

  /**
   * Record task completed
   */
  recordTaskCompleted(): void {
    this.taskStats.completed++;
  }

  /**
   * Record task failed
   */
  recordTaskFailed(): void {
    this.taskStats.failed++;
  }

  /**
   * Get aggregated metrics for completed operations
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const completed = this.operations.filter(op => op.endTime !== undefined);

    if (completed.length === 0) {
      return {
        totalOperations: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        operationsByType: {},
      };
    }

    const durations = completed
      .map(op => op.duration || 0)
      .sort((a, b) => a - b);

    const successCount = completed.filter(op => op.success).length;
    const failureCount = completed.length - successCount;

    // Group by operation type
    const byType: Record<string, OperationMetric[]> = {};
    for (const op of completed) {
      if (!byType[op.operation]) {
        byType[op.operation] = [];
      }
      byType[op.operation].push(op);
    }

    const operationsByType: Record<string, { count: number; successRate: number; avgDuration: number }> = {};
    for (const [type, ops] of Object.entries(byType)) {
      const typeSuccess = ops.filter(op => op.success).length;
      const typeDurations = ops.map(op => op.duration || 0);
      operationsByType[type] = {
        count: ops.length,
        successRate: ops.length > 0 ? typeSuccess / ops.length : 0,
        avgDuration: typeDurations.length > 0
          ? typeDurations.reduce((a, b) => a + b, 0) / typeDurations.length
          : 0,
      };
    }

    return {
      totalOperations: completed.length,
      successCount,
      failureCount,
      successRate: completed.length > 0 ? successCount / completed.length : 0,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50Duration: percentile(durations, 50),
      p95Duration: percentile(durations, 95),
      p99Duration: percentile(durations, 99),
      operationsByType,
    };
  }

  /**
   * Get full metrics summary
   */
  getSummary(): GrowthMetricsSummary {
    return {
      period: new Date().toISOString(),
      content: { ...this.contentStats },
      influencers: { ...this.influencerStats },
      tasks: { ...this.taskStats },
      apiCalls: { ...this.apiCallCounts },
      performance: this.getAggregatedMetrics(),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.operations = [];
    this.apiCallCounts = {
      reddit: { calls: 0, errors: 0 },
      tiktok: { calls: 0, errors: 0 },
      email: { calls: 0, errors: 0 },
      openai: { calls: 0, errors: 0 },
      anthropic: { calls: 0, errors: 0 },
    } as ApiCallCounts;
    this.contentStats = {
      generated: 0,
      posted: 0,
      failed: 0,
      platforms: {},
    };
    this.influencerStats = {
      contacted: 0,
      responded: 0,
      converted: 0,
    };
    this.taskStats = {
      scheduled: 0,
      completed: 0,
      failed: 0,
    };
  }

  /**
   * Get recent operations (last N)
   */
  getRecentOperations(limit = 100): OperationMetric[] {
    return this.operations.slice(-limit);
  }

  /**
   * Get failed operations
   */
  getFailedOperations(): OperationMetric[] {
    return this.operations.filter(op => !op.success && op.endTime !== undefined);
  }
}

// ============================================================================
// OPERATION TRACKER
// ============================================================================

/**
 * Tracks a single operation's lifecycle
 */
export class OperationTracker {
  constructor(private metric: OperationMetric) {}

  /**
   * Mark operation as successful
   */
  success(metadata?: Record<string, unknown>): void {
    this.metric.endTime = Date.now();
    this.metric.duration = this.metric.endTime - this.metric.startTime;
    this.metric.success = true;
    if (metadata) {
      this.metric.metadata = { ...this.metric.metadata, ...metadata };
    }
  }

  /**
   * Mark operation as failed
   */
  failure(error: string, metadata?: Record<string, unknown>): void {
    this.metric.endTime = Date.now();
    this.metric.duration = this.metric.endTime - this.metric.startTime;
    this.metric.success = false;
    this.metric.error = error;
    if (metadata) {
      this.metric.metadata = { ...this.metric.metadata, ...metadata };
    }
  }

  /**
   * Get current duration (for in-progress operations)
   */
  getCurrentDuration(): number {
    return Date.now() - this.metric.startTime;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let metricsInstance: GrowthMetricsCollector | null = null;

/**
 * Get the global metrics collector instance
 */
export function getGrowthMetrics(): GrowthMetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new GrowthMetricsCollector();
  }
  return metricsInstance;
}

/**
 * Reset the global metrics (useful for testing)
 */
export function resetGrowthMetrics(): void {
  metricsInstance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Track an async operation with automatic success/failure handling
 */
export async function trackOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const tracker = getGrowthMetrics().startOperation(operation, metadata);
  try {
    const result = await fn();
    tracker.success();
    return result;
  } catch (error) {
    tracker.failure(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Format metrics summary for console output
 */
export function formatMetricsSummary(summary: GrowthMetricsSummary): string {
  const lines: string[] = [];

  lines.push('📊 Growth Metrics Summary');
  lines.push(`   Period: ${summary.period}`);
  lines.push('');

  lines.push('📝 Content');
  lines.push(`   Generated: ${summary.content.generated}`);
  lines.push(`   Posted: ${summary.content.posted}`);
  lines.push(`   Failed: ${summary.content.failed}`);
  if (Object.keys(summary.content.platforms).length > 0) {
    lines.push('   By Platform:');
    for (const [platform, count] of Object.entries(summary.content.platforms)) {
      lines.push(`     ${platform}: ${count}`);
    }
  }
  lines.push('');

  lines.push('🤝 Influencers');
  lines.push(`   Contacted: ${summary.influencers.contacted}`);
  lines.push(`   Responded: ${summary.influencers.responded}`);
  lines.push(`   Converted: ${summary.influencers.converted}`);
  lines.push('');

  lines.push('📋 Tasks');
  lines.push(`   Scheduled: ${summary.tasks.scheduled}`);
  lines.push(`   Completed: ${summary.tasks.completed}`);
  lines.push(`   Failed: ${summary.tasks.failed}`);
  lines.push('');

  lines.push('🔌 API Calls');
  for (const [api, stats] of Object.entries(summary.apiCalls)) {
    const errorRate = stats.calls > 0 ? ((stats.errors / stats.calls) * 100).toFixed(1) : '0.0';
    lines.push(`   ${api}: ${stats.calls} calls, ${stats.errors} errors (${errorRate}% error rate)`);
  }
  lines.push('');

  lines.push('⚡ Performance');
  const perf = summary.performance;
  lines.push(`   Total Operations: ${perf.totalOperations}`);
  lines.push(`   Success Rate: ${(perf.successRate * 100).toFixed(1)}%`);
  lines.push(`   Avg Duration: ${perf.averageDuration.toFixed(0)}ms`);
  lines.push(`   P50: ${perf.p50Duration.toFixed(0)}ms`);
  lines.push(`   P95: ${perf.p95Duration.toFixed(0)}ms`);
  lines.push(`   P99: ${perf.p99Duration.toFixed(0)}ms`);

  if (Object.keys(perf.operationsByType).length > 0) {
    lines.push('   By Operation:');
    for (const [op, stats] of Object.entries(perf.operationsByType)) {
      lines.push(`     ${op}: ${stats.count}x, ${(stats.successRate * 100).toFixed(0)}% success, ${stats.avgDuration.toFixed(0)}ms avg`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export { GrowthMetricsCollector };
