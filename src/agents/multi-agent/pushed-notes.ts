/**
 * Safety guidance in the pushed turn-context note (turn-intelligence.ts) is
 * never cut (#2618). The note is capped at MAX_PUSHED_CONTEXT_CHARS; a raw
 * slice of the joined notes cut crisis_response mid-sentence and dropped the
 * safety injection whenever a note added earlier in the turn (the cross-domain
 * correlations note) sat ahead of it.
 *
 * Safety notes are the ones marked by safety-note.ts (carriesSafety). They go
 * first, in full; the other notes keep their order and get what budget is
 * left. A turn with no safety note is cut exactly as before.
 *
 * Nor is it lost later (#2642): safety notes still waiting are carried into the
 * next held note, and a note the stale drop removes keeps its safety part.
 *
 * @module agents/multi-agent/pushed-notes
 */
import { carriesSafety } from '../processors/turn-processor/safety-note.js';
import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PUSHED_CONTEXT_CHARS } from './turn-context-header.js';

const log = createLogger({ module: 'PushedNotes' });

export interface TurnNote {
  /** It carries crisis or safety guidance (safety-note.ts carriesSafety). */
  safety?: boolean;
  text: string;
}

/** The notes a turn's pass added to its chat context, in order; empty ones dropped. */
export const turnNotes = (items: readonly object[]): TurnNote[] =>
  items
    .map((item) => ({
      safety: carriesSafety(item as never),
      text: (item as { textContent?: string }).textContent?.trim() ?? '',
    }))
    .filter((note) => note.text !== '');

/** The safety guidance among these notes, whole, in order. */
export const safetyText = (notes: readonly TurnNote[]): string =>
  notes
    .filter((note) => note.safety)
    .map((note) => note.text)
    .join('\n\n');

/** The body of the pushed note: safety notes first and whole, the rest cut to the budget left. */
export function pushedNotesText(
  notes: readonly TurnNote[],
  maxChars = MAX_PUSHED_CONTEXT_CHARS
): string {
  const rest = notes
    .filter((note) => !note.safety)
    .map((note) => note.text)
    .join('\n\n');
  const kept = safetyText(notes);
  if (kept === '') return rest.slice(0, maxChars);

  const room = maxChars - kept.length - 2;
  if (room < 0) {
    log.warn(
      { safetyChars: kept.length, maxChars },
      'Safety notes exceed the pushed-note cap; kept whole'
    );
  }
  return rest && room > 0 ? `${kept}\n\n${rest.slice(0, room)}` : kept;
}

/** The safety notes still waiting go ahead of a later note's, each once (#2642). */
export function withHeldSafety(held: readonly string[], notes: readonly TurnNote[]): TurnNote[] {
  const fresh = new Set(notes.filter((note) => note.safety).map((note) => note.text));
  const carried = held.filter((text) => !fresh.has(text)).map((text) => ({ safety: true, text }));
  return [...carried, ...notes];
}

/** The key, in a pushed note's `extra`, of its safety guidance, whole. */
export const TURN_CONTEXT_SAFETY = 'turnContextSafety';

/**
 * A stale pushed note cut down to its header and its safety guidance, or
 * undefined when it carries none (withoutStaleTurnContext, #2642). A copy: the
 * request's items are the agent's own (ChatContext.copy shares them).
 */
export function safetyOnlyNote<T extends { extra?: Record<string, unknown> }>(
  note: T,
  header: string
): T | undefined {
  const safety = note.extra?.[TURN_CONTEXT_SAFETY];
  if (typeof safety !== 'string' || safety === '') return undefined;
  const copy = Object.create(Object.getPrototypeOf(note) as object) as T;
  return Object.assign(copy, note, { content: [`${header}\n${safety}`] });
}
