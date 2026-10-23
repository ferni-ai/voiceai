/**
 * Turn Processor - Context Injection & Celebration Events
 *
 * Injects turn processing results into the LLM context and
 * extracts celebration events for frontend visual feedback.
 */

import type { llm } from '@livekit/agents';
import { withRevivedIntelligence } from '../../../intelligence/revived/revived-intelligence.js';
import { DEDUP_PROTECTED_CATEGORIES } from '../../../intelligence/utils/injection-filter.js';
import { safetyNoteId } from '../../multi-agent/safety-notes.js';
import { MAX_PUSHED_CONTEXT_CHARS } from '../../multi-agent/turn-context-header.js';
import type { TurnProcessorResult } from '../types.js';

/**
 * Inject turn processing results into the LLM context
 *
 * Call this after processTurn() to add all context injections to the chat.
 */
export function injectTurnContext(
  turnCtx: llm.ChatContext,
  result: TurnProcessorResult,
  turn?: { sessionId: string; turnNumber: number }
): void {
  // What Ferni knows from earlier calls (REVIVED_INTELLIGENCE), already loaded.
  const injections = withRevivedIntelligence(result.context.injections, {
    sessionId: turn?.sessionId,
    turn: turn?.turnNumber,
    crisis: result.crisis?.isCrisis,
    maxChars: MAX_PUSHED_CONTEXT_CHARS,
  });

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

  // On a crisis or soft-check turn the protected guidance is its own note, ahead
  // of the rest, so the pushed-note cut keeps it whole (#2618, safety-notes.ts).
  const safetyTurn = Boolean(result.crisis?.isCrisis || result.crisis?.softCheck);
  const isSafety = (inj: { category: string }): boolean =>
    safetyTurn && DEDUP_PROTECTED_CATEGORIES.has(inj.category);
  const join = (list: typeof injections): string => list.map((inj) => inj.content).join('\n\n');
  const safety = injections.filter(isSafety);
  const rest = injections.filter((inj) => !isSafety(inj));
  if (safety.length > 0)
    turnCtx.addMessage({ role: 'user', content: join(safety), id: safetyNoteId() });
  if (rest.length > 0) turnCtx.addMessage({ role: 'user', content: join(rest) });
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
