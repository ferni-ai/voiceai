/**
 * The words actually spoken in a chat item, as the action-claim guard and the
 * emergency check (action-claim-guard.ts, emergency-claim.ts) read them.
 *
 * @module agents/personas/spoken-words
 */
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

export interface Item {
  type?: string;
  role?: string;
  name?: string;
  content?: unknown;
  textContent?: string;
}

/** Curly apostrophes from speech-to-text read as straight ones. */
export const plain = (text: string): string => text.replace(/[‘’]/g, "'");

/** The spoken words: the first line only, since a per-turn reminder rides after a blank line (turn-style.ts). */
export const spokenOf = (item: Item): string => {
  const text =
    item.textContent ??
    (Array.isArray(item.content)
      ? item.content.filter((part): part is string => typeof part === 'string').join(' ')
      : '');
  const first = text.split('\n')[0].trim();
  return first.startsWith(TURN_CONTEXT_HEADER) ? '' : first;
};

/** The latest spoken messages from one side of the call (all by default), oldest first. */
export function recentSpoken(
  chatCtx: { items: readonly unknown[] },
  role: 'user' | 'assistant',
  count = Infinity
): string[] {
  return (chatCtx.items as readonly Item[])
    .filter((item) => item.type === 'message' && item.role === role)
    .map((item) => plain(spokenOf(item)))
    .filter(Boolean)
    .slice(-count);
}
