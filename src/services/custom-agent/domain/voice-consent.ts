/**
 * The spoken consent a person gives before their voice is cloned.
 *
 * Cartesia clones whatever audio it is sent, so the consent check is ours. The
 * person whose voice it is reads a statement aloud, live, that names them, the
 * person the clone is for, and the date, and ends with three random check words
 * so an old recording or someone else's clip can't be replayed. The samples are
 * recorded in the same session, so the consenting voice and the cloned voice are
 * the same voice by construction.
 *
 * The reading must be the statement, word for word and in order. Names must be
 * heard exactly (joined or split is fine), long statement words may be a letter off,
 * the date may come back in any spoken form, and fillers ("um") are ignored. Anything else (a skipped "I agree", "she agrees", "on behalf
 * of my mom", "just kidding", a condition, another language) fails, and the person
 * reads it again. Failing closed is the point: a consent we are unsure of is no
 * consent.
 *
 * Pure rules only: building the statement and scoring a speech-to-text transcript
 * of it. Recording, transcribing and storing the consent are the use case's job.
 *
 * @module services/custom-agent/domain/voice-consent
 */

import {
  consentWords,
  holdsNotANameWord,
  isDateWord,
  isStatementDate,
  heardWords,
  MAX_DATE_WORDS,
  nameHeardAs,
  wordHeard,
} from './heard-words.js';

/** Plain, distinct words that speech to text gets right and nobody says by accident. */
export const CHECK_WORDS: readonly string[] = (
  'apple bridge candle desert eagle forest garden harbor island jacket kettle ' +
  'lemon meadow needle orange pepper rabbit saddle tiger velvet window yellow ' +
  'anchor basket cactus dolphin feather ginger hammer iceberg jungle ladder ' +
  'marble nickel oyster pillow quilt river silver tunnel violin walnut zebra ' +
  'bottle copper dragon falcon glacier'
).split(' ');

const CHECK_WORD_COUNT = 3;

export interface ConsentStatementInput {
  /** The person whose voice will be cloned, as they'd say their own name. */
  subjectName: string;
  /**
   * The person the twin is for, or null for a twin of yourself. The caller decides that
   * from who is signed in, never from the names: two people can share a name.
   */
  creatorName: string | null;
  /** The day it is read, already formatted for speech ("October 31, 2026"). */
  spokenDate: string;
  /** Random number in [0, 1); injected so tests are repeatable. Defaults to Web Crypto. */
  random?: () => number;
}

export interface ConsentStatement {
  text: string;
  checkWords: readonly string[];
  /**
   * The date as written in the text. Speech to text writes dates in many forms, so only
   * its shape is checked (date words and numbers); the check words are what prove the
   * reading is fresh.
   */
  spokenDate: string;
  /** The subject's name, which must be heard where the statement says it. */
  subjectName: string;
  /** The creator's name, or null when the twin is the subject's own ("for my own use"). */
  creatorName: string | null;
}

/** Unpredictable check words, so nobody can record them ahead of time. */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

function pickCheckWords(random: () => number): string[] {
  const pool = [...CHECK_WORDS];
  const picked: string[] = [];
  while (picked.length < CHECK_WORD_COUNT) {
    const r = random();
    // A bad random source must not leave a check word blank: that would drop the freshness proof
    if (!(r >= 0 && r < 1)) throw new RangeError('random() must return a number in [0, 1)');
    const [word] = pool.splice(Math.floor(r * pool.length), 1);
    picked.push(word);
  }
  return picked;
}

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

const MAX_NAME_WORDS = 10;
/** Caps checked before anything else, so a huge "name" costs nothing to refuse. */
const MAX_NAME_CHARS = 100;
const MAX_NAME_TOKENS = MAX_NAME_WORDS * 4;
/** A name word: letters with their marks (Hindi vowel signs), apostrophes, hyphens and joiners. */
const NAME_WORD = /^(?:[\p{L}\p{M}'\u2019\u02bc\u2010\u2011\u2013-]|\u200c|\u200d)+$/u;
/** An initial ("J.") or a short title ("Jr.", "Dr."): the only words that may end in a period. */
const DOTTED_WORD = /^(?:\p{L}|jr|sr|st|dr)\.$/iu;

/**
 * A name a person can say, not a sentence: at most ten name words, none of them a word
 * that says no, gives or takes back consent, or names nobody in particular ("everyone").
 */
function isSpeakableName(name: string): boolean {
  const cleaned = clean(name);
  const words = cleaned.split(' ');
  return (
    cleaned.length <= MAX_NAME_CHARS &&
    consentWords(cleaned).length <= MAX_NAME_TOKENS &&
    words.length <= MAX_NAME_WORDS &&
    words.every((w) => DOTTED_WORD.test(w) || NAME_WORD.test(w)) &&
    !holdsNotANameWord(words)
  );
}

/** Only a date: date words, numbers and "today", nothing that could be a condition. */
const isSpeakableDate = (date: unknown): boolean =>
  typeof date === 'string' && isStatementDate(date);

/** Three distinct words from CHECK_WORDS: the only proof a reading is fresh. */
function hasFreshCheckWords(words: unknown): boolean {
  if (!Array.isArray(words)) return false;
  const list: unknown[] = words;
  return (
    list.length === CHECK_WORD_COUNT &&
    new Set(list).size === CHECK_WORD_COUNT &&
    list.every((w) => typeof w === 'string' && CHECK_WORDS.includes(w))
  );
}

const isName = (name: unknown): boolean => typeof name === 'string' && isSpeakableName(name);

/**
 * Why a statement can't be scored, or null. The scorer may be handed a statement that was
 * stored, sent back by a client or written before these rules, so it checks again.
 */
function statementFault(statement: ConsentStatement): string | null {
  if (!hasFreshCheckWords(statement.checkWords)) return 'a statement without fresh check words';
  const { subjectName, creatorName } = statement;
  if (!isName(subjectName) || (creatorName !== null && !isName(creatorName))) {
    return 'a statement whose names are not names';
  }
  if (!isSpeakableDate(statement.spokenDate)) return 'a statement whose date is not a date';
  return null;
}

/** The statement the subject reads aloud. Throws on a name or date that isn't speakable. */
export function buildConsentStatement(input: ConsentStatementInput): ConsentStatement {
  const subject = clean(input.subjectName);
  const creator = input.creatorName === null ? null : clean(input.creatorName);
  if (!isSpeakableName(subject) || (creator !== null && !isSpeakableName(creator))) {
    throw new RangeError('consent names must be speakable names, not sentences');
  }
  if (!isSpeakableDate(input.spokenDate)) {
    throw new RangeError('the consent date must be a spoken date, not a sentence');
  }
  const forWhom = creator === null ? 'my own use' : `${creator}'s private use`;
  const checkWords = pickCheckWords(input.random ?? secureRandom);
  const spokenDate = clean(input.spokenDate);
  const text =
    `My name is ${subject}. I agree that Ferni may make an AI copy of my voice for ${forWhom}. ` +
    `I can withdraw this consent at any time. Today is ${spokenDate}. ` +
    `My check words are ${checkWords.join(', ')}.`;
  return {
    text,
    checkWords,
    spokenDate,
    subjectName: subject,
    creatorName: creator,
  };
}

/** What the statement is, part by part, in reading order. */
type Part =
  | { kind: 'words'; words: string[]; label: string; exact: boolean }
  | { kind: 'name'; words: string[]; label: string }
  | { kind: 'date'; label: string };

function statementParts(statement: ConsentStatement): Part[] {
  const words = (text: string, label: string, exact = false): Part => ({
    kind: 'words',
    words: consentWords(text),
    label,
    exact,
  });
  const name = (text: string, label: string): Part => ({
    kind: 'name',
    words: consentWords(text),
    label,
  });
  return [
    words('my name is', 'your name'),
    name(statement.subjectName, 'your name'),
    words('I agree that Ferni may make an AI copy of my voice for', 'the agreement'),
    ...(statement.creatorName === null
      ? [words('my own use', 'the agreement')]
      : [
          name(statement.creatorName, 'the name of who it is for'),
          words('private use', 'the agreement'),
        ]),
    words('I can withdraw this consent at any time', 'the agreement'),
    words('today is', 'the date'),
    { kind: 'date', label: 'the date' },
    words('my check words are', 'the check words'),
    words(statement.checkWords.join(' '), 'the check words', true),
  ];
}

export interface ConsentScore {
  /**
   * True only when the whole statement was read, in order, with nothing added, and the
   * statement itself has three distinct check words and real names.
   */
  verified: boolean;
  /** The first part that didn't match ("the agreement"), for asking to read it again; null when verified. */
  mismatch: string | null;
  missingCheckWords: string[];
}

/** Score a speech-to-text transcript of the subject reading the statement. */
export function scoreConsentTranscript(
  statement: ConsentStatement,
  transcript: string
): ConsentScore {
  // Fail closed on a statement that was not built here: no check words, no freshness proof
  const fault = statementFault(statement);
  if (fault) return { verified: false, mismatch: fault, missingCheckWords: [] };
  const heard = heardWords(transcript);
  const heardSet = new Set(heard);
  const missingCheckWords = statement.checkWords.filter((w) => !heardSet.has(w));
  // The date as written is a date too ("today"); statementFault let only date words through
  const ownDate = new Set(consentWords(statement.spokenDate));
  let at = 0;
  for (const part of statementParts(statement)) {
    const fail = { verified: false, mismatch: part.label, missingCheckWords };
    if (part.kind === 'date') {
      const start = at;
      while (at < heard.length && isDateWord(heard[at], ownDate)) at++;
      // A date must be said, and be no more than a date
      if (at === start || at - start > MAX_DATE_WORDS) return fail;
      continue;
    }
    if (part.kind === 'name') {
      const k = nameHeardAs(heard, at, part.words);
      if (!k) return fail;
      at += k;
      continue;
    }
    // Check words are exact: "handle" is not "candle"
    const matches = part.exact ? (said: string, w: string) => said === w : wordHeard;
    if (!part.words.every((w, j) => at + j < heard.length && matches(heard[at + j], w)))
      return fail;
    at += part.words.length;
  }
  if (at !== heard.length) {
    return { verified: false, mismatch: 'something said after the check words', missingCheckWords };
  }
  return { verified: true, mismatch: null, missingCheckWords };
}
