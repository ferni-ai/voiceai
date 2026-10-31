/** A clear "I'm okay" to CLASSIFIER_CHECK (crisis-classifier-check.ts): a closed set.
 * @module CrisisClassifierCheckWords */

// Clauses beside a clear answer. Never "no" (the wrong answer to "are you safe?"), "lol" (how
// real risk is often joked about) or "um" (a hesitation is not clear).
const FILLER =
  /^(?:yes|yeah|yep|yup|yea|okay|ok|hey|ferni|fernie|ferny|fern|honestly|seriously|really|i promise|promise|come on|sorry|thanks|thank you|thanks for (?:asking|checking))$/;
const OKAY = '(?:okay|ok|fine|good|safe|alright|all right)';
const ADVERB = '(?:(?:really|totally|completely|perfectly|honestly|actually|absolutely) )?';
const CLEAR = new RegExp(
  `^(?:${[
    `(?:(?:yes|yeah|yep) )?(?:i'm|im|i am) ${ADVERB}(?:doing )?${OKAY}(?: (?:right now|now|i promise))?`,
    `(?:it's|its|it is|this is|that's|thats|that is) not (?:a |an )?(?:crisis|emergency)`,
    `(?:there's|theres|there is) no (?:crisis|emergency)`,
    `not (?:a |an )?(?:crisis|emergency)`,
    `(?:i'm|im|i am) not in (?:any )?danger`,
    `(?:everything's|everything is|we're|all) ${OKAY}`,
  ].join('|')})$`
);

/** Every clause a statement or a filler, at least one statement; no "?" or ellipsis. "I'm fine
 * but I can't do this anymore" and "I'm okay, I just want it to stop" are not clear. */
export function clearAnswer(answer: string): boolean {
  const text = answer
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'");
  if (/[?¿…]|\.\./.test(text)) return false;
  const clauses = text
    .split(/[.,!;:]+|\band\b/)
    .map((c) => c.replace(/[^a-z0-9']+/g, ' ').trim())
    .filter(Boolean);
  const statement = (c: string): boolean => CLEAR.test(c);
  return clauses.some(statement) && clauses.every((c) => statement(c) || FILLER.test(c));
}
