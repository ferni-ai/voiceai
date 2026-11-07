/**
 * Passive farewell and "nobody would miss me" lines, said flat as the end of the line. Joins
 * PASSIVE_IDEATION_PATTERNS in crisis-patterns.ts, just before the Spanish lines: a match marks the
 * turn as a crisis but does not replace the reply on text alone.
 *
 * @module CrisisPatternsFarewell
 */

/** Love, sorry or goodbye sentences before a final farewell ("tell mom i love her. "). */
const FAREWELL_LEAD = String.raw`((i love (you|u)( all| guys| so much)?|love you( all| guys)?|i'?m sorry|sorry|thank you for everything|thanks for everything|tell (my )?\w+ i love (her|him|them|you)|take care( of yourself)?|goodbye|bye)[,.!]* )*`;
/** Filler words that end the line without carrying it on ("nobody would miss me anyway", "... lol"). */
const FILLER_TAIL = String.raw`([ ,]+(anyway|anyways|lol|lmao|haha|tbh|honestly|really|i guess|probably|at all))*`;
/** Who a farewell is said to, at the end of the line ("bye forever everyone"). */
const FAREWELL_TO = String.raw`([ ,]+(everyone|everybody|y'?all|you all|u all|guys|all))?`;

export const FAREWELL_PASSIVE_PATTERNS: { re: RegExp; tag: 'suicidal' }[] = [
  // Nobody would notice the caller gone, said flat and ending the sentence ("nobody would miss
  // me", "no one would notice if i was gone"); "nobody would miss me at the party" carries on.
  // A bare "nobody would care" only as the whole line.
  {
    re: new RegExp(
      String.raw`\b(nobody|no ?one|no-one)('d| would)( even| really| ever| honestly)? (miss me|notice (if|when) i('?m| was| were) gone|care if i (died|was gone|were gone|was dead|were dead|disappeared|wasn'?t here|weren'?t here))( for good| forever)?${FILLER_TAIL}(?=\s*([.!?]|$))|^(nobody|no ?one)('d| would)( even| really)? care${FILLER_TAIL}\s*[.!?]*$`
    ),
    tag: 'suicidal',
  },
  // A farewell said as forever, as the whole line or after only love, sorry or goodbye words
  // ("i love you all. bye forever"). "bye forever, chemistry class!" and "dont wait for me,
  // im running late" carry on, so they stay out.
  {
    re: new RegExp(
      `^${FAREWELL_LEAD}((bye|goodbye|good ?night) forever|(i'?ll|ill|i will) be gone soon|don'?t wait (up )?for me)${FAREWELL_TO}${FILLER_TAIL}\\s*[.!]*$`
    ),
    tag: 'suicidal',
  },
];
