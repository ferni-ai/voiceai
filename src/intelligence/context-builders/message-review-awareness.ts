/**
 * Message Review Awareness Context Builder
 *
 * Injects pending message draft context into Alex's context.
 * Reminds Alex about messages waiting for review.
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';
import { registerContextBuilder, createStandardInjection } from './index.js';
import { BuilderCategory } from './categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getPendingDrafts,
  getDraftsReadyForReview,
} from '../../services/message-validation/message-validation-service.js';

const log = createLogger({ module: 'context:message-review-awareness' });

export const messageReviewAwarenessBuilder: ContextBuilder = {
  name: 'message-review-awareness',
  description: 'Injects pending message draft context for Alex.',
  priority: 43, // After contact awareness
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData } = input;

    // Only activate for Alex
    if (persona.identity.id !== 'alex-chen') {
      return [];
    }

    const userId = userData.userId;
    if (!userId) {
      return [];
    }

    try {
      const [pending, ready] = await Promise.all([
        getPendingDrafts(userId),
        getDraftsReadyForReview(userId),
      ]);

      // Only inject if there's something
      if (pending.length === 0) {
        return [];
      }

      let content = `Alex, message drafts to be aware of:\n`;

      // Ready for review - high priority
      if (ready.length > 0) {
        content += `\nREADY FOR REVIEW (wait time elapsed):\n`;
        ready.forEach((draft) => {
          content += `- Message to ${draft.recipient}`;
          if (draft.analysis.riskScore >= 50) {
            content += ` (was flagged as ${draft.analysis.dominantTone})`;
          }
          content += '\n';
        });
        content += 'Consider proactively mentioning these are ready.\n';
      }

      // Still waiting
      const stillWaiting = pending.filter((d) => !ready.find((r) => r.id === d.id));
      if (stillWaiting.length > 0) {
        content += `\nStill in cooling off:\n`;
        const now = new Date();
        stillWaiting.slice(0, 3).forEach((draft) => {
          const hoursLeft = Math.ceil((draft.waitUntil.getTime() - now.getTime()) / (1000 * 60 * 60));
          content += `- To ${draft.recipient} (~${hoursLeft}h left)\n`;
        });
      }

      log.debug({ userId, pendingCount: pending.length, readyCount: ready.length }, 'Injected message review context');

      return [
        createStandardInjection('message_review_awareness', content, {
          category: 'messages',
          priority: 43,
        }),
      ];
    } catch (error) {
      log.error({ userId, error }, 'Failed to build message review awareness context');
      return [];
    }
  },
};

registerContextBuilder(messageReviewAwarenessBuilder);

