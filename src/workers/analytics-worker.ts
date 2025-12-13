/**
 * Analytics Worker
 *
 * Background worker for processing analytics and learning events.
 * Handles community insights, pattern detection, and collective learning
 * without impacting voice agent latency.
 *
 * Responsibilities:
 * - Aggregate interaction patterns
 * - Feed community insights engine
 * - Update agent evolution metrics
 * - Track emotional patterns
 * - Generate learning signals
 *
 * NOTE: Currently uses stub implementations. Will be connected to
 * actual analytics services as they're migrated to this async pattern.
 */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import type { EventPayload } from '../services/async-events/index.js';

// ============================================================================
// ANALYTICS WORKER
// ============================================================================

export class AnalyticsWorker extends LocalWorker {
  // Batch analytics updates for efficiency
  private interactionBatch: EventPayload[] = [];
  private emotionBatch: EventPayload[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  // In-memory stats (will be persisted to analytics store in future)
  private turnCount = 0;
  private interactionCount = 0;
  private emotionCount = 0;

  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'AnalyticsWorker',
      subscriptionName: 'ferni-analytics-sub',
      handleTypes: [
        'analytics:interaction',
        'analytics:emotion-detected',
        'learning:pattern-detected',
        'learning:community-insight',
        'conversation:turn',
      ],
      ...config,
    });
  }

  protected async setup(): Promise<void> {
    await super.setup();

    // Flush batches periodically
    this.flushInterval = setInterval(() => {
      this.flushBatches().catch((err) => {
        this.log.warn({ error: String(err) }, 'Batch flush failed');
      });
    }, 30_000); // Every 30 seconds

    this.log.debug('Batch processing enabled');
  }

  protected async cleanup(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    await this.flushBatches();

    await super.cleanup();
  }

  protected async process(payload: EventPayload): Promise<void> {
    const { type, userId, personaId, data } = payload;

    switch (type) {
      case 'analytics:interaction':
        this.interactionBatch.push(payload);
        if (this.interactionBatch.length >= 50) {
          await this.flushInteractionBatch();
        }
        break;

      case 'analytics:emotion-detected':
        this.emotionBatch.push(payload);
        if (this.emotionBatch.length >= 20) {
          await this.flushEmotionBatch();
        }
        break;

      case 'learning:pattern-detected':
        await this.handlePatternDetected(userId, personaId, data);
        break;

      case 'learning:community-insight':
        await this.handleCommunityInsight(userId, personaId, data);
        break;

      case 'conversation:turn':
        await this.handleTurn(userId, personaId, data);
        break;

      default:
        this.log.debug({ type }, 'Unhandled event type');
    }
  }

  /**
   * Flush all batches.
   */
  private async flushBatches(): Promise<void> {
    await Promise.all([this.flushInteractionBatch(), this.flushEmotionBatch()]);
  }

  /**
   * Flush interaction batch to analytics store.
   * TODO: Connect to actual tool-usage-analytics when refactored
   */
  private async flushInteractionBatch(): Promise<void> {
    if (this.interactionBatch.length === 0) return;

    const batch = [...this.interactionBatch];
    this.interactionBatch = [];

    this.log.debug({ count: batch.length }, 'Flushing interaction batch');

    // Group by user for efficient storage
    const byUser = new Map<string, EventPayload[]>();
    for (const event of batch) {
      const userId = event.userId || 'anonymous';
      const existing = byUser.get(userId) || [];
      existing.push(event);
      byUser.set(userId, existing);
    }

    // For now, just count and log
    // Future: Store aggregated interactions to analytics store
    this.interactionCount += batch.length;

    this.log.debug(
      {
        users: byUser.size,
        interactions: batch.length,
        totalInteractions: this.interactionCount,
      },
      'Interaction batch flushed (stub)'
    );
  }

  /**
   * Flush emotion batch to emotion tracking.
   * TODO: Connect to community-insights when refactored
   */
  private async flushEmotionBatch(): Promise<void> {
    if (this.emotionBatch.length === 0) return;

    const batch = [...this.emotionBatch];
    this.emotionBatch = [];

    this.log.debug({ count: batch.length }, 'Flushing emotion batch');

    // For now, just count and log
    // Future: Use initializeCommunityInsights, record emotional patterns
    this.emotionCount += batch.length;

    this.log.debug(
      {
        emotions: batch.length,
        totalEmotions: this.emotionCount,
      },
      'Emotion batch flushed (stub)'
    );
  }

  /**
   * Handle pattern detection for agent evolution.
   * TODO: Connect to agent-evolution when refactored
   */
  private async handlePatternDetected(
    userId: string | undefined,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ pattern: data.pattern, userId }, 'Processing pattern detection');

    // For now, just log
    // Future: Use initializeAgentEvolution, record patterns

    this.log.debug(
      {
        pattern: data.pattern,
        personaId,
        frequency: data.frequency,
      },
      'Pattern recorded (stub)'
    );
  }

  /**
   * Handle community insight for collective learning.
   * TODO: Connect to community-insights when refactored
   */
  private async handleCommunityInsight(
    userId: string | undefined,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ insight: data.insight, userId }, 'Processing community insight');

    // For now, just log
    // Future: Record to community insights engine

    this.log.debug(
      {
        insight: data.insight,
        personaId,
        sentiment: data.sentiment,
      },
      'Community insight recorded (stub)'
    );
  }

  /**
   * Handle conversation turn for real-time analytics.
   */
  private async handleTurn(
    userId: string | undefined,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    // Lightweight turn tracking - just increment counters
    this.turnCount++;

    // Log every 100 turns
    if (this.turnCount % 100 === 0) {
      this.log.debug({ totalTurns: this.turnCount }, 'Turn milestone');
    }
  }
}

// ============================================================================
// SINGLETON & STARTUP
// ============================================================================

let analyticsWorkerInstance: AnalyticsWorker | null = null;

/**
 * Get the analytics worker instance.
 */
export function getAnalyticsWorker(): AnalyticsWorker {
  if (!analyticsWorkerInstance) {
    analyticsWorkerInstance = new AnalyticsWorker();
  }
  return analyticsWorkerInstance;
}

/**
 * Start the analytics worker.
 */
export async function startAnalyticsWorker(): Promise<AnalyticsWorker> {
  const worker = getAnalyticsWorker();
  await worker.start();
  return worker;
}

export default AnalyticsWorker;
