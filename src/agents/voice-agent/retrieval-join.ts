/**
 * Retrieved memories join the turn's injections before the dedup and the
 * crisis/mode filter (RETRIEVAL_FILTERED=on).
 *
 * processTurn deduplicates and filters the turn's injections
 * (process-turn.ts deduplicateInjections, filterInjections: crisis mode keeps
 * safety first and caps the rest), and the turn handler then appended what
 * memory retrieval found, the background judge's picks included, after it
 * (code-health 2026-10-23, ddd.md 2.6, S10). So the crisis filter and the
 * dedup never saw a retrieved memory. With the flag on the memories join the
 * turn's injections and the joined list goes through the same dedup and
 * filter, with the turn's mode, so what the filter would leave out stays out.
 * Off: appended after the filter, as before.
 *
 * @module agents/voice-agent/retrieval-join
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import {
  deduplicateInjections,
  detectConversationMode,
  filterInjections,
} from '../../intelligence/utils/injection-filter.js';
import type { ContextInjection } from '../../types/context-injection-types.js';

/** Retrieved memory is high-priority context. */
export const RETRIEVED_PRIORITY = 80;

export function retrievalFilteredEnabled(env: Env = process.env): boolean {
  return flagOn('RETRIEVAL_FILTERED', env);
}

/** The turn as the filter reads it: the caller's words and how intense they were. */
export interface FilterTurn {
  userText: string;
  emotionalIntensity?: number;
}

/** Add the retrieved memories to the turn's injections, before or after the filter. */
export function joinRetrieved(
  context: { injections: ContextInjection[] },
  retrieved: ReadonlyArray<{ category?: string; content: string }>,
  turn: FilterTurn,
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
  const joined = [...context.injections, ...memories];
  // As process-turn.ts decides it: a safety or crisis injection makes this a crisis turn.
  const crisisDetected = joined.some(
    (i) => i.category === 'safety' || i.category === 'crisis_response'
  );
  const mode = detectConversationMode(turn.userText, turn.emotionalIntensity, crisisDetected);
  context.injections = filterInjections(deduplicateInjections(joined), {
    mode,
    userText: turn.userText,
    emotionalIntensity: turn.emotionalIntensity,
    crisisDetected,
  });
}
