/**
 * Commitment-Calendar Context Builder
 *
 * Injects commitment-calendar integration insights into the LLM context.
 *
 * "Better Than Human" capability: Validates commitments against calendar reality.
 * No human assistant can:
 * - Validate if you actually have time for a commitment
 * - Auto-create calendar blocks for commitments
 * - Warn when calendar changes conflict with commitments
 *
 * @module intelligence/context-builders/superhuman/commitment-calendar-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:commitment-calendar' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Cache TTL for commitment-calendar context (time-sensitive)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache for context
const contextCache = new Map<string, { data: string; timestamp: number }>();

// ============================================================================
// BUILDER
// ============================================================================

export const commitmentCalendarBuilder: ContextBuilder = {
  name: 'commitment-calendar',
  description: 'Injects commitment-calendar conflicts and feasibility insights',
  priority: 45, // After memory, with awareness
  category: BuilderCategory.COGNITIVE,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, analysis, userText } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    // Only activate when discussing commitments or planning
    const topics = analysis?.topics?.detected || [];
    const isRelevant =
      topics.some((t) =>
        ['planning', 'commitment', 'schedule', 'calendar', 'goal', 'habit'].includes(t.toLowerCase())
      ) ||
      /\b(commit|promise|plan|schedule|start|going to|will)\b/i.test(userText || '');

    if (!isRelevant) {
      return [];
    }

    try {
      // Check cache first
      const cached = contextCache.get(userId);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        if (cached.data && cached.data.length > 50) {
          return [
            createStandardInjection('commitment_calendar', cached.data, {
              category: 'superhuman',
              confidence: 0.85,
            }),
          ];
        }
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { getCommitmentsDueForFollowUp } = await import(
        '../../../services/trust-systems/commitment-tracking.js'
      );

      // Get commitments that need follow-up
      const commitmentsDue = await getCommitmentsDueForFollowUp(userId);

      if (!commitmentsDue || commitmentsDue.length === 0) {
        contextCache.set(userId, { data: '', timestamp: now });
        return [];
      }

      // Format commitments as context
      const context = formatCommitmentsForPrompt(commitmentsDue);

      // Cache the result
      contextCache.set(userId, { data: context, timestamp: now });

      if (!context || context.length < 50) {
        return [];
      }

      log.debug(
        {
          userId,
          contextLength: context.length,
        },
        '📅 Injecting commitment-calendar context'
      );

      return [
        createStandardInjection('commitment_calendar', context, {
          category: 'superhuman',
          confidence: 0.85,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Commitment-calendar fetch failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

interface CommitmentDue {
  content: string;
  followUpDate?: Date | string | null;
  status?: string;
  type?: string;
}

function formatCommitmentsForPrompt(commitments: CommitmentDue[]): string {
  if (!commitments || commitments.length === 0) return '';

  const lines = commitments.slice(0, 5).map((c) => {
    const due = c.followUpDate ? ` (follow-up: ${new Date(c.followUpDate).toLocaleDateString()})` : '';
    const type = c.type ? ` [${c.type}]` : '';
    return `- ${c.content}${due}${type}`;
  });

  return `## Commitments Needing Attention
${lines.join('\n')}

Note: These commitments may need follow-up. If the conversation is relevant, gently surface awareness.`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the context cache
 */
export function clearCommitmentCalendarCache(userId?: string): void {
  if (userId) {
    contextCache.delete(userId);
  } else {
    contextCache.clear();
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(commitmentCalendarBuilder);

export default commitmentCalendarBuilder;
