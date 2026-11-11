/**
 * Reading a yes to an offer Ferni made by pronoun (HANDOFF_HELD_TRUTHFUL, #3755).
 *
 * Asked "what's Alex up to?", Ferni said "Did you want me to wake him up and bring him
 * in?", the caller said "Sure.", and the ask-first gate held the handoff because the line
 * didn't say Alex. A pronoun can point at anyone, though, so this reading is strict: a
 * wrong transfer is worse than Ferni asking once more by name. The caller's whole turn is
 * a yes, and Ferni's last sentence is an offer to put them through to someone, with no
 * alternative after it. "Want me to put them on your calendar?" is not a transfer, and
 * "Sure, let's keep chatting" is not a yes to one. Who "him" is: handoff-consent.ts.
 *
 * @module tools/handoff/pronoun-offer
 */

/** Sounds that carry nothing: "um, sure", "oh, okay", "well, yeah". */
const FILLERS = new Set(['um', 'umm', 'uh', 'oh', 'well', 'hmm', 'ah']);

/** Yes phrases and politeness, apostrophes dropped ("let's" is "lets"). */
const YES_PHRASE =
  'yes|yeah|yep|yup|sure|ok|okay|alright|all right|absolutely|definitely|totally|of course|for sure|' +
  'go ahead|go for it|do it|lets do it|why not|sounds good|sounds great|thatd be great|that would be great|' +
  'please|thanks|thank you|yes please|sure thing';
const ONLY_YES = new RegExp(`^(?:(?:${YES_PHRASE})(?: |$))+$`);

/**
 * Whether the caller's whole turn is a yes and nothing else: "Sure.", "Yeah, go ahead.",
 * "Um, sounds good." Any other word means they said something besides yes ("Yes, read the
 * list", "Okay, um, my sister"), so it is not a yes to the offer.
 */
export function bareYes(said: string): boolean {
  const words = said
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w !== '' && !FILLERS.has(w));
  return ONLY_YES.test(words.join(' '));
}

/** An offer or a question to the caller: "want me to", "should I", "I can", "wanna". */
const OFFER_FRAME =
  /\b(want me to|would you like me to|should i|shall i|i can|i could|do you want to|would you like to|want to|wanna)\b/;

/** Where a clause ends: punctuation or the end of the line, maybe after "now" or "for you". */
const END = String.raw`(?:\s+(?:now|here|too|for you|real quick|right now))?\s*(?:[,.!?;]|$)`;
const OBJ = '(him|her|them)';

/**
 * Putting the caller through to someone named by pronoun, whole words only. "in" and "on"
 * must end the clause ("get him on the line" aside), so "put them on your calendar", "get
 * her on it" and "loop him in on the details" are not transfers. Group 1 of the match
 * that fired holds the pronoun.
 */
const TRANSFERS: readonly RegExp[] = [
  new RegExp(String.raw`\b(?:bring|get|grab|pull|loop)\s+${OBJ}\s+in${END}`),
  new RegExp(String.raw`\b(?:grab|get)\s+${OBJ}${END}`),
  new RegExp(String.raw`\b(?:get|put)\s+${OBJ}\s+on(?:${END}|\s+the\s+(?:line|phone|call)\b)`),
  new RegExp(String.raw`\b(?:put|patch)\s+${OBJ}\s+through${END}`),
  new RegExp(String.raw`\b(?:put|patch)\s+you\s+through\s+to\s+${OBJ}\b`),
  new RegExp(String.raw`\bconnect\s+you\s+(?:with|to)\s+${OBJ}\b`),
  new RegExp(String.raw`\b(?:hand|pass|send|transfer)\s+you\s+(?:(?:over|off)\s+)?to\s+${OBJ}\b`),
  new RegExp(String.raw`\b(?:talk|speak|chat)\s+(?:to|with)\s+${OBJ}\b`),
  new RegExp(String.raw`\bwake\s+${OBJ}\b`),
  new RegExp(
    String.raw`\bsee\s+if\s+(he|she|they)(?:\s+is|\s+are|'s|'re)\s+(?:free|around|available)\b`
  ),
];

/**
 * The pronoun Ferni's line offers to put the caller through to ("him" in "Did you want me
 * to wake him up and bring him in?"), or null. Only the line's last sentence counts, it
 * must frame an offer before the transfer, and nothing may follow as an alternative ("or
 * should I just read you the list?").
 */
export function pronounOffered(line: string): string | null {
  const sentences = line
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() !== '');
  const last = sentences.at(-1) ?? '';
  const frame = OFFER_FRAME.exec(last);
  if (!frame || /\bor\b/.test(last)) return null;
  for (const transfer of TRANSFERS) {
    const match = transfer.exec(last);
    if (match && match.index > frame.index) return match[1];
  }
  return null;
}
