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
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import type { EventPayload } from '../services/async-events/index.js';

// Trust system imports
import {
  getUnsaidProfile,
  getAvoidedTopics,
  recordDidShare,
} from '../services/trust-systems/reading-between-lines.js';
import {
  getGrowthPatterns,
  getUnreflectedGrowth,
  generateGrowthReflection,
} from '../services/trust-systems/growth-reflection.js';
import {
  getUncelebratedWins,
  getPendingIntentions,
  generateCelebration,
} from '../services/trust-systems/small-wins.js';
import { getDueMoments } from '../services/trust-systems/thinking-of-you.js';
import { saveTrustProfiles, periodicSync } from '../services/trust-systems/persistence.js';

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

    switch (type) {
      case 'trust:update':
        await this.handleTrustUpdate(userId, personaId, data);
        break;

      case 'trust:milestone':
        await this.handleTrustMilestone(userId, personaId, data);
        break;

      case 'relationship:stage-change':
        await this.handleRelationshipChange(userId, personaId, data);
        break;

      case 'conversation:end':
        await this.handleConversationEnd(userId, personaId, data);
        break;

      default:
        this.log.debug({ type }, 'Unhandled event type');
    }
  }

  /**
   * Handle incremental trust update.
   * Records trust-building interactions and persists to Firestore.
   */
  private async handleTrustUpdate(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ userId, personaId, trustDelta: data.trustDelta }, 'Processing trust update');

    try {
      // If user shared something significant, record it
      if (data.didShare === true) {
        recordDidShare(userId);
        this.log.debug({ userId }, 'Recorded user share');
      }

      // Trigger periodic sync to persist any in-memory changes
      await periodicSync(userId);

      this.log.debug({ userId, reason: data.reason }, 'Trust update recorded');
    } catch (error) {
      this.log.warn({ userId, error: String(error) }, 'Failed to process trust update');
    }
  }

  /**
   * Handle trust milestone (significant achievement).
   * Triggers celebration momentum and thinking-of-you moments.
   */
  private async handleTrustMilestone(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.info({ userId, personaId, milestone: data.milestone }, 'Trust milestone reached');

    try {
      // Get any uncelebrated wins to potentially celebrate
      const uncelebratedWins = getUncelebratedWins(userId);
      const firstWin = uncelebratedWins[0];
      if (firstWin != null) {
        const celebration = generateCelebration(userId, firstWin);
        if (celebration) {
          this.log.info(
            { userId, winType: firstWin.type, celebration: celebration.celebration },
            'Generated celebration for milestone'
          );
        }
      }

      // Check for thinking-of-you moments to schedule
      const dueMoments = getDueMoments(userId);
      if (dueMoments.length > 0) {
        this.log.info(
          { userId, momentCount: dueMoments.length },
          'Found due thinking-of-you moments'
        );
      }

      // Persist all trust changes
      await saveTrustProfiles(userId);

      this.log.info({ userId, milestone: data.milestone }, 'Milestone processed');
    } catch (error) {
      this.log.warn({ userId, error: String(error) }, 'Failed to process trust milestone');
    }
  }

  /**
   * Handle relationship stage change.
   * Triggers growth reflection and updates trust profile.
   */
  private async handleRelationshipChange(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    const { from, to } = data as { from?: string; to?: string };

    this.log.info({ userId, from, to }, 'Relationship stage change');

    try {
      // Get growth patterns to potentially reflect back
      const growthPatterns = getGrowthPatterns(userId);
      const unreflectedGrowth = getUnreflectedGrowth(userId);

      if (unreflectedGrowth.length > 0) {
        // Generate growth reflection for the most significant unreflected pattern
        const reflection = generateGrowthReflection(userId, {
          currentTopic: data.currentTopic as string | undefined,
          currentEmotion: data.currentEmotion as string | undefined,
        });

        if (reflection) {
          this.log.info(
            {
              userId,
              reflectionType: reflection.pattern?.type ?? 'unknown',
              timing: reflection.timing,
            },
            'Generated growth reflection for stage change'
          );
        }
      }

      this.log.debug(
        {
          userId,
          totalPatterns: growthPatterns.length,
          unreflected: unreflectedGrowth.length,
        },
        'Growth patterns analyzed'
      );

      // Persist changes
      await saveTrustProfiles(userId);

      this.log.info({ userId, from, to }, 'Stage transition recorded');
    } catch (error) {
      this.log.warn({ userId, error: String(error) }, 'Failed to process relationship change');
    }
  }

  /**
   * Handle conversation end - run post-conversation analysis.
   * Aggregates insights from reading-between-lines, small-wins, and thinking-of-you.
   */
  private async handleConversationEnd(
    userId: string,
    personaId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    this.log.debug({ userId, turnCount: data.turnCount }, 'Processing conversation end');

    try {
      // 1. Reading between lines: Get unsaid profile and avoided topics
      const unsaidProfile = getUnsaidProfile(userId);
      const avoidedTopics = getAvoidedTopics(userId);

      if (unsaidProfile) {
        this.log.debug(
          {
            userId,
            avoidedTopicsCount: avoidedTopics.length,
            falseFinesCount: unsaidProfile.falseFines.length,
          },
          'Retrieved unsaid profile'
        );
      }

      // 2. Small wins: Check for uncelebrated wins and pending intentions
      const uncelebratedWins = getUncelebratedWins(userId);
      const pendingIntentions = getPendingIntentions(userId);

      if (uncelebratedWins.length > 0 || pendingIntentions.length > 0) {
        this.log.debug(
          {
            userId,
            uncelebratedWins: uncelebratedWins.length,
            pendingIntentions: pendingIntentions.length,
          },
          'Retrieved wins and intentions'
        );
      }

      // 3. Thinking of you: Get due moments for proactive outreach
      const dueMoments = getDueMoments(userId);
      if (dueMoments.length > 0) {
        this.log.info(
          {
            userId,
            dueMomentsCount: dueMoments.length,
            nextMomentType: dueMoments[0]?.type,
          },
          'Found due thinking-of-you moments'
        );
      }

      // 4. Persist all trust profiles
      const persistResult = await saveTrustProfiles(userId);

      this.log.info(
        {
          userId,
          turnCount: data.turnCount,
          durationMs: data.durationMs,
          savedProfiles: persistResult.saved,
          failedProfiles: persistResult.failed,
        },
        'Conversation end processed'
      );
    } catch (error) {
      this.log.warn({ userId, error: String(error) }, 'Failed to process conversation end');
    }
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
