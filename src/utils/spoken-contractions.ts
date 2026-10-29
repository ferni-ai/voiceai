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
 * Whole-word match with a lowercase word after it. Only the first letter may be a
 * capital ("It is", "it is"): a case-blind match would let "I am NOT" and a title
 * ("It Is What It Is") through.
 */
const PATTERNS = PAIRS.map(([full, short]) => {
  const first = full[0];
  const head = first === 'I' ? 'I' : `[${first}${first.toUpperCase()}]`;
  const body = full.slice(1).replace(' ', String.raw`\s+`);
  return {
    re: new RegExp(String.raw`\b${head}${body}\b(?=\s+[a-z])`, 'g'),
    full,
    short,
    negation: /\bnot$|^cannot$/.test(full),
  };
});

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

/** What opens a clause right before a subject: punctuation, or a conjunction / "I think". */
const CLAUSE_LEAD = new RegExp(
  String.raw`(?:^|[.!?;:,—–]|\b(?:and|but|so|or|because|cause|if|when|while|since|though|although|unless|until|think|know|guess|hope|bet|feel|mean|swear|promise|believe))\s*$`,
  'i'
);

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
  return CLAUSE_LEAD.test(said.replace(TRAILING_MARKUP, ''));
}

/** Is the end of `said` inside quotes or a code span? */
function quoted(said: string): boolean {
  const count = (re: RegExp): number => (said.match(re) ?? []).length;
  const singleOpen = count(/(?:^|[\s([—“"])['‘](?=[A-Za-z])/g);
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
