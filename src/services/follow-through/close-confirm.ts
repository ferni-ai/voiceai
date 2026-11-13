/**
 * A todo closes where it lives only on the caller's own yes. When they tell
 * the call opener a follow-up is done or dropped, those words close only the
 * follow-up. Ferni's acknowledgement then asks, once, whether to take the todo
 * off their list too, and only a plain yes to that question closes it
 * (close-to-source.ts writes it).
 *
 * Why: two designs that read the answer itself to decide which todo it named
 * both closed the wrong item. A question that names the item costs one turn,
 * and a wrong pick costs only a "no".
 *
 * @module services/follow-through/close-confirm
 */

import { RELEASE } from './close-from-reply.js';
import type { SourceClose } from './close-to-source.js';
import { mentionsItem } from './item-match.js';

/** An unanswered question lapses after this, or when the call ends, whichever comes first. */
export const CONFIRM_TTL_MS = 24 * 60 * 60_000;

/** Another clause, a question, a negation, a deferral or a hedge. */
const HEDGED =
  /\b(but|though|although|except|however|yet|still|instead|whereas)\b|[;?]|n't\b|'ll\b|\b(not|no|nope|never|nothing|none|cannot|later|soon|tonight|tomorrow|next (week|month)|fell through|on my list|pending|waiting|till|until|will|gonna|going to|need to|have to|almost|maybe|kinda|kind of|sort of|ish)\b/;

/**
 * Whether the answer leaves room for doubt ("not yet", "done, but…", "kinda"),
 * so Ferni doesn't offer to close its todo. The let-go phrase itself
 * ("not doing it", "never mind") doesn't count against it.
 */
export function hedgedAnswer(answer: string): boolean {
  const said = answer.toLowerCase().replace(/[‘’]/g, "'");
  return HEDGED.test(said.replace(new RegExp(RELEASE.source, 'gi'), ' '));
}

/** The follow-up's own words as a list item, or null when there are none or too many to say. */
function itemName(itemText: string): string | null {
  const words = itemText
    .replace(/[.!?]+$/, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 8) return null;
  return `"${[words[0].toLowerCase(), ...words.slice(1)].join(' ')}"`;
}

/** The question, in fe's approved words, as a turn note for the reply that acknowledges the answer. */
export function confirmNote(how: SourceClose, itemText: string): string {
  const item = itemName(itemText);
  const ask = !item
    ? 'Want me to take that off your list too?'
    : how === 'done'
      ? `Want me to take ${item} off your list too?`
      : `Want me to drop ${item} from your list for good?`;
  return `The caller just told you a todo is ${how === 'done' ? 'done' : 'dropped'}. In this same reply, after you acknowledge it, ask once, in these words or close to them: "${ask}" Never ask it again or explain it.`;
}

/** Ferni's reply asked it: a question offering to take the item (or "that", "it") off the list. */
export function asksToClose(reply: string, itemText: string): boolean {
  return reply
    .split(/(?<=\?)/)
    .some(
      (s) =>
        s.trim().endsWith('?') &&
        /\b(off|from)\b.*\blist\b/i.test(s) &&
        (mentionsItem(s, itemText) || /\b(that|it)\b/i.test(s))
    );
}
