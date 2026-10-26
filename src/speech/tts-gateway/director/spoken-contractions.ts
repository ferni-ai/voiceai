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
 * An auxiliary (is / am / are / will) contracts only when what follows starts its
 * complement (the Following Valent Constraint: Hudson et al., J. Linguistics 2026).
 * "Who you are matters" and "where it is now" keep the full form: the next word is
 * an adverb or a new verb, and "you're matters" isn't English. So the next word
 * must be on a small allowlist of complement starters (a determiner, "not",
 * "going", an adjective, an -ing or -ed form), and nothing contracts right after a
 * wh-word, "as" or "than". Missing a contraction is safe; a wrong one isn't.
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
 * The pair must be followed by a lowercase word, so a wrapped "*not*" (emphasis,
 * still in the text when this runs) also keeps the full form.
 */
const PATTERNS = PAIRS.map(([full, short]) => {
  const first = full[0];
  const head = first === 'I' ? 'I' : `[${first}${first.toUpperCase()}]`;
  const body = full.slice(1).replace(' ', String.raw`\s+`);
  const negation = /\bnot$|^cannot$/.test(full);
  return [new RegExp(String.raw`\b${head}${body}\b(?=\s+[a-z])`, 'g'), short, negation] as const;
});

/** Words that start a complement after is / am / are. */
const COMPLEMENT_STARTERS = new Set(
  (
    'a an the this that these those my your his her our their its some any no every all ' +
    'one two not going gonna so really just very pretty such kind sort totally completely ' +
    'always never also still about only actually definitely probably literally exactly ' +
    'okay ok fine right wrong sure glad sorry proud happy sad ready good great bad hard ' +
    'tough true fair funny weird normal real allowed back out off over done tired scared ' +
    'worried afraid excited nervous lucky safe alone different enough who what where why how'
  ).split(' ')
);

/** Words that start a complement after "will": a bare verb, or an adverb before one. */
const WILL_STARTERS = new Set(
  (
    'be have do get go make see tell talk call text send check let try keep remember ' +
    'help find ask take give come never always just probably definitely really still'
  ).split(' ')
);

/** After one of these the auxiliary is stranded: "who you are", "as easy as it is". */
const GAP_OPENERS = new Set(
  'who what where when why how as than wherever however whatever whoever whichever'.split(' ')
);

/** Does the next word start the auxiliary's complement? `after` is the text after the pair. */
function complementFollows(full: string, after: string): boolean {
  const next = /^\s+([a-z][a-z'-]*)(\s+[a-z])?/.exec(after);
  if (!next) return false;
  const word = next[1];
  if (full.endsWith('will')) return WILL_STARTERS.has(word);
  if (COMPLEMENT_STARTERS.has(word)) return true;
  // "I am currently hiding", "that is incredibly frustrating": an -ly adverb counts
  // only when a word follows it, so "they are lately." stays as written.
  if (/ly$/.test(word)) return next[2] !== undefined;
  return word.length > 4 && /(ing|ed)$/.test(word);
}

/** Keep the first letter's case: "It is" → "It's", "it is" → "it's", "I am" → "I'm". */
function matchCase(found: string, short: string): string {
  return found[0] === found[0].toUpperCase() ? short[0].toUpperCase() + short.slice(1) : short;
}

/** The text with full forms contracted, calling `hit` once per contraction. */
export function contractForSpeech(text: string, hit: () => void): string {
  return PATTERNS.reduce(
    (acc, [re, short, negation]) =>
      acc.replace(re, (found: string, at: number, all: string) => {
        if (!negation) {
          const before = /([A-Za-z']+)\s+$/.exec(all.slice(0, at));
          if (before && GAP_OPENERS.has(before[1].toLowerCase())) return found;
          if (!complementFollows(found.split(/\s+/).join(' '), all.slice(at + found.length))) {
            return found;
          }
        }
        hit();
        return matchCase(found, short);
      }),
    text
  );
}
