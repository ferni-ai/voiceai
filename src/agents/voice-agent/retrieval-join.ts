/**
 * Retrieved memories pass the crisis/mode filter's budget (RETRIEVAL_FILTERED=on).
 *
 * processTurn deduplicates and filters the turn's injections
 * (process-turn.ts deduplicateInjections, filterInjections: crisis mode keeps
 * safety first and caps the rest), and the turn handler then appended what
 * memory retrieval found, the background judge's picks included, after it
 * (code-health 2026-10-23, ddd.md 2.6, S10). So the filter never weighed a
 * retrieved memory. With the flag on, what processTurn kept stays exactly as
 * it is (nothing re-filtered, nothing deduplicated against a memory), and
 * the memories are admitted through filterInjections into the budget the kept
 * list leaves, in the turn's mode. The turn counts as a crisis when a safety
 * or crisis injection was kept or the crisis read flagged it (a crisis or a
 * soft check, so a classifier-only crisis gets the crisis budget too).
 * Off: appended after the filter, as before.
 *
 * @module agents/voice-agent/retrieval-join
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import {
  type ConversationMode,
  detectConversationMode,
  filterBudget,
  filterInjections,
} from '../../intelligence/utils/injection-filter.js';
import type { ContextInjection } from '../../types/context-injection-types.js';

/** Retrieved memory is high-priority context. */
export const RETRIEVED_PRIORITY = 80;

export function retrievalFilteredEnabled(env: Env = process.env): boolean {
  return flagOn('RETRIEVAL_FILTERED', env);
}

/** The turn as the filter reads it. */
export interface FilterTurn {
  userText: string;
  emotionalIntensity?: number;
}

/** The turn's crisis read (process-turn.ts result.crisis), as far as this module reads it. */
export interface CrisisRead {
  isCrisis?: boolean;
  softCheck?: boolean;
}

/** The filter's mode for the turn, as process-turn.ts decides it, plus the crisis read. */
export function retrievalMode(
  kept: readonly ContextInjection[],
  turn: FilterTurn,
  crisis?: CrisisRead
): { mode: ConversationMode; crisisDetected: boolean } {
  const crisisDetected =
    Boolean(crisis?.isCrisis || crisis?.softCheck) ||
    kept.some((i) => i.category === 'safety' || i.category === 'crisis_response');
  const mode = detectConversationMode(turn.userText, turn.emotionalIntensity, crisisDetected);
  return { mode, crisisDetected };
}

/** Add the retrieved memories to the turn's injections, within the filter's budget or after it. */
export function joinRetrieved(
  context: { injections: ContextInjection[] },
  retrieved: ReadonlyArray<{ category?: string; content: string }>,
  turn: FilterTurn,
  crisis?: CrisisRead,
  env: Env = process.env
): void {
  const memories = retrieved.map((m) => ({
    category: m.category || 'memory',
    content: m.content,
    priority: RETRIEVED_PRIORITY,
  }));
  if (!retrievalFilteredEnabled(env)) {
    context.injections.push(...memories);
    return;
  }
  const kept = context.injections;
  const { mode, crisisDetected } = retrievalMode(kept, turn, crisis);
  const budget = filterBudget(mode);
  const keptChars = kept.reduce((n, i) => n + i.content.length, 0);
  const admitted = filterInjections(memories, {
    mode,
    userText: turn.userText,
    emotionalIntensity: turn.emotionalIntensity,
    crisisDetected,
    maxInjections: budget.maxInjections - kept.length,
    maxChars: budget.maxChars - keptChars,
  });
  context.injections.push(...admitted);
}
