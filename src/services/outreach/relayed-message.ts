/**
 * What the person on a call asked Ferni to pass on to the user: "tell him he
 * needs to go to church too", "let her know I'm proud of her". A friend who
 * called your mom for you tells you that part first.
 *
 * Only their own words are used, and only after "tell" or "let ... know" aimed
 * at the user (him, her, them, or the user's first name), so a passing "tell
 * you what" or a story about telling someone else never becomes a message.
 * The words are screened like all caller text (caller-text.ts).
 *
 * @module services/outreach/relayed-message
 */

import { screenedCallerText } from './caller-text.js';

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "tell him X" / "tell Sam that X" / "let her know X", up to the end of the sentence. */
function relayPattern(userFirstName: string | undefined): RegExp {
  const who = ['him', 'her', 'them', ...(userFirstName ? [escape(userFirstName)] : [])].join('|');
  return new RegExp(
    `\\b(?:tell|let)\\s+(?:${who})\\b(?:\\s+know)?(?:\\s+that)?[\\s,:]+([^.!?]{3,200})`,
    'i'
  );
}

/**
 * The last thing the person asked to pass on, in their words, or undefined.
 * `heard` is what they said, turn by turn; `userName` is who Ferni called for.
 */
export function relayedMessage(
  heard: readonly string[],
  userName: string | undefined,
  contactName: string
): string | undefined {
  const firstName = userName?.trim().split(/\s+/)[0];
  const pattern = relayPattern(firstName && firstName !== 'the' ? firstName : undefined);
  for (const said of [...heard].reverse()) {
    const match = pattern.exec(said.replace(/[‘’]/g, "'"));
    const words = match?.[1]?.trim();
    if (words) return screenedCallerText(words, contactName, 200) || undefined;
  }
  return undefined;
}
