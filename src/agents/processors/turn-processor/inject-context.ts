/**
 * Turn Processor - Context Injection & Celebration Events
 *
 * Injects turn processing results into the LLM context and
 * extracts celebration events for frontend visual feedback.
 */

import type { llm } from '@livekit/agents';
import type { TurnProcessorResult } from '../types.js';

/**
 * Inject turn processing results into the LLM context
 *
 * Call this after processTurn() to add all context injections to the chat.
 */
export function injectTurnContext(turnCtx: llm.ChatContext, result: TurnProcessorResult): void {
  const { injections } = result.context;

  if (injections.length === 0) return;

  // DEBUG: Log all injections being added
  const debugInjections = process.env.DEBUG_INJECTIONS === 'true';
  if (debugInjections) {
    const totalChars = injections.reduce((sum, inj) => sum + inj.content.length, 0);
    const categories = injections.map((inj) => `${inj.category}(${inj.content.length})`).join(', ');
    process.stderr.write(`\n${'='.repeat(80)}\n`);
    process.stderr.write(
      `[INJECTION DEBUG] ${injections.length} injections, ${totalChars} chars total\n`
    );
    process.stderr.write(`[INJECTION DEBUG] Categories: ${categories}\n`);
    process.stderr.write(`${'='.repeat(80)}\n`);

    // Log each injection content (truncated)
    for (const inj of injections) {
      const preview = inj.content.slice(0, 200).replace(/\n/g, ' ');
      process.stderr.write(`[${inj.category}] (priority ${inj.priority}): ${preview}...\n`);
    }
    process.stderr.write(`${'='.repeat(80)}\n\n`);
  }

  // Combine all injection content
  const combinedContent = injections.map((inj) => inj.content).join('\n\n');

  turnCtx.addMessage({
    role: 'user',
    content: combinedContent,
  });
}

/**
 * Get celebration events from context injections
 * (For sending visual feedback to frontend)
 */
export function getCelebrationEvents(
  result: TurnProcessorResult
): Array<{ category: string; content: string }> {
  const celebrationCategories = ['milestone', 'achievement', 'aha_moment', 'good_news'];

  return result.context.injections
    .filter((inj) => celebrationCategories.includes(inj.category))
    .map((inj) => ({ category: inj.category, content: inj.content }));
}
