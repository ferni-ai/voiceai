/**
 * A crisis risk phrase never counts where it sits inside a longer, different everyday word
 * (CRISIS_WORD_BOUNDARIES=on, off by default).
 *
 * Several crisis checks read risk words that everyday words contain: early-warning's 'end it'
 * fires on "can you resend it" (crisis_risk, "Provide crisis resources immediately"), and the
 * human-transfer check reads "I want to diet" as suicidal (severity 9), "I hit play on my
 * favorite song" or "I hurt my back this season" as a child-safety concern ('son'), and "what's
 * the pointer for" as "what's the point". A plain \b would also drop real inflections that must
 * keep matching ("kids", "chest pains", "cutting"), so this blanks out listed words instead.
 *
 * off: every check exactly as before. on: a phrase or pattern counts only where it matches the
 * caller's words AND still matches with every word in EVERYDAY blanked out. So it can only
 * remove a match, and only one that rests on a listed word. Only checks that RAISE risk read
 * through here; softeners, idioms, negations and third-party reads keep the caller's words, so
 * a blanked word can never lift a suppression.
 *
 * Read by: wellbeing-tracking early-warning phrase lists (phrase-match.ts, the substring path),
 * human-transfer detectCrisisSignals (escalation-classifier.ts) and the crisis gate's passive,
 * implicit, plan and session-context patterns (crisis-guard.ts).
 *
 * @module utils/crisis-word-boundaries
 */
import { flagOn } from '../config/env-flag.js';

type Env = Record<string, string | undefined>;

/**
 * Everyday words that hold a risk word, by the risk word they hold. Never a word that a crisis
 * check reads as risk or as a risk subject: "change" ("nothing will ever change"), "reason"
 * ("no reason to keep living"), "methods", "messages" ("messages from god") and "today" (a
 * recency cue) are left out on purpose, as is "homeless". Plurals of a risk word are not here.
 */
export const EVERYDAY: Readonly<Record<string, readonly string[]>> = {
  end: ['send', 'resend', 'spend', 'lend', 'attend', 'pretend', 'recommend', 'extend', 'blend'],
  it: ['items', 'itinerary'],
  die: ['diet', 'diets', 'dieting', 'dieter', 'diesel', 'studied', 'audience', 'ingredients'],
  kill: ['skill', 'skills', 'skilled', 'skillet'],
  cut: ['cute', 'cuter', 'cutest', 'execute', 'executed', 'cuticle', 'cuticles'],
  hang: ['hanger', 'hangover', 'hangout'],
  point: ['pointer', 'pointers'],
  me: ['meat', 'meal', 'meals', 'meeting', 'meetings', 'memes'],
  son: ['song', 'songs', 'person', 'season', 'seasons', 'lesson', 'lessons'],
  kid: ['kidding', 'kidney', 'kidneys'],
  baby: ['babysit', 'babysitter', 'babysitting'],
  no: ['casino'],
  alone: ['standalone'],
  up: ['updates', 'upgrade', 'upgrades'],
  on: ['online'],
  face: ['facetime'],
  what: ['somewhat'],
  harm: ['pharmacy', 'harmony'],
  dead: ['deadline', 'deadlines'],
  numb: ['number', 'numbers'],
};

const LISTED = new Set(Object.values(EVERYDAY).flat());

let lastText = '';
let lastBlanked = '';
/** The words with every listed everyday word blanked out, same length (cached for one text). */
export function blankedEveryday(text: string): string {
  if (text !== lastText) {
    lastText = text;
    lastBlanked = text.replace(/[\p{L}\p{N}]+/gu, (w) =>
      LISTED.has(w.toLowerCase()) ? ' '.repeat(w.length) : w
    );
  }
  return lastBlanked;
}

function crisisWordBoundariesOn(env: Env = process.env): boolean {
  return flagOn('CRISIS_WORD_BOUNDARIES', env);
}

/** pattern.test(text); with the flag on, also on the words with listed everyday words blanked. */
export function riskTest(
  pattern: { test(text: string): boolean },
  text: string,
  env: Env = process.env
): boolean {
  if (!pattern.test(text)) return false;
  return !crisisWordBoundariesOn(env) || pattern.test(blankedEveryday(text));
}

/** text.includes(phrase); with the flag on, also with listed everyday words blanked. */
export function riskIncludes(text: string, phrase: string, env: Env = process.env): boolean {
  if (!text.includes(phrase)) return false;
  return !crisisWordBoundariesOn(env) || blankedEveryday(text).includes(phrase);
}
