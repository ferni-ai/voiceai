/**
 * Tool Usage Analytics Service
 *
 * Tracks tool usage across sessions to identify:
 * - Tools that are never used (candidates for removal)
 * - Most frequently used tools (ensure always loaded)
 * - Tool confusion patterns (consolidation candidates)
 * - Tool performance metrics (latency, success rate)
 *
 * Data is persisted to Firestore for historical analysis.
 */

import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
}

interface CollectionRef {
  doc: (id: string) => DocumentRef;
  get: () => Promise<QuerySnapshot>;
  orderBy: (field: string, direction?: 'asc' | 'desc') => CollectionRef;
  limit: (count: number) => CollectionRef;
  where: (field: string, op: string, value: unknown) => CollectionRef;
}

interface DocumentRef {
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  update: (data: unknown) => Promise<void>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => unknown | undefined;
  id: string;
}

interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

interface Transaction {
  get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => void;
  update: (ref: DocumentRef, data: unknown) => void;
}

/**
 * Tool usage record for a single call
 */
export interface ToolCallRecord {
  toolId: string;
  agentId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  domain: string;
}

/**
 * Aggregated tool stats
 */
export interface ToolStats {
  toolId: string;
  domain: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  lastUsed: Date;
  usedByAgents: string[];
  usedByUserCount: number;
}

/**
 * Tool usage report for analysis
 */
export interface ToolUsageReport {
  timestamp: Date;
  totalTools: number;
  unusedTools: string[];
  topTools: Array<{ toolId: string; calls: number }>;
  slowTools: Array<{ toolId: string; avgLatencyMs: number }>;
  errorProneTools: Array<{ toolId: string; errorRate: number }>;
  recommendations: string[];
}

// ============================================================================
// IN-MEMORY BUFFER
// ============================================================================

/**
 * In-memory buffer for tool calls (flushed to Firestore periodically)
 */
const callBuffer: ToolCallRecord[] = [];
const BUFFER_FLUSH_SIZE = 50;
const BUFFER_FLUSH_INTERVAL_MS = 60000; // 1 minute

/**
 * In-memory stats cache (updated on each call)
 */
const statsCache = new Map<string, ToolStats>();

// ============================================================================
// ANALYTICS SERVICE
// ============================================================================

const TOOL_ANALYTICS_FLUSH_INTERVAL = 'tool-usage-analytics-flush';

class ToolUsageAnalyticsService {
  private db: FirestoreDB | null = null;
  private initialized = false;

  // Firestore collections
  private readonly TOOL_CALLS = 'tool_usage_calls';
  private readonly TOOL_STATS = 'tool_usage_stats';
  private readonly TOOL_REPORTS = 'tool_usage_reports';

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with Firestore connection
   */
  async initialize(db?: FirestoreDB): Promise<void> {
    if (this.initialized) return;

    if (db) {
      this.db = db;
    } else {
      // Try to initialize Firestore
      try {
        const { Firestore } = await import('@google-cloud/firestore');
        this.db = new Firestore({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        }) as unknown as FirestoreDB;
      } catch (error) {
        getLogger().warn(
          { error },
          'Firestore not available, tool analytics will be in-memory only'
        );
      }
    }

    // Start periodic flush using managed interval
    registerInterval(
      TOOL_ANALYTICS_FLUSH_INTERVAL,
      () => {
        this.flushBuffer().catch((err) =>
          getLogger().warn({ err }, 'Failed to flush tool analytics buffer')
        );
      },
      BUFFER_FLUSH_INTERVAL_MS
    );

    // Load existing stats into cache
    await this.loadStatsCache();

    this.initialized = true;
    getLogger().info('Tool usage analytics initialized');
  }

  /**
   * Shutdown and flush remaining data
   */
  async shutdown(): Promise<void> {
    clearNamedInterval(TOOL_ANALYTICS_FLUSH_INTERVAL);

    await this.flushBuffer();
    getLogger().info('Tool usage analytics shut down');
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Record a tool call
   */
  recordToolCall(record: ToolCallRecord): void {
    // Add to buffer
    callBuffer.push(record);

    // Update in-memory stats
    this.updateStatsCache(record);

    // Log for debugging
    getLogger().debug(
      {
        tool: record.toolId,
        agent: record.agentId,
        latency: record.latencyMs,
        success: record.success,
      },
      '📊 Tool call recorded'
    );

    // Flush if buffer is full
    if (callBuffer.length >= BUFFER_FLUSH_SIZE) {
      this.flushBuffer().catch((err) =>
        getLogger().warn({ err }, 'Failed to flush tool analytics buffer')
      );
    }
  }

  /**
   * Quick helper to record a tool call with timing
   */
  async trackToolExecution<T>(
    toolId: string,
    domain: string,
    agentId: string,
    userId: string,
    sessionId: string,
    executeFn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let errorType: string | undefined;

    try {
      return await executeFn();
    } catch (error) {
      success = false;
      errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      throw error;
    } finally {
      this.recordToolCall({
        toolId,
        domain,
        agentId,
        userId,
        sessionId,
        timestamp: new Date(),
        latencyMs: Date.now() - startTime,
        success,
        errorType,
      });
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get stats for a specific tool
   */
  getToolStats(toolId: string): ToolStats | undefined {
    return statsCache.get(toolId);
  }

  /**
   * Get all tool stats
   */
  getAllStats(): ToolStats[] {
    return Array.from(statsCache.values());
  }

  /**
   * Get top tools by usage
   */
  getTopTools(limit = 10): Array<{ toolId: string; calls: number }> {
    const stats = this.getAllStats();
    return stats
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, limit)
      .map((s) => ({ toolId: s.toolId, calls: s.totalCalls }));
  }

  /**
   * Get unused tools (zero calls)
   */
  getUnusedTools(): string[] {
    return this.getAllStats()
      .filter((s) => s.totalCalls === 0)
      .map((s) => s.toolId);
  }

  /**
   * Get slowest tools
   */
  getSlowestTools(limit = 10): Array<{ toolId: string; avgLatencyMs: number }> {
    const stats = this.getAllStats();
    return stats
      .filter((s) => s.totalCalls > 0)
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
      .slice(0, limit)
      .map((s) => ({ toolId: s.toolId, avgLatencyMs: s.avgLatencyMs }));
  }

  /**
   * Get tools with high error rates
   */
  getErrorProneTools(
    minCalls = 5,
    minErrorRate = 0.1
  ): Array<{ toolId: string; errorRate: number }> {
    const stats = this.getAllStats();
    return stats
      .filter((s) => s.totalCalls >= minCalls)
      .map((s) => ({
        toolId: s.toolId,
        errorRate: s.failureCount / s.totalCalls,
      }))
      .filter((s) => s.errorRate >= minErrorRate)
      .sort((a, b) => b.errorRate - a.errorRate);
  }

  // ==========================================================================
  // REPORTS
  // ==========================================================================

  /**
   * Generate a usage report with recommendations
   */
  async generateReport(): Promise<ToolUsageReport> {
    const allStats = this.getAllStats();
    const unusedTools = this.getUnusedTools();
    const topTools = this.getTopTools(20);
    const slowTools = this.getSlowestTools(10);
    const errorProneTools = this.getErrorProneTools();

    const recommendations: string[] = [];

    // Unused tools recommendation
    if (unusedTools.length > 10) {
      recommendations.push(
        `🗑️ ${unusedTools.length} tools have never been used. Consider removing: ${unusedTools.slice(0, 5).join(', ')}...`
      );
    }

    // Slow tools recommendation
    const verySlowTools = slowTools.filter((t) => t.avgLatencyMs > 5000);
    if (verySlowTools.length > 0) {
      recommendations.push(
        `🐢 ${verySlowTools.length} tools have >5s avg latency: ${verySlowTools.map((t) => t.toolId).join(', ')}`
      );
    }

    // Error-prone tools recommendation
    if (errorProneTools.length > 0) {
      recommendations.push(
        `⚠️ ${errorProneTools.length} tools have >10% error rate: ${errorProneTools.map((t) => `${t.toolId} (${(t.errorRate * 100).toFixed(1)}%)`).join(', ')}`
      );
    }

    // Tool consolidation recommendation
    const domainCounts = new Map<string, number>();
    for (const stat of allStats) {
      domainCounts.set(stat.domain, (domainCounts.get(stat.domain) || 0) + 1);
    }
    for (const [domain, count] of domainCounts) {
      if (count > 15) {
        recommendations.push(
          `🔧 Domain "${domain}" has ${count} tools. Consider consolidating to ~10.`
        );
      }
    }

    const report: ToolUsageReport = {
      timestamp: new Date(),
      totalTools: allStats.length,
      unusedTools,
      topTools,
      slowTools,
      errorProneTools,
      recommendations,
    };

    // Save report to Firestore
    if (this.db) {
      try {
        const reportId = `report_${Date.now()}`;
        await this.db
          .collection(this.TOOL_REPORTS)
          .doc(reportId)
          .set(
            removeUndefined({
              ...report,
              timestamp: report.timestamp.toISOString(),
            } as Record<string, unknown>)
          );
        getLogger().info({ reportId }, 'Tool usage report saved');
      } catch (error) {
        getLogger().warn({ error }, 'Failed to save tool usage report');
      }
    }

    return report;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Update in-memory stats cache
   */
  private updateStatsCache(record: ToolCallRecord): void {
    let stats = statsCache.get(record.toolId);

    if (!stats) {
      stats = {
        toolId: record.toolId,
        domain: record.domain,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        lastUsed: record.timestamp,
        usedByAgents: [],
        usedByUserCount: 0,
      };
      statsCache.set(record.toolId, stats);
    }

    // Update counts
    stats.totalCalls++;
    if (record.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }

    // Update average latency (running average)
    stats.avgLatencyMs =
      (stats.avgLatencyMs * (stats.totalCalls - 1) + record.latencyMs) / stats.totalCalls;

    // Update last used
    stats.lastUsed = record.timestamp;

    // Track agents
    if (!stats.usedByAgents.includes(record.agentId)) {
      stats.usedByAgents.push(record.agentId);
    }
  }

  /**
   * Load existing stats from Firestore into cache
   */
  private async loadStatsCache(): Promise<void> {
    if (!this.db) return;

    try {
      const snapshot = await this.db.collection(this.TOOL_STATS).get();

      for (const doc of snapshot.docs) {
        const data = doc.data() as ToolStats;
        if (data && data.toolId) {
          // Convert stored date strings back to Date objects
          data.lastUsed = new Date(data.lastUsed as unknown as string);
          statsCache.set(data.toolId, data);
        }
      }

      getLogger().info({ toolCount: statsCache.size }, 'Loaded tool stats cache');
    } catch (error) {
      getLogger().warn({ error }, 'Failed to load tool stats cache');
    }
  }

  /**
   * Flush buffer to Firestore
   */
  private async flushBuffer(): Promise<void> {
    if (callBuffer.length === 0) return;

    const toFlush = callBuffer.splice(0, callBuffer.length);

    if (!this.db) {
      // No Firestore, just log
      getLogger().debug({ count: toFlush.length }, 'Flushed tool calls (in-memory only)');
      return;
    }

    try {
      // Batch save call records
      // FIX: Remove undefined values which Firestore doesn't accept
      const batchId = `batch_${Date.now()}`;
      await this.db
        .collection(this.TOOL_CALLS)
        .doc(batchId)
        .set(
          removeUndefined({
            calls: toFlush.map((c) =>
              // Use removeUndefined to filter out ALL undefined fields
              removeUndefined({
                toolId: c.toolId,
                agentId: c.agentId,
                userId: c.userId,
                sessionId: c.sessionId,
                timestamp: c.timestamp.toISOString(),
                latencyMs: c.latencyMs,
                success: c.success,
                domain: c.domain,
                errorType: c.errorType,
              })
            ),
            createdAt: new Date().toISOString(),
          })
        );

      // Update stats documents
      for (const stats of statsCache.values()) {
        await this.db
          .collection(this.TOOL_STATS)
          .doc(stats.toolId)
          .set(
            removeUndefined({
              ...stats,
              lastUsed: stats.lastUsed.toISOString(),
              updatedAt: new Date().toISOString(),
            } as Record<string, unknown>),
            { merge: true }
          );
      }

      getLogger().debug({ count: toFlush.length }, 'Flushed tool calls to Firestore');
    } catch (error) {
      // Put calls back in buffer on failure
      callBuffer.unshift(...toFlush);
      getLogger().warn({ error, count: toFlush.length }, 'Failed to flush tool calls');
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const toolUsageAnalytics = new ToolUsageAnalyticsService();

/**
 * Quick helper to record a tool call (for use in tool executors)
 */
export function recordToolUsage(
  toolId: string,
  domain: string,
  ctx: { agentId?: string; userId?: string; sessionId?: string },
  latencyMs: number,
  success: boolean,
  errorType?: string
): void {
  toolUsageAnalytics.recordToolCall({
    toolId,
    domain,
    agentId: ctx.agentId || 'unknown',
    userId: ctx.userId || 'anonymous',
    sessionId: ctx.sessionId || 'unknown',
    timestamp: new Date(),
    latencyMs,
    success,
    errorType,
  });
}

export default toolUsageAnalytics;
