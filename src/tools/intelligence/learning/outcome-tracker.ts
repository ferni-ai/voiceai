/**
 * Outcome Tracker
 *
 * Tracks tool selection and execution outcomes for learning.
 * Feeds data to transition matrix and router model retraining.
 *
 * @module tools/intelligence/learning/outcome-tracker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { StepResult } from '../execution/types.js';

const log = createLogger({ module: 'ftis:outcome-tracker' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool outcome record
 */
export interface ToolOutcome {
  /** Unique ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Turn ID within session */
  turnId: string;
  /** Tool that was called */
  toolId: string;
  /** The query that led to this tool */
  query: string;
  /** How the tool was selected */
  selectedBy: 'router' | 'semantic' | 'hybrid' | 'mcts' | 'direct';
  /** Confidence of selection */
  confidence: number;
  /** Whether tool was executed */
  wasExecuted: boolean;
  /** Whether execution succeeded */
  executionSuccess: boolean;
  /** Execution latency in ms */
  executionLatencyMs: number;
  /** Whether user continued conversation */
  userContinued: boolean;
  /** Tools called in follow-up turns */
  followUpTools: string[];
  /** Active persona */
  personaId: string;
  /** Detected emotion */
  emotion?: string;
  /** Time of day */
  timeOfDay?: string;
  /** When this outcome was recorded */
  createdAt: Date;
}

/**
 * Aggregated metrics for a time period
 */
export interface AggregatedMetrics {
  period: string; // YYYY-MM-DD or YYYY-WW
  toolCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  avgConfidence: number;
  toolDistribution: Record<string, number>;
  selectionMethodDistribution: Record<string, number>;
  successRateByMethod: Record<string, number>;
}

/**
 * Tracker configuration
 */
export interface TrackerConfig {
  /** Firestore collection name */
  collectionName: string;
  /** Buffer size before flush */
  bufferSize: number;
  /** Flush interval in ms */
  flushIntervalMs: number;
  /** Keep outcomes in memory for analysis */
  keepInMemory: boolean;
  /** Max in-memory outcomes */
  maxInMemory: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: TrackerConfig = {
  collectionName: 'tool_outcomes',
  bufferSize: 50,
  flushIntervalMs: 30000,
  keepInMemory: true,
  maxInMemory: 1000,
};

// ============================================================================
// OUTCOME TRACKER
// ============================================================================

export class OutcomeTracker {
  private config: TrackerConfig;
  private db: FirebaseFirestore.Firestore | null = null;

  // Buffered outcomes for batch writing
  private buffer: ToolOutcome[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  // In-memory outcomes for analysis
  private recentOutcomes: ToolOutcome[] = [];

  // Metrics
  private totalTracked = 0;
  private totalFlushed = 0;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with Firestore
   */
  async initialize(db: FirebaseFirestore.Firestore): Promise<void> {
    this.db = db;
    this.startFlushTimer();
    log.info('Outcome tracker initialized');
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch((e) => log.error({ error: String(e) }, 'Flush failed'));
    }, this.config.flushIntervalMs);
  }

  // ==========================================================================
  // TRACKING
  // ==========================================================================

  /**
   * Track a tool outcome
   */
  track(outcome: Omit<ToolOutcome, 'id' | 'createdAt'>): void {
    const fullOutcome: ToolOutcome = {
      ...outcome,
      id: `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
    };

    // Add to buffer
    this.buffer.push(fullOutcome);
    this.totalTracked++;

    // Keep in memory for analysis
    if (this.config.keepInMemory) {
      this.recentOutcomes.push(fullOutcome);
      if (this.recentOutcomes.length > this.config.maxInMemory) {
        this.recentOutcomes.shift();
      }
    }

    // Flush if buffer full
    if (this.buffer.length >= this.config.bufferSize) {
      this.flush().catch((e) => log.error({ error: String(e) }, 'Flush failed'));
    }
  }

  /**
   * Track from execution result
   */
  trackFromResult(
    result: StepResult,
    context: {
      sessionId: string;
      turnId: string;
      query: string;
      selectedBy: ToolOutcome['selectedBy'];
      confidence: number;
      personaId: string;
      emotion?: string;
    }
  ): void {
    this.track({
      sessionId: context.sessionId,
      turnId: context.turnId,
      toolId: result.toolId,
      query: context.query,
      selectedBy: context.selectedBy,
      confidence: context.confidence,
      wasExecuted: true,
      executionSuccess: result.success,
      executionLatencyMs: result.durationMs,
      userContinued: true, // Default, updated later
      followUpTools: [],
      personaId: context.personaId,
      emotion: context.emotion,
    });
  }

  /**
   * Update an outcome with follow-up information
   */
  updateFollowUp(
    outcomeId: string,
    updates: {
      userContinued?: boolean;
      followUpTools?: string[];
    }
  ): void {
    // Update in memory
    const outcome = this.recentOutcomes.find((o) => o.id === outcomeId);
    if (outcome) {
      if (updates.userContinued !== undefined) {
        outcome.userContinued = updates.userContinued;
      }
      if (updates.followUpTools) {
        outcome.followUpTools = updates.followUpTools;
      }
    }

    // Note: Firestore updates would need a separate method
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Flush buffer to Firestore
   */
  async flush(): Promise<number> {
    if (this.buffer.length === 0 || !this.db) {
      return 0;
    }

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      // Batch write
      const batch = this.db.batch();

      for (const outcome of toFlush) {
        const docRef = this.db.collection(this.config.collectionName).doc(outcome.id);
        batch.set(docRef, cleanForFirestore(outcome));
      }

      await batch.commit();
      this.totalFlushed += toFlush.length;

      log.debug({ count: toFlush.length }, 'Flushed outcomes to Firestore');
      return toFlush.length;
    } catch (error) {
      // Put back in buffer on failure
      this.buffer = [...toFlush, ...this.buffer];
      log.error({ error: String(error) }, 'Failed to flush outcomes');
      return 0;
    }
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Get aggregated metrics for recent outcomes
   */
  getRecentMetrics(): AggregatedMetrics {
    return this.aggregateOutcomes(this.recentOutcomes, 'recent');
  }

  /**
   * Get metrics for a specific tool
   */
  getToolMetrics(toolId: string): {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
    avgConfidence: number;
  } {
    const toolOutcomes = this.recentOutcomes.filter((o) => o.toolId === toolId);

    if (toolOutcomes.length === 0) {
      return { totalCalls: 0, successRate: 0, avgLatencyMs: 0, avgConfidence: 0 };
    }

    const successes = toolOutcomes.filter((o) => o.executionSuccess).length;
    const avgLatency =
      toolOutcomes.reduce((s, o) => s + o.executionLatencyMs, 0) / toolOutcomes.length;
    const avgConfidence = toolOutcomes.reduce((s, o) => s + o.confidence, 0) / toolOutcomes.length;

    return {
      totalCalls: toolOutcomes.length,
      successRate: successes / toolOutcomes.length,
      avgLatencyMs: avgLatency,
      avgConfidence,
    };
  }

  /**
   * Get selection method accuracy
   */
  getSelectionMethodAccuracy(): Record<string, number> {
    const methods = ['router', 'semantic', 'hybrid', 'mcts', 'direct'] as const;
    const accuracy: Record<string, number> = {};

    for (const method of methods) {
      const outcomes = this.recentOutcomes.filter((o) => o.selectedBy === method);
      if (outcomes.length > 0) {
        const successes = outcomes.filter((o) => o.executionSuccess).length;
        accuracy[method] = successes / outcomes.length;
      }
    }

    return accuracy;
  }

  /**
   * Aggregate outcomes into metrics
   */
  private aggregateOutcomes(outcomes: ToolOutcome[], period: string): AggregatedMetrics {
    const metrics: AggregatedMetrics = {
      period,
      toolCalls: outcomes.length,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      avgConfidence: 0,
      toolDistribution: {},
      selectionMethodDistribution: {},
      successRateByMethod: {},
    };

    if (outcomes.length === 0) {
      return metrics;
    }

    let totalLatency = 0;
    let totalConfidence = 0;
    const methodSuccesses: Record<string, number> = {};
    const methodCounts: Record<string, number> = {};

    for (const outcome of outcomes) {
      // Success/failure counts
      if (outcome.executionSuccess) {
        metrics.successCount++;
      } else {
        metrics.failureCount++;
      }

      // Totals for averages
      totalLatency += outcome.executionLatencyMs;
      totalConfidence += outcome.confidence;

      // Tool distribution
      metrics.toolDistribution[outcome.toolId] =
        (metrics.toolDistribution[outcome.toolId] || 0) + 1;

      // Selection method distribution
      metrics.selectionMethodDistribution[outcome.selectedBy] =
        (metrics.selectionMethodDistribution[outcome.selectedBy] || 0) + 1;

      // Track successes by method
      methodCounts[outcome.selectedBy] = (methodCounts[outcome.selectedBy] || 0) + 1;
      if (outcome.executionSuccess) {
        methodSuccesses[outcome.selectedBy] = (methodSuccesses[outcome.selectedBy] || 0) + 1;
      }
    }

    // Calculate averages
    metrics.avgLatencyMs = totalLatency / outcomes.length;
    metrics.avgConfidence = totalConfidence / outcomes.length;

    // Calculate success rate by method
    for (const method of Object.keys(methodCounts)) {
      metrics.successRateByMethod[method] = (methodSuccesses[method] || 0) / methodCounts[method];
    }

    return metrics;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Shutdown the tracker
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
    log.info(
      { totalTracked: this.totalTracked, totalFlushed: this.totalFlushed },
      'Outcome tracker shutdown'
    );
  }

  /**
   * Clear in-memory data
   */
  clear(): void {
    this.recentOutcomes = [];
    this.buffer = [];
  }

  /**
   * Get tracker statistics
   */
  getStats(): {
    totalTracked: number;
    totalFlushed: number;
    bufferSize: number;
    inMemorySize: number;
  } {
    return {
      totalTracked: this.totalTracked,
      totalFlushed: this.totalFlushed,
      bufferSize: this.buffer.length,
      inMemorySize: this.recentOutcomes.length,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let trackerInstance: OutcomeTracker | null = null;

export function getOutcomeTracker(): OutcomeTracker {
  if (!trackerInstance) {
    trackerInstance = new OutcomeTracker();
  }
  return trackerInstance;
}

export async function initializeOutcomeTracker(
  db: FirebaseFirestore.Firestore,
  config?: Partial<TrackerConfig>
): Promise<OutcomeTracker> {
  trackerInstance = new OutcomeTracker(config);
  await trackerInstance.initialize(db);
  return trackerInstance;
}

export function resetOutcomeTracker(): void {
  if (trackerInstance) {
    trackerInstance.shutdown().catch(() => {});
  }
  trackerInstance = null;
}
