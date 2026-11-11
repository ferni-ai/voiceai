/**
 * Safety guidance in the pushed turn-context note (turn-intelligence.ts) is
 * never cut (#2618). The note is capped at MAX_PUSHED_CONTEXT_CHARS; a raw
 * slice of the joined notes cut crisis_response mid-sentence and dropped the
 * safety injection whenever a note added earlier in the turn (the cross-domain
 * correlations note) sat ahead of it.
 *
 * Safety notes are the ones marked by safety-note.ts (carriesSafety). They go
 * last, in full, and the crisis override ("Do NOT deviate") is last of all, so
 * nothing follows it. The other notes keep their order and get what budget is
 * left. A turn with no safety note is cut exactly as before.
 *
 * Nor is it lost later (#2642): safety notes still waiting are carried into the
 * next held note, and a note the stale drop removes keeps its safety part.
 *
 * @module agents/multi-agent/pushed-notes
 */
import { createLogger } from '../../utils/safe-logger.js';
import { MAX_PUSHED_CONTEXT_CHARS } from './turn-context-header.js';

const log = createLogger({ module: 'PushedNotes' });

export interface TurnNote {
  /** It carries crisis or safety guidance (safety-note.ts carriesSafety). */
  safety?: boolean;
  /** It is the crisis override (safety-note.ts carriesCrisisOverride), which always goes last. */
  override?: boolean;
  text: string;
}

/** The safety notes among these, in order, with the crisis override moved last. */
const safetyNotes = (notes: readonly TurnNote[]): TurnNote[] => {
  const safety = notes.filter((note) => note.safety);
  return [...safety.filter((note) => !note.override), ...safety.filter((note) => note.override)];
};

/** The safety guidance among these notes, whole, the crisis override last. */
export const safetyText = (notes: readonly TurnNote[]): string =>
  safetyNotes(notes)
    .map((note) => note.text)
    .join('\n\n');

/** The body of the pushed note: the rest cut to the budget left, then safety notes whole, override last. */
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
  return rest && room > 0 ? `${rest.slice(0, room)}\n\n${kept}` : kept;
}

/** The safety notes still waiting go ahead of a later note's, each once (#2642). */
export function withHeldSafety(held: readonly TurnNote[], notes: readonly TurnNote[]): TurnNote[] {
  const fresh = new Set(notes.filter((note) => note.safety).map((note) => note.text));
  return [...held.filter((note) => !fresh.has(note.text)), ...notes];
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
