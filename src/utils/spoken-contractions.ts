/**
 * The one contraction rule for Ferni's spoken text: "That is a massive shift" →
 * "That's a massive shift". Two callers use it: linguistic mirroring (a caller who
 * uses contractions hears ours contracted) and the speech director's
 * SPOKEN_CONTRACTIONS lever (#2334: the model writes "That is", "It is", "I am not"
 * on emotional lines and they sound read aloud).
 *
 * Missing a contraction is safe; a wrong one isn't. So a pair contracts only when:
 * - a lowercase word follows it in the same piece: a clause-final "ready when you
 *   are.", a stressed "I am NOT", "That is, ..." and a wrapped "*not*" stay;
 * - it is not inside "double", 'single' or curly quotes or a `code span` (someone's
 *   exact words), counting what was said before this piece;
 * - for a subject + auxiliary (is / am / are / will), the subject opens its clause:
 *   at the reply start, after . ! ? ; : , or a dash, or after "and" / "but" / "I
 *   think" and the like. Otherwise the auxiliary is stranded by a fronted phrase:
 *   "how worried you are about this", "the way you are right now", "who you are
 *   matters" ("you're about this" isn't English). The start of a piece is a clause
 *   start only if the caller says what came before it (`before`): a streamed push
 *   or the text after a [sigh] tag can begin mid-sentence. Unknown: don't contract.
 *   An -ing form next ("how you are feeling") means nothing was fronted, so it can.
 * - the auxiliary is not left stranded by a lone adverb ending the clause ("I am
 *   too.", "they are lately."); "will" needs a verb next ("I will tomorrow." stays);
 *   "what is" needs a complement ("What is it?" stays).
 * A negation ("do not", "was not") contracts anywhere a word follows.
 *
 * `contractBroadly` is mirroring's older, wider rule, kept while
 * MIRROR_SHARED_CONTRACTIONS is off (the default): main's 17 pairs, contracted mid-clause
 * ("Sounds like you're exhausted"), minus its bugs: a stranded or clause-final
 * auxiliary, a pair in caps or title case, and quoted words stay as written.
 *
 * @module utils/spoken-contractions
 */

/**
 * Full form → contraction, in the order they are tried. A verb negation goes first, so
 * "I will not" becomes "I won't", not "I'll not"; a subject goes before "is not", so
 * "it is not" becomes "it's not", the way people say it.
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
  ['here is', "here's"],
  ['I am', "I'm"],
  ['you are', "you're"],
  ['we are', "we're"],
  ['they are', "they're"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['I will', "I'll"],
];

/**
 * Whole-word match of `full`, then `wordAfter` (a lookahead). Only the first letter may
 * be a capital ("It is", "it is"): a case-blind match would let "IT IS" and a title ("It
 * Is What It Is") through. `strict`: "I" only as a capital, and any spacing between words.
 */
function fullForm(full: string, wordAfter: string, strict: boolean): RegExp {
  const first = full[0];
  const head = strict && first === 'I' ? 'I' : `[${first.toLowerCase()}${first.toUpperCase()}]`;
  const body = full.slice(1).replace(' ', strict ? String.raw`\s+` : ' ');
  return new RegExp(String.raw`\b${head}${body}\b${wordAfter}`, 'g');
}

const isNegation = (full: string): boolean => /\bnot$|^cannot$/.test(full);

/** Strict: a lowercase word must follow, so a stressed "I am NOT" stays. */
const PATTERNS = PAIRS.map(([full, short]) => ({
  re: fullForm(full, String.raw`(?=\s+[a-z])`, true),
  full,
  short,
  negation: isNegation(full),
}));

/** Words that start a complement after "what is": "What is going on", not "What is it?". */
const WHAT_IS_STARTERS = new Set(
  'a an the this that these those my your his her our their its some any going gonna up next wrong new so really'.split(
    ' '
  )
);

/** Words that start a complement after "will": a bare verb, or an adverb before one. */
const WILL_STARTERS = new Set(
  (
    'be have do get go make see tell talk call text send check let try keep remember ' +
    'help find ask take give come never always just probably definitely really still'
  ).split(' ')
);

/** A lone adverb that ends the clause leaves the auxiliary stranded: "I am too.", "It is now." */
const STRANDERS = new Set(
  (
    'too though tho either anyway anymore now today tonight tomorrow yesterday again ' +
    'still already sometimes always never also'
  ).split(' ')
);

/** Clause starts right before a subject: punctuation, a conjunction, or "I think" and the like. */
const PUNCT_LEAD = /(?:^|[.!?;:,—–])\s*$/;
const CONJ_LEAD =
  /\b(?:and|but|so|or|because|cause|if|when|while|since|though|although|unless|until)\s*$/i;
const VERB_LEAD = /\b(?:think|know|guess|hope|bet|feel|mean|swear|promise|believe)\s*$/i;
/** "How bad do you think it is": a question's "think" doesn't open a new clause. */
const ASKED = /\b(?:do|did|don't|didn't)\s+you\s+\w+\s*$/i;

/**
 * A wh-word or "the way" earlier in the clause fronted the auxiliary's complement:
 * "how worried (I think) you are about this", "what a mess it is", "who you are".
 */
const FRONTED =
  /\b(?:how|what|who|whoever|where|wherever|whatever|however|the\s+way)\b[^.!?;:,—–]*$/i;

/**
 * An -ing form after is / am / are makes it a progressive auxiliary, which nothing can
 * strand: "I know how you are feeling", "what you are going through" contract anywhere.
 */
const PROGRESSIVE =
  /^\s+(?:gonna|(?!(?:during|nothing|something|anything|everything|morning|evening)\b)[a-z]{2,}ing)\b/;

/** Markup right before the pair ("[laughter] It is", '<break/> It is') says nothing about the clause. */
const TRAILING_MARKUP = /(?:\s*(?:<[^>]*>|\[[^\]]*\]))+\s*$/;

/** Stands in for text before a piece when the caller doesn't know it: never a clause start. */
const UNKNOWN_START = '\u0000';

function opensClause(said: string): boolean {
  const text = said.replace(TRAILING_MARKUP, '');
  if (PUNCT_LEAD.test(text)) return true;
  if (FRONTED.test(text)) return false;
  return CONJ_LEAD.test(text) || (VERB_LEAD.test(text) && !ASKED.test(text));
}

/** Is the end of `said` inside quotes or a code span? */
function quoted(said: string): boolean {
  const count = (re: RegExp): number => (said.match(re) ?? []).length;
  // An opening quote is followed by a letter, or ends `said` (the pair comes right after it).
  const singleOpen = count(/(?:^|[\s([—“"])['‘](?=[A-Za-z]|$)/g);
  const singleClose = count(/(?<=[A-Za-z.,!?])['’](?![A-Za-z])/g);
  return (
    count(/"/g) % 2 === 1 ||
    count(/`/g) % 2 === 1 ||
    count(/“/g) > count(/”/g) ||
    singleOpen > singleClose
  );
}

/** Does the auxiliary have its complement after it? `after` is the text after the pair. */
function complementFollows(full: string, after: string): boolean {
  const next = /^\s+([a-z][a-z'-]*)(\s+[A-Za-z])?/.exec(after);
  if (!next) return false;
  const word = next[1];
  if (full.endsWith('will')) return WILL_STARTERS.has(word);
  if (full === 'what is') return WHAT_IS_STARTERS.has(word) || /\w{3}(ing|ed)$/.test(word);
  // "I am currently hiding" contracts; "they are lately." and "I am too." don't.
  const endsClause = next[2] === undefined;
  return !(endsClause && (STRANDERS.has(word) || /ly$/.test(word)));
}

/** Keep the first letter's case: "It is" → "It's", "it is" → "it's", "I am" → "I'm". */
function matchCase(found: string, short: string): string {
  return found[0] === found[0].toUpperCase() ? short[0].toUpperCase() + short.slice(1) : short;
}

/**
 * `text` with full forms contracted. `before` is everything already said in this
 * reply ('' at its start); `undefined` when not known, and then a pair at the very
 * start of `text` keeps its full form. `hit` is called once per contraction.
 */
export function contractForSpeech(
  text: string,
  before: string | undefined,
  hit: (full: string, short: string) => void = () => {}
): string {
  const lead = before ?? UNKNOWN_START;
  return PATTERNS.reduce(
    (acc, { re, full, short, negation }) =>
      acc.replace(re, (found: string, at: number, all: string) => {
        const said = lead + all.slice(0, at);
        if (quoted(said)) return found;
        const after = all.slice(at + found.length);
        const unstranded = opensClause(said) || (!full.endsWith('will') && PROGRESSIVE.test(after));
        if (!negation && !(unstranded && complementFollows(full, after))) return found;
        hit(full, short);
        return matchCase(found, short);
      }),
    text
  );
}

/** Mirroring's older table and order (MIRROR_SHARED_CONTRACTIONS off): "it is not" → "it isn't". */
const BROAD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['I am', "I'm"],
  ['you are', "you're"],
  ['we are', "we're"],
  ['they are', "they're"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['will not', "won't"],
  ['can not', "can't"],
  ['do not', "don't"],
  ['did not', "didn't"],
  ['could not', "couldn't"],
  ['would not', "wouldn't"],
  ['should not', "shouldn't"],
  ['it is', "it's"],
  ['that is', "that's"],
  ['there is', "there's"],
  ['here is', "here's"],
];

/** After a fronted wh-word, these next words show the complement is still there. */
const NOT_STRANDED = /^\s+(?:like\b|(?!indeed\b)[a-z]{3,}ed\b)/;

/**
 * Mirroring's wider rule: a pair contracts mid-clause wherever a word follows, as it
 * always did ("Sounds like you're exhausted", "I'm Jordan"). Fixed, flag or not: an
 * auxiliary needs a word after it ("ready when you are." stays) and is never contracted
 * after a fronted wh-word ("how worried you are about this"); a pair in caps or title
 * case, or inside quotes or a code span, stays. `negationNeedsWord`: MIRROR_GRAMMAR_GUARD,
 * which still decides whether a clause-final "I do not." contracts.
 */
export function contractBroadly(
  text: string,
  before: string | undefined,
  negationNeedsWord: boolean,
  hit: (full: string, short: string) => void = () => {}
): string {
  const lead = before ?? UNKNOWN_START;
  return BROAD_PAIRS.reduce((acc, [full, short]) => {
    const negation = isNegation(full);
    const wordAfter = negation && !negationNeedsWord ? '' : String.raw`(?=\s+[A-Za-z])`;
    const re = fullForm(full, wordAfter, false);
    return acc.replace(re, (found: string, at: number, all: string) => {
      const said = lead + all.slice(0, at);
      if (quoted(said)) return found;
      const after = all.slice(at + found.length);
      const stranded =
        FRONTED.test(said.replace(TRAILING_MARKUP, '')) &&
        !PROGRESSIVE.test(after) &&
        !NOT_STRANDED.test(after);
      if (!negation && stranded) return found;
      hit(full, short);
      return matchCase(found, short);
    });
  }, text);
}
