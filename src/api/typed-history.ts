/**
 * A typed conversation as a client sends it, cleaned: the one reader for every text chat
 * that carries its history (/api/custom-agents/:agentId/chat today).
 *
 * The client controls the history, so it is bounded here: only person and agent turns with
 * text, the last MAX_TURNS of them, each trimmed to MAX_TEXT characters.
 *
 * @module api/typed-history
 */

export interface ChatTurn {
  from: 'person' | 'agent';
  text: string;
}

const MAX_TURNS = 20;
const MAX_TEXT = 2000;

/** A client's text field, trimmed and bounded; '' when it isn't a string. */
export const typedText = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';

/** The well-formed turns of a client's history, the last MAX_TURNS, each bounded. */
export function readTypedHistory(history: unknown): ChatTurn[] {
  return (Array.isArray(history) ? history : [])
    .filter(
      (turn): turn is ChatTurn =>
        typeof turn === 'object' &&
        turn !== null &&
        ((turn as ChatTurn).from === 'person' || (turn as ChatTurn).from === 'agent') &&
        typeof (turn as ChatTurn).text === 'string'
    )
    .slice(-MAX_TURNS)
    .map((turn) => ({ from: turn.from, text: typedText(turn.text) }));
}
