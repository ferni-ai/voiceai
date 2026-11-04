/**
 * FACT_SUBJECT_GUARD (off by default): what the persona says about its own life never
 * becomes a fact about the caller.
 *
 * Prod 2026-10-31 and 11-02 (recall trace W15a): Ferni named two friends of his and the
 * caller's next line was just the two names; the after-call sweep, which read caller lines
 * only, stored them as the caller's friends. Two days later the caller said "I thought you
 * had a dog", Ferni said he had none, and deep extraction stored "User does not have a dog".
 *
 * The fix is upstream: with the flag on, the sweep reads the call with both sides tagged
 * (fact-sweep.ts), and both extractors are told whose "you" is (FACT_SUBJECT_RULE). This
 * check is the backstop, and it drops a fact only on POSITIVE evidence that it is the
 * persona's. Anything else is kept: a dropped caller fact is lost for good.
 * - persona_line (sweep only, it has the persona's lines): a persona statement owns a name in
 *   the fact ("my buddies Theo and Wren", "I have a dog named Compass", "Compass is my dog")
 *   and no caller line says anything of its own about it. "Theo and Wren." is an echo;
 *   "Theo? He coaches my son." is a claim. A persona question or mention ("How's Owen
 *   doing?", "I hope Maya's recital went well") owns nothing.
 * - caller_your (both paths): the caller spoke of the fact's thing as the persona's ("your
 *   dog is so cute", "how's your friend Lyle", "I thought you had a dog") and no line of
 *   theirs claims it ("my dog", "I have two"). "You have to try it", "you're gonna love this"
 *   and "you get used to it" own nothing.
 * Only counts and reasons are logged, never text.
 *
 * @module memory/dynamic/fact-subject-guard
 */
import { personFlagOn } from '../../config/person-flag.js';
import type { Env } from '../../config/env-flag.js';
import { isCommonEnglishWord } from '../../utils/common-english-words.js';
import { createLogger } from '../../utils/safe-logger.js';
import { STOPWORDS } from '../domain/forgotten.js';

const log = createLogger({ module: 'fact-subject-guard' });

export type SubjectDropReason = 'persona_line' | 'caller_your';

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
  '- A fact is about the caller only when the caller states it as theirs, or as about a person or thing in their life. "Your X", "you have/had X" and "how\'s your X" in the caller\'s words are about the AI friend, never the caller, and so is anything the AI friend says about its own life (its friends, pets, home, past). A name the caller only repeats or asks about is not a person in their life unless they make it theirs ("my friend Theo", "Theo? He\'s my nephew"). Filler ("you know", "thank you", "you have to try it") changes nothing.';

/** The caller made the line their own. */
const CLAIM =
  /\b(?:my|mine|me|our|ours|same|me too|so do i|i've|we've|(?:i|we) (?:have|had|got|own|do))\b/i;
/** A question or a belief about the persona: "do you have a dog?", "I thought you had a dog". */
const FRAME =
  /\?|^\W*(?:do|does|did|have|has|had)\b|\b(?:thought|think|guess|assumed|figured|heard|believed)\b/i;
const HAVING = new Set(['have', 'had', 'got', 'own']);
const DETERMINER = new Set('a an the any some no one two three four five'.split(' '));
const FILLER = new Set('yes yep yup nope wow right sure huh hmm mostly exactly totally'.split(' '));
const JOIN = new Set(['and', 'or', '&', ',']);

/** Lower case, possessive and plural "s" off: "Theo's" and "theo", "dogs" and "dog". */
const norm = (w: string): string => {
  const x = w.toLowerCase().replace(/'s?$/, '');
  return x.length > 3 && /[^s]s$/.test(x) ? x.slice(0, -1) : x;
};
const tokensOf = (text: string): string[] =>
  text.replace(/’/g, "'").match(/[A-Za-z][A-Za-z']*|[,&]/g) ?? [];
const isWord = (w: string): boolean => /^[a-z]{3}/i.test(w) && !STOPWORDS.has(w.toLowerCase());
const wordsOf = (text: string): string[] => tokensOf(text).filter(isWord).map(norm);
const sentencesOf = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
const isQuestion = (s: string): boolean => s.trim().endsWith('?');

const FIRST_PERSON = /^(?:i|i'm|i've|my|we|our)$/i;

/** "Compass is my dog": token i is "is"/"was", then "my", after a capitalised name. */
const isMyNameAt = (t: readonly string[], i: number): boolean =>
  /^(?:is|was)$/i.test(t[i]) && t[i + 1]?.toLowerCase() === 'my' && /^[A-Z]/.test(t[i - 1] ?? '');

/** Where owned names start after token i ("my best friend Theo", "named Theo"), or -1. */
function namesStartAt(t: readonly string[], i: number, firstPerson: boolean): number {
  const w = t[i].toLowerCase();
  if (w === 'my' || w === 'our') {
    let j = i + 1;
    // "my best friend Theo": up to two plain words before the name
    while (j < i + 3 && /^[a-z]/.test(t[j] ?? '') && isWord(t[j])) j++;
    return j;
  }
  return firstPerson && (w === 'named' || w === 'called') ? i + 1 : -1;
}

/** The capitalised names from token j, joined by and/or/&/comma: "Theo and Wren". */
function namesFrom(t: readonly string[], j: number): string[] {
  const names: string[] = [];
  for (let k = j; /^[A-Z]/.test(t[k] ?? ''); k += JOIN.has(t[k + 1]?.toLowerCase() ?? '') ? 2 : 1)
    names.push(norm(t[k]));
  return names;
}

/** Names a persona statement owns: "my buddies Theo and Wren", "a dog named Compass", "Compass is my dog". */
function ownedNames(sentence: string): string[] {
  const t = tokensOf(sentence);
  const firstPerson = t.some((w) => FIRST_PERSON.test(w));
  return t.flatMap((_, i) => {
    if (isMyNameAt(t, i)) return [norm(t[i - 1])];
    const j = namesStartAt(t, i, firstPerson);
    return j < 0 ? [] : namesFrom(t, j);
  });
}

/** What "your X" / "you have a X" (in a question or belief) names as the persona's. */
function yourThings(line: string): string[] {
  return sentencesOf(line).flatMap((s) => {
    const t = tokensOf(s).map((w) => w.toLowerCase());
    return t.flatMap((w, i) => {
      let j = i + 1;
      if (w === 'you' && HAVING.has(t[i + 1] ?? '') && FRAME.test(s)) j = i + 2;
      else if (w !== 'your' && w !== 'yours') return [];
      if (DETERMINER.has(t[j] ?? '')) j++;
      const things: string[] = [];
      // the thing itself, and at most one word more ("your friend Lyle"): never the rest of the line
      for (; j < t.length && things.length < 2 && isWord(t[j]); j++) things.push(norm(t[j]));
      return things;
    });
  });
}

/** Names in a fact: a non-caller subject ("Theo"), and the capitalised words of the value. */
function namesOf(fact: FactLike): string[] {
  const aboutCaller = /^(?:the\s+)?(?:user|caller|speaker)$/i.test(fact.entityName.trim());
  const value = tokensOf(fact.value).filter(
    (w, i) => /^[A-Z]/.test(w) && (i > 0 || !isCommonEnglishWord(w))
  );
  return [...(aboutCaller ? [] : tokensOf(fact.entityName)), ...value].filter(isWord).map(norm);
}

/** The caller said something of their own: "my"/"I have", or a statement beyond the owned names. */
const claims = (text: string, owned: ReadonlySet<string>): boolean =>
  CLAIM.test(text) ||
  sentencesOf(text).some(
    (s) => !isQuestion(s) && wordsOf(s).some((w) => !owned.has(w) && !FILLER.has(w))
  );

/**
 * Why this fact is the persona's, not the caller's; null when it is the caller's to keep.
 * In doubt it is kept: only positive ownership drops.
 */
export function subjectDropReason(
  fact: FactLike,
  lines: readonly CallLine[]
): SubjectDropReason | null {
  const caller = lines.filter((l) => l.speaker === 'caller');
  const owned = new Set(
    lines
      .filter((l) => l.speaker === 'persona')
      .flatMap((l) => sentencesOf(l.text).filter((s) => !isQuestion(s)))
      .flatMap(ownedNames)
  );
  for (const name of namesOf(fact).filter((n) => owned.has(n))) {
    const said = caller.filter((l) => wordsOf(l.text).includes(name));
    if (!said.some((l) => claims(l.text, owned))) return 'persona_line';
  }
  const words = new Set([...wordsOf(fact.value), ...namesOf(fact)]);
  const claimed = caller.filter((l) => CLAIM.test(l.text)).flatMap((l) => wordsOf(l.text));
  const yours = caller.filter((l) => !CLAIM.test(l.text)).flatMap((l) => yourThings(l.text));
  return yours.some((w) => words.has(w) && !claimed.includes(w)) ? 'caller_your' : null;
}

/**
 * The facts that are the caller's; the others are counted by reason and logged
 * (FACT_SUBJECT_DROPPED), never their text.
 */
export function keepCallerFacts<T extends FactLike>(
  facts: readonly T[],
  lines: readonly CallLine[],
  extractor: 'sweep' | 'deep'
): T[] {
  const dropped: Record<SubjectDropReason, number> = { persona_line: 0, caller_your: 0 };
  const kept = facts.filter((f) => {
    const reason = subjectDropReason(f, lines);
    if (reason) dropped[reason]++;
    return reason === null;
  });
  for (const reason of ['persona_line', 'caller_your'] as const)
    if (dropped[reason] > 0)
      log.info({ reason, count: dropped[reason], extractor }, 'FACT_SUBJECT_DROPPED');
  return kept;
}

/**
 * Deep extraction's facts for one job, guarded when the flag is on for this person. The job
 * holds caller lines only, so only the caller's own "your"/"you had" lines can drop here.
 */
export async function keepCallerOwn<R extends { facts: FactLike[] }>(
  job: { userId: string; transcript: string },
  result: R
): Promise<R> {
  if (!(await factSubjectGuardOn(job.userId))) return result;
  const lines = job.transcript.split('\n').map((text) => ({ speaker: 'caller' as const, text }));
  return { ...result, facts: keepCallerFacts(result.facts, lines, 'deep') };
}
