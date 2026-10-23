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
 * @module agents/multi-agent/pushed-notes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PUSHED_CONTEXT_CHARS } from './turn-context-header.js';

const log = createLogger({ module: 'PushedNotes' });

export interface TurnNote {
  /** It carries crisis or safety guidance (safety-note.ts carriesSafety). */
  safety?: boolean;
  text: string;
}

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
