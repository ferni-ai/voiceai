/**
 * Runs everything that learns from a finished, summarized conversation:
 * personal insights (people, threads, predictions), preferences, and health &
 * mood (with consent).
 *
 * Called from session end and from the catch-up job (dropped calls), so a
 * conversation is mined the same way however it ended. Never throws; each
 * hook is isolated.
 *
 * @module services/memory/conversation-summarized-hooks
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'conversation-summarized-hooks' });

export interface SummarizedConversationTurn {
  readonly role: string;
  readonly content?: string;
  readonly text?: string;
}

export async function runConversationSummarizedHooks(
  userId: string,
  conversationId: string,
  summary: string,
  turns: readonly SummarizedConversationTurn[]
): Promise<void> {
  if (!userId || userId === 'anonymous' || !conversationId) return;
  const simple = turns.map((t) => ({ role: t.role, text: t.text ?? t.content ?? '' }));

  const hooks: Array<[string, () => Promise<unknown>]> = [
    [
      'personal-insights',
      async () => {
        const { onConversationSummarized } = await import('../personal-insights/index.js');
        return onConversationSummarized(userId, conversationId, summary, simple);
      },
    ],
    [
      'user-preferences',
      async () => {
        const { onConversationSummarized } = await import('../user-preferences/index.js');
        return onConversationSummarized(userId, conversationId, summary, simple);
      },
    ],
    [
      // Health & mood: only with the user's Health consent (checked inside).
      'health-memory',
      async () => {
        const { onConversationSummarized } = await import('../health-memory/index.js');
        return onConversationSummarized(userId, conversationId, summary, simple);
      },
    ],
  ];

  for (const [name, run] of hooks) {
    try {
      await run();
    } catch (error) {
      log.warn({ hook: name, conversationId, error: String(error) }, 'Summarized hook failed');
    }
  }
}
