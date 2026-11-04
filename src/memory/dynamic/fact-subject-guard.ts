/**
 * FACT_SUBJECT_GUARD (off by default): a fact is stored as the caller's only when its
 * subject is the caller, or a person or thing in their life they made their own. What the
 * persona says about itself (its friends, pets, home, past) never becomes a caller fact.
 *
 * Prod 2026-10-31 and 11-02 (recall trace W15a): Ferni named two friends of his and the
 * caller's next line was just the two names; the after-call sweep (fact-sweep.ts), which
 * reads caller lines only, stored them as the caller's friends, and a later call guessed a
 * real friend's voice was one of them. Two days later the caller said "I thought you had a
 * dog", Ferni said he had none, and deep extraction stored "User does not have a dog". No
 * extractor reads persona text: the caller's own line about the persona, read without the
 * persona's, was taken as being about the caller.
 *
 * With the flag on, both extractors are told whose "you" is (FACT_SUBJECT_RULE), and each
 * fact is checked before it is written; in doubt it is kept. The nearest "my"/"I" makes a
 * word the speaker's, the nearest "your"/"you have"/"you're" the other side's ("you know",
 * "thank you" never count). A fact is dropped when the caller never made it theirs ("my
 * buddy Theo", "same", or a plain statement that isn't just the persona's names) and:
 * - persona_canon: a name in it is a persona's canon person or pet that this call shows is
 *   the persona's (a persona line said it, or the caller said "your Theo"), or
 * - persona_line: a persona line of the call owns it ("my buddy Theo plays guitar", "I
 *   don't have a dog"), or the caller only spoke of it as the persona's ("how's your
 *   friend Theo?", "I thought you had a dog").
 * The caller's own "my friend Theo" is kept even when Theo is a canon name. Only counts and
 * reasons are logged, never the text.
 *
 * @module memory/dynamic/fact-subject-guard
 */
import { personFlagOn } from '../../config/person-flag.js';
import type { Env } from '../../config/env-flag.js';
import { isCommonEnglishWord } from '../../utils/common-english-words.js';
import { createLogger } from '../../utils/safe-logger.js';
import { STOPWORDS } from '../domain/forgotten.js';

const log = createLogger({ module: 'fact-subject-guard' });

export type SubjectDropReason = 'persona_canon' | 'persona_line';

/** One line of the call, in call order. */
export interface CallLine {
  speaker: 'caller' | 'persona';
  text: string;
}

interface FactLike {
  entityName: string;
  value: string;
}

/** Whether the guard is on for this person (their cohort value beats the env). */
export async function factSubjectGuardOn(
  userId: string | undefined,
  env: Env = process.env
): Promise<boolean> {
  return personFlagOn(userId, 'FACT_SUBJECT_GUARD', env);
}

/** Told to both extractors with the flag on. */
export const FACT_SUBJECT_RULE =
  '- These are only the caller\'s lines. "Your X", "you have/had X" and "you\'re X" in them are about the AI friend, never the caller: what the caller says or asks about the AI friend (its friends, pets, home, past) is not a fact about the caller. Filler ("you know", "thank you", "you\'d love it") changes nothing: the rest of the line is still the caller\'s. A name the caller only repeats or asks about ("how\'s your friend Theo?") is not a person in their life unless they make it theirs ("my friend Theo").';

const FIRST = new Set(
  "i im i'm i've i'd i'll me my mine myself we we're we've us our ours".split(' ')
);
const YOUR = new Set(['your', 'yours']);
/** "you" owns what follows only when attached to it ("you have", "you got", "you're"). */
const ATTACHED = new Set(['have', 'had', 'has', 'got', 'get', 'own', 'owned', 'are', 'were']);
const THANKS = new Set(['thank', 'thanks', 'bless']);
const CALLER = new Set(['user', 'caller', 'speaker']);
/** "Mine are five and seven", "Same. Two kids.": the whole line is the caller's too. */
const ALSO_MINE = /\b(?:mine|ours|me too|same|so do i|so am i|i do too)\b/i;
/** "Yeah. Ohio." agrees: theirs, unless a word in it is said to be the persona's. */
const AGREES = /^\W*(?:yeah|yep|yup|yes)\b/i;

/** Lower case, possessive and plural "s" off: "Theo's" and "theo", "dogs" and "dog". */
const norm = (w: string): string => {
  const x = w.toLowerCase().replace(/'s?$/, '');
  return x.length > 3 && /[^s]s$/.test(x) ? x.slice(0, -1) : x;
};
const tokensOf = (text: string): string[] =>
  text.replace(/’/g, "'").match(/[A-Za-z][A-Za-z']*/g) ?? [];
const isWord = (w: string): boolean => w.length >= 3 && !STOPWORDS.has(w) && !CALLER.has(w);

interface Sentence {
  speaker: CallLine['speaker'];
  line: number;
  question: boolean;
  alsoMine: boolean;
  agrees: boolean;
  raw: string[];
  words: string[];
  /** The clause of each token: a caller's pronoun owns words in its own clause only. */
  clause: number[];
}

function sentencesOf(lines: readonly CallLine[]): Sentence[] {
  return lines.flatMap((l, line) =>
    l.text
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((s) => s.trim())
      .map((s) => {
        // "Your tip helped, sleeping eight hours now": the second clause is the caller's.
        const parts = l.speaker === 'caller' ? s.split(/[,;:()–—]|\s-\s/) : [s];
        const tokens = parts.map(tokensOf);
        const raw = tokens.flat();
        return {
          speaker: l.speaker,
          line,
          question: s.trim().endsWith('?'),
          alsoMine: ALSO_MINE.test(l.text),
          agrees: AGREES.test(l.text),
          raw,
          words: raw.map(norm),
          clause: tokens.flatMap((t, c) => Array<number>(t.length).fill(c)),
        };
      })
  );
}

/** "your", "you're", or "you" attached to a verb of having or being; never filler. */
function secondAt(raw: readonly string[], j: number): boolean {
  const t = raw[j].toLowerCase();
  if (YOUR.has(t) || t === "you're" || t === "you've") return true;
  if (t !== 'you' || THANKS.has(raw[j - 1]?.toLowerCase() ?? '')) return false;
  return ATTACHED.has(raw[j + 1]?.toLowerCase() ?? '');
}

/** Whose the word at `i` is: the nearest pronoun in its clause, the earlier one on a tie. */
function ownerAt(s: Sentence, i: number): 'first' | 'second' | null {
  for (let d = 1; d < s.raw.length; d++) {
    for (const j of [i - d, i + d]) {
      if (j < 0 || j >= s.raw.length || s.clause[j] !== s.clause[i]) continue;
      if (FIRST.has(s.raw[j].toLowerCase())) return 'first';
      if (secondAt(s.raw, j)) return 'second';
    }
  }
  return null;
}

/** A proper name: capitalised, and not just a common word starting the sentence. */
const nameAt = (s: Sentence, i: number): boolean =>
  /^[A-Z]/.test(s.raw[i]) && (i > 0 || !isCommonEnglishWord(s.raw[i]));

/**
 * The caller only repeated names the persona just gave ("Theo and Max."). Repeating its
 * words ("Love jazz.", "Two kids.") is agreeing, and that is theirs.
 */
function isEcho(s: Sentence, all: readonly Sentence[]): boolean {
  const own = s.words.filter(isWord);
  if (own.length === 0) return false;
  const heard = new Set(
    all
      .filter((p) => p.speaker === 'persona' && p.line < s.line)
      .flatMap((p) => p.words.filter((_, i) => nameAt(p, i)))
  );
  return own.every((w) => heard.has(w));
}

interface Use {
  s: Sentence;
  i: number;
  owner: 'first' | 'second' | null;
}

const usesOf = (word: string, sentences: readonly Sentence[]): Use[] =>
  sentences.flatMap((s) =>
    s.words.flatMap((w, i) => (w === word ? [{ s, i, owner: ownerAt(s, i) }] : []))
  );

/** The caller made it theirs: "my", "same"/"yeah", or a plain statement that isn't an echo. */
const callerClaims = (uses: readonly Use[], sentences: readonly Sentence[]): boolean =>
  uses.some(
    (u) =>
      u.s.speaker === 'caller' &&
      (u.owner === 'first' ||
        u.s.alsoMine ||
        (u.owner === null && (u.s.agrees || (!u.s.question && !isEcho(u.s, sentences)))))
  );

const asName = (u: Use): boolean => nameAt(u.s, u.i);

const personaOwns = (uses: readonly Use[], name: boolean): boolean =>
  uses.some((u) => u.s.speaker === 'persona' && u.owner === 'first' && (!name || asName(u)));

/** Capitalised words; before index `from`, only those that aren't common words. */
const capitalised = (text: string, from: number): string[] =>
  tokensOf(text)
    .filter((t, i) => /^[A-Z]/.test(t) && (i >= from || !isCommonEnglishWord(t)))
    .map(norm);

/**
 * Names in a fact: every word of a non-caller subject ("Theo"), and the capitalised words of
 * the value (not a common word starting it, as in "Does not have a dog").
 */
function namesOf(fact: FactLike, aboutCaller: boolean): string[] {
  const subject = aboutCaller ? [] : tokensOf(fact.entityName).map(norm);
  return [...new Set([...subject, ...capitalised(fact.value, 1)])].filter(isWord);
}

/** "your Theo", "your friend Theo": the caller named it as the persona's. */
const yours = (u: Use): boolean =>
  u.s.raw.slice(Math.max(0, u.i - 3), u.i).some((t) => YOUR.has(t.toLowerCase()));

/**
 * Why this fact is the persona's, not the caller's; null when it is the caller's to keep.
 * In doubt it is kept: a dropped caller fact is a recall loss.
 */
export function subjectDropReason(
  fact: FactLike,
  lines: readonly CallLine[],
  canon: ReadonlySet<string>
): SubjectDropReason | null {
  const sentences = sentencesOf(lines);
  const aboutCaller = /^(?:the\s+)?(?:user|caller|speaker)$/i.test(fact.entityName.trim());
  for (const name of namesOf(fact, aboutCaller)) {
    const uses = usesOf(name, sentences);
    if (uses.length === 0 || callerClaims(uses, sentences)) continue;
    const callerUses = uses.filter((u) => u.s.speaker === 'caller');
    // A canon name alone is never enough ("Owen", "Sam"): this call must show it's the persona's.
    const personaSaid = uses.some((u) => u.s.speaker === 'persona') || callerUses.some(yours);
    if (canon.has(name) && personaSaid) return 'persona_canon';
    if (personaOwns(uses, true) || (callerUses.length > 0 && callerUses.every(yours)))
      return 'persona_line';
  }
  if (!aboutCaller) return null;
  // What the caller is said to have, be or do: theirs if they claimed any word of it.
  const words = [...new Set(tokensOf(fact.value).map(norm))].filter(isWord);
  const uses = words.map((w) => usesOf(w, sentences));
  if (uses.some((u) => callerClaims(u, sentences))) return null;
  const toPersona = (u: Use): boolean =>
    u.s.speaker === 'caller' && u.owner === 'second' && !u.s.question;
  return uses.some((u) => personaOwns(u, false) || u.some(toPersona)) ? 'persona_line' : null;
}

/**
 * The facts that are the caller's; the others are counted by reason and logged
 * (FACT_SUBJECT_DROPPED), never their text.
 */
export function keepCallerFacts<T extends FactLike>(
  facts: readonly T[],
  lines: readonly CallLine[],
  canon: ReadonlySet<string>,
  extractor: 'sweep' | 'deep'
): T[] {
  const dropped: Record<SubjectDropReason, number> = { persona_canon: 0, persona_line: 0 };
  const kept = facts.filter((f) => {
    const reason = subjectDropReason(f, lines, canon);
    if (reason) dropped[reason]++;
    return reason === null;
  });
  for (const reason of ['persona_canon', 'persona_line'] as const)
    if (dropped[reason] > 0)
      log.info({ reason, count: dropped[reason], extractor }, 'FACT_SUBJECT_DROPPED');
  return kept;
}

let canonNames: Promise<ReadonlySet<string>> | undefined;
/**
 * The personas' own people and pets, lower case: every people.json name (canon-people.ts)
 * and the names in each canon-facts.json partner and pets ("Compass", "Sam"). No new store.
 * Normalised as fact words are ("Hollis" and "Hollis's" alike).
 */
export async function personaCanonNames(): Promise<ReadonlySet<string>> {
  canonNames ??= (async () => {
    // Lazily, through the identity context's index: after a call, not at module load.
    const { canonPeople, canonPartnersAndPets } = await import('../../personas/index.js');
    const own = (await canonPartnersAndPets()).flatMap((t) => capitalised(t, Infinity));
    return new Set([...[...(await canonPeople())].map(norm), ...own]);
  })().catch((error: unknown) => {
    log.warn({ error: String(error) }, 'persona canon not loaded: guard runs on the call alone');
    canonNames = undefined; // try again next time
    return new Set<string>();
  });
  return canonNames;
}

/**
 * Deep extraction's facts for one job, guarded when the flag is on for this person. The
 * job holds caller lines only, so persona lines can't vouch here: canon names and the
 * caller's own "you"/"your" lines do.
 */
export async function keepCallerOwn<R extends { facts: FactLike[] }>(
  job: { userId: string; transcript: string },
  result: R
): Promise<R> {
  if (!(await factSubjectGuardOn(job.userId))) return result;
  const lines = job.transcript.split('\n').map((text) => ({ speaker: 'caller' as const, text }));
  return {
    ...result,
    facts: keepCallerFacts(result.facts, lines, await personaCanonNames(), 'deep'),
  };
}
