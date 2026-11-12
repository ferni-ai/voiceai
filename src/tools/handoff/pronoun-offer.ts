/**
 * Reading a yes to an offer Ferni made by pronoun (HANDOFF_HELD_TRUTHFUL, #3755).
 *
 * Asked "what's Alex up to?", Ferni said "Did you want me to wake him up and bring him
 * in?", the caller said "Sure.", and the ask-first gate held the handoff because the line
 * didn't say Alex. A pronoun can point at anyone, though, and no pattern can tell who
 * "him" is: "want me to get him on the phone?" may be the dentist, "talk to him about
 * it?" a coworker. So only offers whose words already mean "someone joins this call"
 * count ("bring him in", "have her hop on"), and a miss is cheap: the held instruction
 * has Ferni offer again by name, which the named path accepts. Who "him" is:
 * handoff-consent.ts.
 *
 * @module tools/handoff/pronoun-offer
 */

/** Sounds that carry nothing: "um, sure", "oh, okay", "well, yeah". */
const FILLER = 'um|umm|uh|oh|well|hmm|ah';

/** Words that agree, apostrophes dropped ("let's" is "lets"). */
const AGREES =
  'yes|yeah|yep|yup|sure|ok|okay|alright|all right|absolutely|definitely|totally|of course|for sure|' +
  'go ahead|go for it|do it|lets do it|lets do that|do that|why not|sounds good|sounds great|' +
  'thatd be great|that would be great|please|please do|sure thing|mm hmm|mhm|mm hm|uh huh|' +
  'i would|id love that|i would love that|id like that|i would like that|then';
/** Politeness: fine beside a yes, not a yes on its own ("Thanks." may only be polite). */
const POLITE = 'thanks|thank you';

const ONLY = (alternatives: string): RegExp => new RegExp(`^(?:(?:${alternatives})(?: |$))+$`);
const ALL_AGREEING = ONLY(`${AGREES}|${POLITE}|${FILLER}`);
const ONLY_POLITE = ONLY(`${POLITE}|${FILLER}|then`);

/** The words of a reply, lowercased, apostrophes dropped, punctuation gone. */
const wordsOf = (said: string): string =>
  said
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w !== '')
    .join(' ');

/**
 * Whether the caller's whole turn is a yes and nothing else: "Sure.", "Yeah, go ahead.",
 * "Mm-hmm.", "Yeah, I would." Any other word means they said something besides yes ("Yes,
 * read the list"). Not a yes: a question ("Okay?"), a number ("Yes, 5."), thanks alone.
 */
function bareYes(said: string): boolean {
  if (said.trim().endsWith('?') || /\d/.test(said)) return false;
  const words = wordsOf(said);
  return ALL_AGREEING.test(words) && !ONLY_POLITE.test(words);
}

const OBJ = '(him|her|them)';

/** Ferni's own join phrases echoed in a yes: "Yes, bring him in.", "Sure, go ahead and loop her in." */
const ECHOED_JOIN = new RegExp(
  String.raw`\b(?:go ahead and |please )?(?:bring ${OBJ} (?:in|on)|loop ${OBJ} in|have ${OBJ} (?:join|hop on|jump in))\b`,
  'g'
);

/** A bare yes, or a yes that repeats the join ("Yeah, sure, bring him in."). */
export function yesToJoin(said: string): boolean {
  if (bareYes(said)) return true;
  if (said.trim().endsWith('?') || /\d/.test(said)) return false;
  const words = wordsOf(said);
  const rest = words.replace(ECHOED_JOIN, ' ').replace(/\s+/g, ' ').trim();
  return rest !== words && (rest === '' || bareYes(rest));
}

/** Openers before an offer: "Okay, want me to ...", "So, should I ...". */
const LEAD = String.raw`(?:(?:so|well|okay|ok|hey|oh|hmm|um|and|but|also)\b[,\s]*)*`;
/** An offer to the caller that starts the sentence: "want me to", "should I", "I can". */
const FRAME =
  'want me to|do you want me to|did you want me to|would you like me to|should i|shall i|' +
  'i can|i could|can i|do you want to|would you like to|want to|wanna';
/** What may follow the join phrase before the sentence ends: "now", "if you like". */
const TAIL = String.raw`(?:\s+(?:now|here|too|real quick|right now|for a sec|for a minute|for you|if you like|if you want|if youd like|if you'd like))*\s*[.!?]+$`;

/**
 * Phrases whose meaning limits the pronoun to someone joining this call, each ending the
 * sentence. Not "talk to him", "get him on the phone", "see if she's free", "get them for
 * you", "put them on" or "wake him": those fit anyone (a dentist, the kids, tickets).
 */
const JOINS = [
  String.raw`bring ${OBJ} (?:in|on)`,
  String.raw`loop ${OBJ} in`,
  String.raw`have ${OBJ} (?:join(?: us| in| the call)?|hop on|jump in)`,
  String.raw`hand you (?:over|off) to ${OBJ}`,
  String.raw`pass you (?:over )?to ${OBJ}`,
];
const FRAMED_JOIN = new RegExp(
  String.raw`^${LEAD}(?:${FRAME})\b.*?\b(?:${JOINS.join('|')})${TAIL}`
);
/** "He could join us if you like?": an offer without a frame. */
const CAN_JOIN = new RegExp(
  String.raw`^${LEAD}(he|she|they) (?:could|can) join(?: us| in| the call)?${TAIL}`
);

/**
 * The pronoun Ferni's line offers to bring into the call ("him" in "Did you want me to
 * wake him up and bring him in?"), or null. Only the last sentence counts, and it must be
 * the offer from start to end: no alternative ("or should I just read you the list?"), no
 * reported speech ("your mom asked me, should I bring him in?"), no line cut off mid-thought.
 */
export function pronounOffered(line: string): string | null {
  const sentences = line
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() !== '');
  const last = (sentences.at(-1) ?? '').trim().replace(/\s+/g, ' ');
  if (/\bor\b/.test(last)) return null;
  const match = FRAMED_JOIN.exec(last) ?? CAN_JOIN.exec(last);
  return match?.slice(1).find((group) => group !== undefined) ?? null;
}
