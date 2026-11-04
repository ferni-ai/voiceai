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
 * fact is checked before it is written. Each sentence a name or word is in is read for
 * whose it is: the nearest "my"/"I"/"me" makes it the speaker's, the nearest "you"/"your"
 * the other side's. A fact is dropped when the caller never made it theirs ("my buddy
 * Theo", or a plain statement that isn't an echo of the persona) and:
 * - persona_canon: a name in it is a persona's canon person or pet (people.json,
 *   canon-facts.json), or
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
  '- These are only the caller\'s lines. "You" and "your" in them mean the AI friend, never the caller: what the caller says or asks about the AI friend (its friends, pets, home, past) is not a fact about the caller. A name the caller only repeats or asks about ("how\'s your friend Theo?") is not a person in their life unless they make it theirs ("my friend Theo").';

const FIRST = new Set(
  "i im i'm i've i'd i'll me my mine myself we we're we've us our ours".split(' ')
);
const SECOND = new Set("you you're you've you'd you'll your yours yourself".split(' '));
const YOUR = new Set(['your', 'yours']);
const CALLER = new Set(['user', 'caller', 'speaker']);
/** "Mine are five and seven" after a question to the persona: the whole line is theirs too. */
const ALSO_MINE = /\b(?:mine|ours|me too|same here|so do i|i do too)\b/i;

/** Lower case, possessive and plural "s" off: "Theo's" and "theo", "dogs" and "dog". */
const norm = (w: string): string => {
  const x = w.toLowerCase().replace(/'s?$/, '');
  return x.length > 3 && /[^s]s$/.test(x) ? x.slice(0, -1) : x;
};
const tokensOf = (text: string): string[] =>
  text.replace(/\u2019/g, "'").match(/[A-Za-z][A-Za-z']*/g) ?? [];
const isWord = (w: string): boolean => w.length >= 3 && !STOPWORDS.has(w) && !CALLER.has(w);

interface Sentence {
  speaker: CallLine['speaker'];
  line: number;
  question: boolean;
  alsoMine: boolean;
  raw: string[];
  words: string[];
}

function sentencesOf(lines: readonly CallLine[]): Sentence[] {
  return lines.flatMap((l, line) =>
    l.text
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((s) => s.trim())
      .map((s) => {
        const raw = tokensOf(s);
        const alsoMine = ALSO_MINE.test(l.text);
        return {
          speaker: l.speaker,
          line,
          question: s.trim().endsWith('?'),
          alsoMine,
          raw,
          words: raw.map(norm),
        };
      })
  );
}

/** Whose the word at `i` is: the nearest pronoun's side, the earlier one on a tie. */
function ownerAt(s: Sentence, i: number): 'first' | 'second' | null {
  for (let d = 1; d < s.raw.length; d++) {
    for (const j of [i - d, i + d]) {
      const t = s.raw[j]?.toLowerCase();
      if (t && FIRST.has(t)) return 'first';
      if (t && SECOND.has(t)) return 'second';
    }
  }
  return null;
}

/** Every content word of a caller sentence was said first by the persona ("Theo and Max."). */
function isEcho(s: Sentence, all: readonly Sentence[]): boolean {
  const own = s.words.filter(isWord);
  if (own.length === 0) return false;
  const heard = new Set(
    all.filter((p) => p.speaker === 'persona' && p.line < s.line).flatMap((p) => p.words)
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

/** The caller made it theirs: "my", or a plain statement that isn't an echo of the persona. */
const callerClaims = (uses: readonly Use[], sentences: readonly Sentence[]): boolean =>
  uses.some(
    (u) =>
      u.s.speaker === 'caller' &&
      (u.owner === 'first' ||
        u.s.alsoMine ||
        (u.owner === null && !u.s.question && !isEcho(u.s, sentences)))
  );

/** A proper name in a persona line: capitalised, and not just a common word starting the sentence. */
const asName = (u: Use): boolean =>
  /^[A-Z]/.test(u.s.raw[u.i]) && (u.i > 0 || !isCommonEnglishWord(u.s.raw[u.i]));

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

/** Why this fact is the persona's, not the caller's; null when it is the caller's to keep. */
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
    if (canon.has(name)) return 'persona_canon';
    const callerUses = uses.filter((u) => u.s.speaker === 'caller');
    const yours = (u: Use): boolean =>
      u.s.raw.slice(Math.max(0, u.i - 3), u.i).some((t) => YOUR.has(t.toLowerCase()));
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
