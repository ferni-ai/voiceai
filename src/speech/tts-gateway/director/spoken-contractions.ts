/**
 * SPOKEN_CONTRACTIONS=on: contract the pairs people never say in full.
 *
 * The prompt asks for contractions (speech-markup-notes.ts: "'It is' and 'that
 * is' sound read aloud"), but the model still writes the full form. The
 * 2026-10-21 humanness red team (#2334) found it in 10 of 50 Ferni turns across
 * 5 of 7 dev calls, mostly on emotional lines: "That is a massive shift.", "It
 * is a lot, even when you say it's fine.", "No, I am not going to say your
 * feelings are valid." The agent's TTS log shows the model wrote them that way.
 *
 * A pair is contracted only when a lowercase word follows it in the same
 * clause, so a clause-final "ready when you are." and a stressed "I am NOT"
 * stay as written, as does "That is, ..." (a comma follows). Off, nothing changes.
 *
 * @module speech/tts-gateway/director/spoken-contractions
 */

/** SPOKEN_CONTRACTIONS, read from env; off unless set to 'on'. */
export function spokenContractionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SPOKEN_CONTRACTIONS === 'on';
}

/**
 * Full form → contraction, in the order they are tried. A verb negation goes first, so
 * "I will not" becomes "I won't", not "I'll not"; a subject goes before "is not", so
 * "it is not" becomes "it's not", the way people say it, not "it isn't".
 */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['was not', "wasn't"],
  ['do not', "don't"],
  ['does not', "doesn't"],
  ['did not', "didn't"],
  ['cannot', "can't"],
  ['will not', "won't"],
  ['would not', "wouldn't"],
  ['could not', "couldn't"],
  ['should not', "shouldn't"],
  ['that is', "that's"],
  ['it is', "it's"],
  ['what is', "what's"],
  ['there is', "there's"],
  ['I am', "I'm"],
  ['you are', "you're"],
  ['we are', "we're"],
  ['they are', "they're"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['I will', "I'll"],
];

/**
 * The full form as a whole-word match, with a lowercase word after it in the same
 * clause. Only the first letter may be a capital ("It is", "it is"): a case-blind
 * match would let "I am NOT" through, and a stressed word should stay stressed.
 */
const PATTERNS = PAIRS.map(([full, short]) => {
  const first = full[0];
  const head = first === 'I' ? 'I' : `[${first}${first.toUpperCase()}]`;
  const body = full.slice(1).replace(' ', String.raw`\s+`);
  return [new RegExp(String.raw`\b${head}${body}\b(?=\s+[a-z])`, 'g'), short] as const;
});

/** Keep the first letter's case: "It is" → "It's", "it is" → "it's", "I am" → "I'm". */
function matchCase(found: string, short: string): string {
  return found[0] === found[0].toUpperCase() ? short[0].toUpperCase() + short.slice(1) : short;
}

/** The text with full forms contracted, calling `hit` once per contraction. */
export function contractForSpeech(text: string, hit: () => void): string {
  return PATTERNS.reduce(
    (acc, [re, short]) =>
      acc.replace(re, (found: string) => {
        hit();
        return matchCase(found, short);
      }),
    text
  );
}
