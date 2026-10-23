/**
 * The spoken conversation in a chat context, as the director, the deliberator
 * and the wrap-up read it. Moved out of director-notes.ts (which re-exports
 * it) to keep that file under the 500-line limit.
 *
 * @module agents/personas/director-lines
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import type { Line } from './director-notes.js';
import { splitSaidBy } from './said-by.js';

/**
 * The spoken conversation in a chat context: user and assistant messages,
 * markup removed. The per-turn context note is a user message too, but nobody
 * said it: the director once reported "Stevie Wonder from personality
 * expression" as part of the call.
 */
export function linesFromChat(
  items: ReadonlyArray<{ id?: string; type?: string; role?: string; textContent?: string }>,
  by?: (item: { id?: string }) => string | undefined
): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    if (item.textContent?.startsWith(TURN_CONTEXT_HEADER)) continue;
    const said = (item.textContent ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // A reply carried over at a handoff is marked "(Ferni said:) " (persona-swap.ts).
    const marked = item.role === 'assistant' ? splitSaidBy(said) : undefined;
    const text = marked?.text ?? said;
    if (!text) continue;
    const name = item.role === 'assistant' ? (by?.(item) ?? marked?.name) : undefined;
    if (name) lines.push({ speaker: 'ferni', text, by: name });
    else lines.push({ speaker: item.role === 'user' ? 'user' : 'ferni', text });
  }
  return lines;
}
