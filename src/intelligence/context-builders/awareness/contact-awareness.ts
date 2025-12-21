/**
 * Contact Awareness Context Builder
 *
 * Injects contact relationship insights into Alex's context.
 * Helps Alex proactively mention relationship health and follow-ups.
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../index.js';
import { registerContextBuilder, createStandardInjection } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getRelationshipInsights,
  getContactsNeedingAttention,
} from '../../../services/contacts/contact-relationship-service.js';

const log = createLogger({ module: 'context:contact-awareness' });

export const contactAwarenessBuilder: ContextBuilder = {
  name: 'contact-awareness',
  description: 'Injects contact relationship insights for Alex.',
  priority: 44, // After calendar awareness
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData } = input;

    // Only activate for Alex
    if (persona.id !== 'alex-chen') {
      return [];
    }

    const userId = input.services?.userId || 'anonymous';
    if (userId === 'anonymous') {
      return [];
    }

    try {
      const [insights, needsAttention] = await Promise.all([
        getRelationshipInsights(userId),
        getContactsNeedingAttention(userId, 3),
      ]);

      // Only inject if there's something worth mentioning
      if (insights.length === 0 && needsAttention.length === 0) {
        return [];
      }

      let content = `Alex, here's relationship context to consider:\n`;

      // High priority insights
      const highPriority = insights.filter((i) => i.priority === 'high');
      if (highPriority.length > 0) {
        content += `\nUrgent relationship matters:\n`;
        highPriority.slice(0, 2).forEach((insight) => {
          content += `- ${insight.message}\n`;
        });
      }

      // Contacts needing attention
      if (needsAttention.length > 0) {
        content += `\nContacts that could use attention:\n`;
        const now = new Date();
        needsAttention.forEach((contact) => {
          const daysSince = Math.floor(
            (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
          );
          content += `- ${contact.name} (${daysSince} days since last contact)`;
          if (contact.pendingFollowUp && !contact.pendingFollowUp.completed) {
            content += ` - Follow-up pending`;
          }
          content += '\n';
        });
      }

      log.debug({ userId, insightCount: insights.length }, 'Injected contact awareness context');

      return [
        createStandardInjection('contact_awareness', content, {
          category: 'contacts',
          confidence: 0.7,
        }),
      ];
    } catch (error) {
      log.error({ userId, error }, 'Failed to build contact awareness context');
      return [];
    }
  },
};

registerContextBuilder(contactAwarenessBuilder);
