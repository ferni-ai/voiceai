/**
 * Speak the Spanish crisis lines in Spanish (#4062).
 *
 * The call voice was always sent `language: "en"`, so the Spanish crisis script
 * came out with English numbers: "llamar al nine-eight-eight y oprimir two".
 * Measured on the production voice: every number clip detected as English,
 * P(en) = 1.00, with "oprimir 2" heard as "tú". With `language: "es"` alone,
 * 911 reads like "novecientos once", so the numbers are also written as digit
 * words. Both halves live here:
 *
 * - `markSpanish`: a reply that carries one of the fixed Spanish crisis lines
 *   is a Spanish reply. The speech pass marks it, and the TTS gateway sends
 *   `language: "es"` for it (replyLanguage). Every other reply stays "en",
 *   byte for byte.
 * - `speakSpanishLine`: inside those lines, 988 and 911 after "al"/"el" become
 *   "nueve, ocho, ocho" and "nueve, uno, uno", "oprimir 2" becomes "oprimir
 *   dos", and "las 24 horas" becomes "las veinticuatro horas". The transcript
 *   keeps the digits; only the text going to the voice changes.
 *
 * Fixed lines only. A model's own Spanish words are not keyed here (#4063).
 *
 * @module services/safety/crisis-line-speech-es
 */
import { YOUTH_SCRIPT_LINE_ES } from '../../utils/minor-crisis-care.js';
import { SAFETY_QUESTION_ES, TALK_TO_988_ES } from './crisis-guard-replies.js';

type SpokenLanguage = 'en' | 'es';

/** The Spanish 988 script's first words (getCrisisResponse, crisis-guard-replies.ts). */
const SCRIPT_OPENING_ES = 'Escucho cuánto dolor sientes ahora';

/**
 * Text that makes a reply a Spanish crisis line. A reply is spoken in one
 * language, decided by its first words, so each key starts its line.
 */
const SPANISH_CRISIS_KEYS: readonly string[] = [
  SCRIPT_OPENING_ES,
  TALK_TO_988_ES,
  YOUTH_SCRIPT_LINE_ES,
  SAFETY_QUESTION_ES,
];

const LONGEST_KEY = Math.max(...SPANISH_CRISIS_KEYS.map((k) => k.length));

/** Whether text carries a Spanish crisis line. */
export function hasSpanishCrisisLine(text: string): boolean {
  return SPANISH_CRISIS_KEYS.some((key) => text.includes(key));
}

/**
 * Whether a reply's first words could still grow into a Spanish crisis line.
 * The speech pass holds them until they can't, so the reply is marked before
 * the voice reads its language, however the text is chunked. Complete SSML
 * tags are skipped; an unclosed one could still be a tag, so it holds too.
 */
export function mayStartSpanishCrisisLine(text: string): boolean {
  const words = text.replace(/<[^>]*>/g, '').trimStart();
  if (words.startsWith('<')) return true;
  return SPANISH_CRISIS_KEYS.some((key) => key.length > words.length && key.startsWith(words));
}

/** How far back a key can start: a key split across chunks is still found. */
export const SPANISH_KEY_WINDOW = LONGEST_KEY;

const SPOKEN_ES: Record<string, string> = {
  '988': 'nueve, ocho, ocho',
  '911': 'nueve, uno, uno',
  '2': 'dos',
  '24': 'veinticuatro',
};
/**
 * The numbers as the Spanish lines write them: 988 or 911 after "al"/"el"
 * ("al 988", "llama al 911", "en el 911"), "oprimir 2", "las 24 horas".
 * One pattern, so one pass keeps every match's offsets in the original text.
 */
const NUMBER_ES = new RegExp(
  [
    String.raw`(?<=\b(?:al|el) )(?:988|911)(?![\w%]|[.,]\d)`,
    String.raw`(?<=\boprimir )2(?!\d)`,
    String.raw`(?<=\blas )24(?!\d)`,
  ].join('|'),
  'g'
);

/**
 * Rewrite the Spanish crisis numbers to digit words. Only matches inside
 * [from, to) are rewritten; the text around them is context for the cues.
 */
export function speakSpanishLine(text: string, from = 0, to = text.length): string {
  return text.replace(NUMBER_ES, (m: string, at: number) =>
    at >= from && at + m.length <= to ? SPOKEN_ES[m] : m
  );
}

/**
 * One reply's spoken language: marked Spanish by the speech pass, and fixed
 * the first time the voice reads it, so a reply never switches language
 * part-way through.
 */
export interface ReplyLanguage {
  markSpanish: () => void;
  read: () => SpokenLanguage;
}

export function replyLanguage(): ReplyLanguage {
  let spanish = false;
  let fixed: SpokenLanguage | undefined;
  return {
    markSpanish: () => {
      spanish = true;
    },
    read: () => (fixed ??= spanish ? 'es' : 'en'),
  };
}
