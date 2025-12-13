/**
 * Trust Worker
 *
 * Background worker for processing trust system updates.
 * Handles all "Better Than Human" trust capabilities asynchronously:
 * - Reading between lines analysis
 * - Boundary memory updates
 * - Growth reflection tracking
 * - Inside joke detection
 * - Small wins celebration
 * - Thinking of you triggers
 *
 * This runs independently of the voice agent, ensuring trust
 * updates don't add latency to conversations.
 *
 * NOTE: Currently uses stub implementations. Will be connected to
 * actual trust systems as they're migrated to this async pattern.
 */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import type { EventPayload } from '../services/async-events/index.js';

// ============================================================================
// TRUST WORKER
// ============================================================================

export class TrustWorker extends LocalWorker {
  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'TrustWorker',
      subscriptionName: 'ferni-trust-sub',
      handleTypes: [
        'trust:update',
        'trust:milestone',
        'relationship:stage-change',
        'conversation:end',
      ],
      ...config,
    });
  }

  protected async process(payload: EventPayload): Promise<void> {
    const { type, userId, personaId, data } = payload;

    if (!userId) {
      this.log.debug({ type }, 'Skipping event without userId');
      return;
    }

    // Await a resolved promise to satisfy the async requirement
    await Promise.resolve();

    switch (type) {
      case 'trust:update':
        this.handleTrustUpdate(userId, personaId, data);
        break;

      case 'trust:milestone':
        this.handleTrustMilestone(userId, personaId, data);
        break;

      case 'relationship:stage-change':
        this.handleRelationshipChange(userId, personaId, data);
        break;

      case 'conversation:end':
        this.handleConversationEnd(userId, personaId, data);
        break;

      default:
        this.log.debug({ type }, 'Unhandled event type');
    }
  }

  /**
   * Handle incremental trust update.
   * TODO: Connect to actual trust orchestrator when available
   */
  private handleTrustUpdate(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): void {
    this.log.debug({ userId, personaId, trustDelta: data.trustDelta }, 'Processing trust update');

    // For now, just log the update
    // Future: Connect to trust orchestrator
    // const orchestrator = await getTrustOrchestrator(userId);
    // await orchestrator.recordInteraction({ ... });

    this.log.debug({ userId, reason: data.reason }, 'Trust update recorded (stub)');
  }

  /**
   * Handle trust milestone (significant achievement).
   * TODO: Connect to actual milestone tracking when available
   */
  private handleTrustMilestone(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): void {
    this.log.info({ userId, personaId, milestone: data.milestone }, 'Trust milestone reached');

    // For now, just log the milestone
    // Future: Connect to celebration momentum, thinking-of-you triggers

    this.log.info({ userId, milestone: data.milestone }, 'Milestone recorded (stub)');
  }

  /**
   * Handle relationship stage change.
   * TODO: Connect to growth reflection service when refactored
   */
  private handleRelationshipChange(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): void {
    const { from, to } = data as { from?: string; to?: string };

    this.log.info({ userId, from, to }, 'Relationship stage change');

    // For now, just log the change
    // Future: Use getGrowthPatterns, getUnreflectedGrowth to generate insights

    this.log.info({ userId, from, to }, 'Stage transition recorded (stub)');
  }

  /**
   * Handle conversation end - run post-conversation analysis.
   * TODO: Connect to reading-between-lines, small-wins when refactored
   */
  private handleConversationEnd(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): void {
    this.log.debug({ userId, turnCount: data.turnCount }, 'Processing conversation end');

    // For now, just log the conversation end
    // Future integrations:
    // - Reading between lines: getUnsaidProfile, getAvoidedTopics
    // - Small wins: getUncelebratedWins, getPendingIntentions
    // - Thinking of you: getDueMoments

    this.log.debug(
      {
        userId,
        turnCount: data.turnCount,
        durationMs: data.durationMs,
      },
      'Conversation end processed (stub)'
    );
  }
}

// ============================================================================
// SINGLETON & STARTUP
// ============================================================================

let trustWorkerInstance: TrustWorker | null = null;

/**
 * Get the trust worker instance.
 */
export function getTrustWorker(): TrustWorker {
  if (!trustWorkerInstance) {
    trustWorkerInstance = new TrustWorker();
  }
  return trustWorkerInstance;
}

/**
 * Start the trust worker.
 * Call this during application startup.
 */
export async function startTrustWorker(): Promise<TrustWorker> {
  const worker = getTrustWorker();
  await worker.start();
  return worker;
}

export default TrustWorker;
