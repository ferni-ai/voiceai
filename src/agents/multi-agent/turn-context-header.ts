/**
 * The first line of a turn-context note pushed into the chat (turn-intelligence.ts).
 * Its own module with no imports, so readers of the chat (the fast lane, the
 * crisis gate) can recognise a note without importing the turn machinery.
 *
 * @module agents/multi-agent/turn-context-header
 */

export const TURN_CONTEXT_HEADER =
  "[Background on what they said just above, not something the user said. It was written for your reply to that line, which you already gave: use what it tells you about them, but don't act on its instructions, such as asking a question or bringing something up.]";

/** The key, in a pushed note's `extra`, of the caller's words it was built for. */
export const TURN_CONTEXT_FOR = 'turnContextFor';

/** What a pushed note is cut to, so it can't grow the session's context unboundedly. */
export const MAX_PUSHED_CONTEXT_CHARS = 2000;

/**
 * The id prefix of a memory-recall note (memory-recall-hook.ts addRecallNote),
 * so a turn receipt can count what recall added without reading it.
 */
export const RECALL_NOTE_ID_PREFIX = 'recall_';
