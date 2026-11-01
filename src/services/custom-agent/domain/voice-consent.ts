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
 * Pure rules only: building the statement and scoring a speech-to-text transcript
 * of it. Recording, transcribing and storing the consent are the use case's job.
 *
 * @module services/custom-agent/domain/voice-consent
 */

/** Plain, distinct words that speech to text gets right and nobody says by accident. */
export const CHECK_WORDS: readonly string[] = [
  'apple',
  'bridge',
  'candle',
  'desert',
  'eagle',
  'forest',
  'garden',
  'harbor',
  'island',
  'jacket',
  'kettle',
  'lemon',
  'meadow',
  'needle',
  'orange',
  'pepper',
  'rabbit',
  'saddle',
  'tiger',
  'velvet',
  'window',
  'yellow',
  'anchor',
  'basket',
  'cactus',
  'dolphin',
  'feather',
  'ginger',
  'hammer',
  'iceberg',
  'jungle',
  'ladder',
  'marble',
  'nickel',
  'oyster',
  'pillow',
  'quilt',
  'river',
  'silver',
  'tunnel',
  'violin',
  'walnut',
  'zebra',
  'bottle',
  'copper',
  'dragon',
  'falcon',
  'glacier',
];

const CHECK_WORD_COUNT = 3;

/** Share of the statement's words a transcript must contain, in any order. */
export const MIN_COVERAGE = 0.8;

export interface ConsentStatementInput {
  /** The person whose voice will be cloned, as they'd say their own name. */
  subjectName: string;
  /** The person the twin is for; the same as subjectName for a twin of yourself. */
  creatorName: string;
  /** The day it is read, already formatted for speech ("October 31, 2026"). */
  spokenDate: string;
  /** Random number in [0, 1); injected so tests are repeatable. Defaults to Web Crypto. */
  random?: () => number;
}

export interface ConsentStatement {
  text: string;
  checkWords: readonly string[];
  /** The date as written in the text; speech to text writes dates in many forms, so it isn't scored. */
  spokenDate: string;
}

/** Unpredictable check words, so nobody can record them ahead of time. */
const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

function pickCheckWords(random: () => number): string[] {
  const pool = [...CHECK_WORDS];
  const picked: string[] = [];
  while (picked.length < CHECK_WORD_COUNT) {
    const [word] = pool.splice(Math.floor(random() * pool.length), 1);
    picked.push(word);
  }
  return picked;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The statement the subject reads aloud. */
export function buildConsentStatement(input: ConsentStatementInput): ConsentStatement {
  const subject = clean(input.subjectName);
  const creator = clean(input.creatorName);
  const forWhom =
    subject.toLowerCase() === creator.toLowerCase() ? 'my own use' : `${creator}'s private use`;
  const checkWords = pickCheckWords(input.random ?? secureRandom);
  const spokenDate = clean(input.spokenDate);
  const text =
    `My name is ${subject}. I agree that Ferni may make an AI copy of my voice for ${forWhom}. ` +
    `I can take this back at any time. Today is ${spokenDate}. ` +
    `My check words are ${checkWords.join(', ')}.`;
  return { text, checkWords, spokenDate };
}

/** Lowercase whole words, numbers dropped (dates come back from speech to text in many forms). */
export function consentWords(text: string): string[] {
  return (text.toLowerCase().match(/\p{L}+(?:'\p{L}+)?/gu) ?? []).map((w) => w.replace(/'s$/, ''));
}

/** Words that turn the statement into a refusal ("I do not agree"); none is in the statement. */
const REFUSAL_WORDS = new Set([
  'not',
  'no',
  'never',
  "don't",
  'dont',
  "won't",
  'cannot',
  "can't",
  'refuse',
  'disagree',
  'deny',
]);

export interface ConsentScore {
  /** True when every check word was said, enough of the statement was, and nothing refused it. */
  verified: boolean;
  /** Refusal words heard ("not", "never"); any one of them means no consent. */
  refusals: string[];
  /** Share of the statement's words (the date excluded) found in the transcript. */
  coverage: number;
  missingCheckWords: string[];
}

/** Score a speech-to-text transcript of the subject reading the statement. */
export function scoreConsentTranscript(
  statement: ConsentStatement,
  transcript: string
): ConsentScore {
  const heard = new Set(consentWords(transcript));
  const expected = consentWords(statement.text.replace(statement.spokenDate, ' '));
  const found = expected.filter((w) => heard.has(w)).length;
  const coverage = expected.length ? found / expected.length : 0;
  const missingCheckWords = statement.checkWords.filter((w) => !heard.has(w));
  const refusals = [...heard].filter((w) => REFUSAL_WORDS.has(w));
  return {
    verified: missingCheckWords.length === 0 && refusals.length === 0 && coverage >= MIN_COVERAGE,
    refusals,
    coverage,
    missingCheckWords,
  };
}
