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
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import type { EventPayload } from '../services/async-events/index.js';

// Analytics service imports
import {
  getCommunityInsights,
  saveCommunityInsightsToFirestore,
} from '../intelligence/collective/community-insights.js';
// cleanForFirestore removed - not used in this worker
import {
  getAgentEvolution,
  saveAgentEvolutionToFirestore,
} from '../intelligence/agent-evolution.js';

// ============================================================================
// ANALYTICS WORKER
// ============================================================================

export class AnalyticsWorker extends LocalWorker {
  // Batch analytics updates for efficiency
  private interactionBatch: EventPayload[] = [];
  private emotionBatch: EventPayload[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  // In-memory stats
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

  protected override async cleanup(): Promise<void> {
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
        this.handleTurn(userId, personaId, data);
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
   * Records engagement signals for community learning.
   */
  private async flushInteractionBatch(): Promise<void> {
    if (this.interactionBatch.length === 0) return;

    const batch = [...this.interactionBatch];
    this.interactionBatch = [];

    this.log.debug({ count: batch.length }, 'Flushing interaction batch');

    try {
      const communityInsights = getCommunityInsights();

      // Group by user for efficient storage
      const byUser = new Map<string, EventPayload[]>();
      for (const event of batch) {
        const userId = event.userId || 'anonymous';
        const existing = byUser.get(userId) || [];
        existing.push(event);
        byUser.set(userId, existing);
      }

      // Record engagement signals to community insights
      for (const [, events] of byUser) {
        for (const event of events) {
          const { personaId } = event;
          const responseType = (event.data.responseType as string) || 'general';
          const topic = (event.data.topic as string) || 'unknown';
          const engagementScore = (event.data.engagementScore as number) ?? 0.5;

          if (personaId) {
            communityInsights.recordEngagementSignal({
              personaId,
              responseType,
              topic,
              engagementScore,
              timestamp: new Date(),
            });
          }
        }
      }

      // Persist analytics
      await saveCommunityInsightsToFirestore();

      this.interactionCount += batch.length;

      this.log.debug(
        {
          users: byUser.size,
          interactions: batch.length,
          totalInteractions: this.interactionCount,
        },
        'Interaction batch flushed'
      );
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Failed to flush interaction batch');
    }
  }

  /**
   * Flush emotion batch to community insights.
   * Records response strategy signals for collective learning.
   */
  private async flushEmotionBatch(): Promise<void> {
    if (this.emotionBatch.length === 0) return;

    const batch = [...this.emotionBatch];
    this.emotionBatch = [];

    this.log.debug({ count: batch.length }, 'Flushing emotion batch');

    try {
      const communityInsights = getCommunityInsights();

      for (const event of batch) {
        const emotion = event.data.emotion as string | undefined;
        const topic = (event.data.topic as string) || 'general';
        const { personaId } = event;
        const engagementScore = (event.data.engagementScore as number) ?? 0.5;

        if (emotion && personaId) {
          // Record as engagement signal (emotion detection is a type of engagement)
          communityInsights.recordEngagementSignal({
            personaId,
            responseType: `emotion_${emotion}`,
            topic,
            engagementScore,
            timestamp: new Date(),
          });
        }
      }

      // Persist community insights
      await saveCommunityInsightsToFirestore();

      this.emotionCount += batch.length;

      this.log.debug(
        {
          emotions: batch.length,
          totalEmotions: this.emotionCount,
        },
        'Emotion batch flushed'
      );
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Failed to flush emotion batch');
    }
  }

  /**
   * Handle pattern detection for agent evolution.
   * Creates adjustments from detected patterns to improve AI behavior.
   */
  private async handlePatternDetected(
    userId: string | undefined,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ pattern: data.pattern, userId }, 'Processing pattern detection');

    try {
      const agentEvolution = getAgentEvolution();

      if (personaId != null && data.bestStrategy != null) {
        // Create adjustment from detected pattern
        agentEvolution.createAdjustmentFromCommunityPattern(personaId, {
          context: {
            userEmotion: data.userEmotion as string | undefined,
            topic: data.topic as string | undefined,
            relationshipStage: data.relationshipStage as string | undefined,
          },
          bestStrategy: data.bestStrategy as string,
          improvement: (data.improvement as number) ?? 0.1,
          confidence: (data.confidence as number) ?? 0.5,
        });
      }

      // Update story rankings for this persona
      if (personaId) {
        agentEvolution.updateStoryRankings(personaId);
      }

      // Persist changes
      await saveAgentEvolutionToFirestore();

      this.log.debug(
        {
          pattern: data.pattern,
          personaId,
          bestStrategy: data.bestStrategy,
        },
        'Pattern recorded as adjustment'
      );
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Failed to handle pattern detection');
    }
  }

  /**
   * Handle community insight for collective learning.
   * Records response signals that improve responses across all users.
   */
  private async handleCommunityInsight(
    userId: string | undefined,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ insight: data.insight, userId }, 'Processing community insight');

    try {
      const communityInsights = getCommunityInsights();

      if (personaId != null && data.topic != null) {
        // Record as engagement signal
        communityInsights.recordEngagementSignal({
          personaId,
          responseType: (data.responseType as string) || 'insight',
          topic: data.topic as string,
          engagementScore: (data.engagementScore as number) ?? 0.7,
          timestamp: new Date(),
        });
      }

      // Persist changes
      await saveCommunityInsightsToFirestore();

      this.log.debug(
        {
          insight: data.insight,
          personaId,
          topic: data.topic,
        },
        'Community insight recorded'
      );
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Failed to handle community insight');
    }
  }

  /**
   * Handle conversation turn for real-time analytics.
   */
  private handleTurn(
    _userId: string | undefined,
    _personaId: string | undefined,
    _data: Record<string, unknown>
  ): void {
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
