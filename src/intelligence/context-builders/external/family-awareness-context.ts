/**
 * Family Awareness Context Builder
 *
 * Injects mutual awareness context between family members and sponsors.
 * Enables Ferni to naturally mention relevant information about family
 * members during conversations, with strict privacy boundaries.
 *
 * What CAN be shared:
 * - Emotional state hints: "Your mom seemed happy last time we talked"
 * - Explicit shares: "Your mom asked me to tell you..."
 * - Check-in requests: "Your mom asked me to check on you"
 * - Positive milestones: "Your mom's been walking more - she's doing great"
 *
 * What CANNOT be shared:
 * - Specific conversation content (unless explicitly shared)
 * - Health details beyond general wellness
 * - Financial information
 * - Personal topics marked sensitive
 *
 * @module intelligence/context-builders/external/family-awareness-context
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

const log = createLogger({ module: 'context:family-awareness' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Family awareness context builder.
 * Injects mutual awareness context between family members.
 */
export const familyAwarenessContextBuilder: ContextBuilder = {
  name: 'family-awareness-context',
  category: BuilderCategory.CONTEXT,
  priority: 4, // Run after messages but before general context
  description: 'Surfaces family awareness hints with privacy boundaries',

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const injections: ContextInjection[] = [];
    const userId = input.services?.userId;

    if (!userId) {
      return [];
    }

    try {
      // Get pending shared contexts for this user
      const { getPendingContexts, markContextsDelivered } =
        await import('../../../services/family/family-context-sharing.js');

      const pendingContexts = await getPendingContexts(userId);

      if (pendingContexts.length === 0) {
        return [];
      }

      log.info(
        {
          userId,
          contextCount: pendingContexts.length,
          types: pendingContexts.map((c) => c.type),
        },
        '👨‍👩‍👧 Found family awareness contexts'
      );

      // Group contexts by type for natural delivery
      const explicitShares = pendingContexts.filter((c) => c.type === 'explicit_share');
      const checkInRequests = pendingContexts.filter((c) => c.type === 'check_in_request');
      const thinkingOfYou = pendingContexts.filter((c) => c.type === 'thinking_of_you');
      const emotionalHints = pendingContexts.filter((c) => c.type === 'emotional_state');
      const milestones = pendingContexts.filter((c) => c.type === 'milestone');

      // Build the context injection
      const contextParts: string[] = [];

      // Priority 1: Explicit shares (user specifically asked to share)
      if (explicitShares.length > 0) {
        contextParts.push('EXPLICIT SHARES FROM FAMILY:');
        explicitShares.forEach((ctx) => {
          contextParts.push(
            `- From your ${formatRelationship(ctx.fromRelationship)} ${ctx.fromName}: "${ctx.summary}"`
          );
        });
        contextParts.push('');
      }

      // Priority 2: Check-in requests
      if (checkInRequests.length > 0) {
        contextParts.push('FAMILY CHECK-IN REQUESTS:');
        checkInRequests.forEach((ctx) => {
          contextParts.push(`- ${ctx.summary}`);
        });
        contextParts.push('');
      }

      // Priority 3: Thinking of you mentions
      if (thinkingOfYou.length > 0) {
        contextParts.push('FAMILY MENTIONS:');
        thinkingOfYou.forEach((ctx) => {
          contextParts.push(`- ${ctx.summary}`);
        });
        contextParts.push('');
      }

      // Priority 4: Emotional hints (lower priority, more subtle)
      if (emotionalHints.length > 0) {
        contextParts.push('FAMILY WELLNESS NOTES (use subtly):');
        emotionalHints.forEach((ctx) => {
          contextParts.push(
            `- Your ${formatRelationship(ctx.fromRelationship)} ${ctx.fromName}: ${ctx.summary}`
          );
        });
        contextParts.push('');
      }

      // Priority 5: Positive milestones
      if (milestones.length > 0) {
        contextParts.push('FAMILY MILESTONES:');
        milestones.forEach((ctx) => {
          contextParts.push(
            `- Your ${formatRelationship(ctx.fromRelationship)} ${ctx.fromName}: ${ctx.summary}`
          );
        });
        contextParts.push('');
      }

      if (contextParts.length === 0) {
        return [];
      }

      // Create the main injection
      injections.push(
        createStandardInjection(
          'family_awareness',
          `[FAMILY AWARENESS - PRIVACY PROTECTED]
The following information has been shared or detected from family conversations.
Use this naturally in conversation - don't list it robotically.

${contextParts.join('\n')}

DELIVERY GUIDELINES:
- Weave these naturally into conversation at appropriate moments
- For check-in requests, actually check in on how they're doing
- For explicit shares, deliver the message but don't betray confidences
- For emotional hints, you can mention "Your mom seemed [happy/stressed] last time..."
- NEVER reveal specific conversation content unless explicitly shared
- When in doubt, err on the side of privacy`,
          {
            category: 'family',
          }
        )
      );

      // Mark contexts as delivered
      await markContextsDelivered(pendingContexts.map((c) => c.id));

      log.info(
        {
          userId,
          contextIds: pendingContexts.map((c) => c.id),
        },
        '✅ Marked family awareness contexts as delivered'
      );
    } catch (error) {
      log.error({ error, userId }, 'Failed to load family awareness context');
    }

    return injections;
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function formatRelationship(relationship: string): string {
  const map: Record<string, string> = {
    mother: 'mom',
    father: 'dad',
    grandmother: 'grandma',
    grandfather: 'grandpa',
    grandparent: 'grandparent',
    parent: 'parent',
    sibling: 'sibling',
    child: 'child',
    spouse: 'spouse',
    partner: 'partner',
    friend: 'friend',
    other: '',
  };
  return map[relationship] || relationship;
}

// ============================================================================
// REGISTRATION
// ============================================================================

// Register the builder
registerContextBuilder(familyAwarenessContextBuilder);

export default familyAwarenessContextBuilder;
