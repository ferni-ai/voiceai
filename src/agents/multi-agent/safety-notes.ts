/**
 * Crisis guidance in the pushed turn-context note (turn-intelligence.ts) is
 * never cut (#2618). The note is capped at MAX_PUSHED_CONTEXT_CHARS; a raw
 * slice of the joined notes cut crisis_response mid-sentence and dropped the
 * safety injection whenever a note added earlier in the turn (the cross-domain
 * correlations note) sat ahead of it.
 *
 * On a crisis or soft-check turn the safety notes carry SAFETY_NOTE_ID_PREFIX
 * ids. They go first, in full; the other notes keep their order and get what
 * budget is left. A turn with no safety note is cut exactly as before.
 *
 * @module agents/multi-agent/safety-notes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PUSHED_CONTEXT_CHARS } from './turn-context-header.js';

const log = createLogger({ module: 'SafetyNotes' });

/** The id prefix of a chat item holding crisis guidance. */
export const SAFETY_NOTE_ID_PREFIX = 'safety_';

/** Safety notes made so far, for their ids. */
let safetyNotes = 0;

/** A fresh id that marks a chat item as safety guidance the pushed-note cut keeps whole. */
export const safetyNoteId = (): string => `${SAFETY_NOTE_ID_PREFIX}${++safetyNotes}`;

/** The message that makes the reply the pre-written crisis response. */
export function crisisOverrideNote(suggestedResponse: string): {
  id: string;
  role: 'system';
  content: string;
} {
  return {
    id: safetyNoteId(),
    role: 'system',
    content: `[CRITICAL SAFETY OVERRIDE]
The user appears to be in crisis. You MUST respond with the following crisis response.
Do NOT deviate from this response. User safety is the absolute priority.

REQUIRED RESPONSE:
${suggestedResponse}`,
  };
}

export interface TurnNote {
  id?: string;
  text: string;
}

/** The body of the pushed note: safety notes first and whole, the rest cut to the budget left. */
export function pushedNotesText(notes: TurnNote[], maxChars = MAX_PUSHED_CONTEXT_CHARS): string {
  const isSafety = (note: TurnNote): boolean => Boolean(note.id?.startsWith(SAFETY_NOTE_ID_PREFIX));
  const rest = notes
    .filter((note) => !isSafety(note))
    .map((note) => note.text)
    .join('\n\n');
  const safety = notes.filter(isSafety).map((note) => note.text);
  if (safety.length === 0) return rest.slice(0, maxChars);

  const kept = safety.join('\n\n');
  const room = maxChars - kept.length - 2;
  if (room < 0) {
    log.warn(
      { safetyChars: kept.length, maxChars },
      'Safety notes exceed the pushed-note cap; kept whole'
    );
  }
  return rest && room > 0 ? `${kept}\n\n${rest.slice(0, room)}` : kept;
}
