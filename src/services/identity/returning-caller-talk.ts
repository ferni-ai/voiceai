/**
 * What a call says and hears about a returning caller (returning-caller.ts),
 * pure. A number can be shared, and saying a stored name would disclose it,
 * so Ferni never says it first: he greets a possible returning caller warmly
 * without naming anyone and lets them say who it is. Only a name the caller
 * states that matches the record confirms them; a bare "yes" never does.
 * Then, and only then, the model gets the one-line topic hint. Also "forget
 * me" and its notes.
 *
 * @module services/identity/returning-caller-talk
 */

/** The model's note at call start: someone may have called before; no name, nothing else. */
export const POSSIBLY_RETURNING_NOTE =
  "Possibly a returning caller: someone has called you from this number before, but you don't know who this is. Don't say or guess any name, and don't mention anything from an earlier call; let them tell you who it is.";

/** The greeting's direction for the same: warm, no name, ask who it is. */
export const POSSIBLY_RETURNING_GREETING =
  "Someone has called you from this number before, but you don't know who this is. Greet them warmly, like a voice you're glad to hear again, without naming anyone, and ask who it is (\"hey, good to hear from you again, who's this?\"), in one short sentence. Don't guess a name or mention anything from an earlier call.";

/** Once they said the record's name themselves: their name and at most a one-line topic hint. */
export function confirmedNote(name: string, summary: string | undefined): string {
  const last = summary ? ` Last time you talked about ${summary}.` : '';
  return `They told you they're ${name}, who called you before.${last} That is all you remember about them: don't claim to remember more, and don't recite it back; let them bring it up.`;
}

/**
 * Whether the name the caller stated for themselves on this turn
 * (name-correction.ts statedName) is the record's name: a first-name match,
 * case-insensitive. No stated name is no answer; nothing else counts.
 */
export function nameConfirmation(
  name: string,
  stated: string | null
): 'confirmed' | 'denied' | null {
  if (!stated) return null;
  return stated.toLowerCase() === name.toLowerCase() ? 'confirmed' : 'denied';
}

/**
 * The caller asking not to be remembered. Not "you don't remember me?" or
 * "did you forget me?": that is someone hoping Ferni does.
 */
const FORGET_ME = [
  /(?<!\b(?:you|u|don'?t|do not|never|won'?t|didn'?t)\s+)\bforget (?:about )?me\b(?! not)/i,
  /\b(?:can|could|would|will) you (?:please )?forget (?:about )?me\b/i,
  /\bforget (?:my name|who i am|(?:that )?i (?:ever )?called)\b/i,
  /(?<!\byou\s+)\b(?:don'?t|do not|stop) remember(?:ing)? me\b/i,
  /\b(?:don'?t|do not) want you to remember me\b/i,
  /\b(?:erase|delete) (?:me|my (?:name|number|info|information|details|data))\b/i,
];

/** True when the caller's words ask Ferni not to remember them. */
export const asksToBeForgotten = (words: string): boolean => FORGET_ME.some((re) => re.test(words));

export const FORGOTTEN_NOTE =
  "They asked you not to remember them. What you kept from their calls (their first name and a line about what you talked about) is now cleared, and you won't remember them from this call either. Confirm that in a few plain words, and don't use their name again.";

/** Before the erase is stored: Ferni promises it, never claims it's done. */
export const FORGETTING_NOTE =
  "They asked you not to remember them. Tell them you'll make sure what you kept from their calls (their first name and a line about what you talked about) is cleared, and that you won't remember them from this call. Don't say it's already done, and don't use their name again.";
