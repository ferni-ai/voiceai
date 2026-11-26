/**
 * NAME_GUEST_NAMES_OWNER=on: words that speak of the account holder in the
 * third person ("a friend of Sam", "Sam's coworker", "how do I impress Sam")
 * come from a guest, not from the owner.
 *
 * Prod 2026-11-17: a friend on the owner's signed-in call said "This is <friend>,
 * a friend of <owner>. How do I impress <owner>?" twice. Name-correction took it
 * as the verified owner giving their own name and saved it as the account's
 * preferredName, and every later call (one Ferni placed to the owner's mother
 * included) used the friend's name.
 *
 * room-guests.ts runs guestNamesOwner on every caller turn and keeps a hit as
 * this call's guest state, which every account-name writer and the send
 * confirm read.
 *
 * Not a guest: the owner speaking of their own name. That is the account name
 * said as the claimed name ("call me Sam"), or right after "not", "isn't", "not
 * just", "instead of", "I used to go by", "formerly", "I'm", "it's", "this is",
 * "my name is", "call me", "saying"; followed by "here", "speaking", or "is
 * my old name"; or alone on the line ("Sam.", "Yes, Sam"). A possessive
 * ("Sam's coworker") is always someone else's. Still a guest, though the owner
 * may say it: the owner speaking of someone else with their own first name.
 * Names fold case, Unicode form, diacritics and curly apostrophes ("Zoë" is
 * "Zoe"), a hyphen matches a space ("Mary-Ann" is "Mary Ann"), and only whole
 * words count ("Samantha" is not "Sam"). Still missed: a guest who names
 * nobody ("I'm Raj, his roommate"); see room-guests.ts.
 *
 * @module utils/guest-names-owner
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'GuestNamesOwner' });

export function guestNamesOwnerEnabled(env: Env = process.env): boolean {
  return flagOn('NAME_GUEST_NAMES_OWNER', env);
}

let guestCheck: ((userData: object) => boolean) | undefined;
let unsetLogged = false;

/**
 * room-guests.ts (a higher layer, on the live turn path: ferni-agent.ts →
 * turn-request.ts) holds the guest state and registers "is a guest on this
 * call's line" when it loads.
 */
export function setGuestOnLineCheck(check: (userData: object) => boolean): void {
  guestCheck = check;
}

/**
 * NAME_GUEST_NAMES_OWNER=on and a guest is on the line, so rememberName keeps the
 * name for this call only. Anything else main required still applies. Nothing
 * registered means room-guests.ts never loaded, so no guest can be on the line:
 * not held, logged once.
 */
export function accountNameHeld(userData: object, env: Env = process.env): boolean {
  if (!guestNamesOwnerEnabled(env)) return false;
  if (guestCheck) return guestCheck(userData);
  if (!unsetLogged) log.error({}, 'NAME_GUEST_NAMES_OWNER: no guest check registered');
  unsetLogged = true;
  return false;
}

/**
 * rememberName's answer when a guest on the line keeps the name to this call:
 * Ferni just uses it, and never says it was saved.
 */
export const callOnlyNote = (name: string): string =>
  `[INTERNAL: Call them ${name} for the rest of this call. It is NOT saved to the account, ` +
  `so don't say you saved it or will remember it. Do NOT read this aloud.]`;

/** Lower case, decomposed, no marks, straight apostrophes: "Zoë" and "Zoe" fold the same. */
const fold = (text: string): string =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[‘’]/g, "'").toLowerCase();

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (name: string | undefined): string =>
  fold(name ?? '')
    .trim()
    .split(/\s+/)[0];

/** Just before the name, in folded text: the owner speaking of their own name. */
const SELF_BEFORE = new RegExp(
  String.raw`(?:n't|(?:^|[^\p{L}'])(?:not(?:\s+just)?|instead\s+of|rather\s+than|` +
    String.raw`used\s+to\s+(?:be|go\s+by)|went\s+by|formerly|i'?m|i\s+am|it'?s(?:\s+me,?)?|` +
    String.raw`it\s+is|this\s+is|name\s+(?:is|was)|name's|go(?:es)?\s+by|call(?:s|ed|ing)?\s+me|` +
    String.raw`saying|said))\s+$`,
  'u'
);
/** Just after the name: "Sam here", "Sam speaking", "Sam is my dead name", "Sam's my old name". */
const SELF_AFTER =
  /^(?:\s+(?:here|speaking)\b|(?:\s+(?:is|was)|'s)\s+(?:my|the)\b[^.?!]{0,24}\bname)/u;
const POSSESSIVE = /^'s?(?![\p{L}\p{N}])/u;
/** The name is the whole line, maybe after a yes or hello: "Sam." to "who's this?". */
const ALONE_BEFORE = /^[\s\p{P}]*(?:(?:yes|yeah|yep|yup|hi|hey|hello)[\s\p{P}]+)?$/u;
const ALONE_AFTER = /^[\s\p{P}]*$/u;

/** Whether this mention of the account holder speaks of them as someone else. */
function thirdPerson(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (SELF_AFTER.test(after) || (ALONE_BEFORE.test(before) && ALONE_AFTER.test(after))) {
    return false;
  }
  return POSSESSIVE.test(after) || !SELF_BEFORE.test(before);
}

/**
 * Whether `words` speak of the account holder as someone else while the speaker
 * claims `claimed` (or '' when no name was given). `accountNames` are the names
 * the account had when the call started; the first word of each is used.
 */
export function guestNamesOwner(
  words: string,
  accountNames: readonly string[],
  claimed: string
): boolean {
  const text = fold(words);
  const own = firstWord(claimed);
  const owners = new Set(accountNames.map(firstWord).filter((n) => n.length > 1 && n !== own));
  for (const owner of owners) {
    const spoken = escaped(owner).replace(/-/g, String.raw`[-\s]`);
    const word = new RegExp(String.raw`(?<![\p{L}\p{N}])${spoken}(?![\p{L}\p{N}])`, 'gu');
    for (const m of text.matchAll(word)) {
      const start = m.index ?? 0;
      if (thirdPerson(text, start, start + m[0].length)) return true;
    }
  }
  return false;
}
