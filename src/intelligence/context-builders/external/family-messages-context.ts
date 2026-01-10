/**
 * Family Messages Context Builder
 *
 * Injects pending family messages into the sponsor's conversation context.
 * This enables Ferni to naturally deliver messages from family members
 * during the sponsor's next conversation.
 *
 * Example:
 * - Mom calls and says "Tell Seth I'm thinking of him"
 * - Message is stored as pending
 * - Next time Seth talks to Ferni, this builder injects:
 *   "Your mom left you a message: 'I'm thinking of you'"
 * - Ferni naturally weaves this into the conversation
 *
 * @module intelligence/context-builders/external/family-messages-context
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:family-messages' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Family messages context builder.
 * Injects pending messages from family phone callers for the sponsor.
 */
export const familyMessagesContextBuilder: ContextBuilder = {
  name: 'family-messages-context',
  category: BuilderCategory.CONTEXT,
  priority: 3, // Run early to surface messages
  description: 'Surfaces pending messages from family phone callers',

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const injections: ContextInjection[] = [];
    const userId = input.services?.userId;

    if (!userId) {
      return [];
    }

    try {
      // Dynamically import to avoid circular dependencies
      const { getPendingMessages, formatMessagesForDelivery, markMessagesDelivered } =
        await import('../../../services/family/family-messages.js');

      const pendingMessages = await getPendingMessages(userId);

      if (pendingMessages.length === 0) {
        return [];
      }

      log.info(
        {
          userId,
          messageCount: pendingMessages.length,
          fromNames: pendingMessages.map((m) => m.fromName),
        },
        '📬 Found pending family messages'
      );

      // Format messages for the agent
      const formattedMessages = formatMessagesForDelivery(pendingMessages);

      // Create injection with message content
      injections.push(
        createStandardInjection(
          'family_messages_pending',
          `[FAMILY MESSAGES - DELIVER NATURALLY]
You have ${pendingMessages.length} message${pendingMessages.length > 1 ? 's' : ''} from family to deliver:

${formattedMessages}

DELIVERY GUIDANCE:
- Find a natural moment early in the conversation to share these
- Don't just read them robotically - weave them into the conversation
- After delivering, you can ask how the user feels about the message
- If there are multiple messages, you can deliver them together or space them out
- Example: "Oh, before we get into things - your mom left you a sweet message earlier..."

The messages will be marked as delivered after this conversation.`,
          {
            priority: 9, // High priority - messages should be delivered
            category: 'family',
            source: 'family-messages-context',
          }
        )
      );

      // Add a secondary injection with structured data for tools
      injections.push(
        createStandardInjection(
          'family_messages_data',
          `[FAMILY MESSAGE DATA]
${JSON.stringify(
  pendingMessages.map((m) => ({
    id: m.id,
    from: m.fromName,
    relationship: m.fromRelationship,
    content: m.content,
    timeAgo: getTimeAgo(m.createdAt),
  })),
  null,
  2
)}`,
          {
            priority: 5,
            category: 'family',
            source: 'family-messages-context',
          }
        )
      );

      // Mark messages as delivered (they'll be shown in this conversation)
      // Note: We mark them now to prevent duplicate delivery if builder runs twice
      await markMessagesDelivered(pendingMessages.map((m) => m.id));

      log.info(
        {
          userId,
          messageIds: pendingMessages.map((m) => m.id),
        },
        '✅ Marked family messages as delivered'
      );
    } catch (error) {
      log.error({ error, userId }, 'Failed to load family messages');
    }

    return injections;
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 5) return 'just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 2) return 'about an hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return 'last week';
}

// ============================================================================
// REGISTRATION
// ============================================================================

// Register the builder
registerContextBuilder(familyMessagesContextBuilder);

export default familyMessagesContextBuilder;
