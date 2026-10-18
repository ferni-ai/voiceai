/**
 * A caller who sounds under 18 (MINOR_CARE=on, off by default): keep nothing
 * personal from the call, and a short note so Ferni stays a kind, careful
 * friend-voice.
 *
 * Hardening from a call review (2026-10-18): on an unverified call a caller who
 * said they were 16 also gave personal details, and the memory tools kept
 * them. Product call: don't save, gentle care.
 *
 * "Sounds under 18" is read conservatively and only from the caller's own
 * words this call: a stated age under 18 ("I'm 16", "I just turned fifteen")
 * or a school grade they're in ("I'm in 10th grade", "I'm in high school").
 * Never from their voice or vocabulary, and never from someone else's age
 * ("my son is 16") or the past ("I was 16").
 *
 * memoryHeld(sessionId) is the one check every writer asks: flag on, the
 * caller sounds under 18, and the session is not a verified account owner's
 * (the owner check is registered by caller-recognition.ts, a higher layer).
 * Crisis handling is untouched: the note is never added to a crisis reply,
 * and nothing here reads or changes crisis code.
 *
 * @module utils/minor-care
 */
import { flagOn } from '../config/env-flag.js';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'minor-care' });

type Env = Record<string, string | undefined>;

export function minorCareOn(env: Env = process.env): boolean {
  return flagOn('MINOR_CARE', env);
}

const WORD_AGES: Record<string, number> = {
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
};
const AGE = `(\\d{1,2}|${Object.keys(WORD_AGES).join('|')})`;
/** What may follow a bare stated age: the end, a pause, "years old", or a joining word. Not a unit ("16 minutes"). */
const AFTER_AGE = String.raw`(?=\s*(?:$|[.,!?;:]|years?\s+old\b|yrs?\s+old\b|y\/?o\b|and\b|but\b|so\b|now\b|actually\b|though\b))`;
const ME = String.raw`\b(?:i'm|im|i am)\s+(?:only\s+|just\s+|like\s+)?`;

/** "I'm 16", "I am fifteen years old", "im 14, so": the age they are now. */
const AGE_NOW = new RegExp(`${ME}${AGE}${AFTER_AGE}`, 'gi');
/** "I just turned 15": the age they are now. */
const TURNED = new RegExp(String.raw`\bi(?: just)? turned\s+${AGE}${AFTER_AGE}`, 'gi');
/** "I'm turning 18 next month", "I'll be 16": a year older soon, so younger now. */
const TURNING = new RegExp(
  String.raw`\b(?:${ME}turning|i(?:'ll| will) be|i turn)\s+${AGE}\b`,
  'gi'
);

const GRADE_WORDS =
  'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
const GRADE = new RegExp(
  `${ME}(?:in\\s+)?(?:the\\s+)?(?:(?:[1-9]|1[0-2])(?:st|nd|rd|th)|${GRADE_WORDS})\\s+grade\\b`,
  'i'
);
const SCHOOL = String.raw`(?:high|middle|junior high|elementary|grade)\s+school`;
/** "I'm in high school", "I'm a sophomore in high school", "I go to middle school", "I'm a high schooler". */
const IN_SCHOOL = new RegExp(
  String.raw`${ME}(?:still\s+)?(?:in\s+${SCHOOL}\b|a\s+(?:freshman|sophomore|junior|senior)\s+(?:in|at)\s+${SCHOOL}\b|a\s+(?:high|middle)\s+schooler\b)|\bi\s+(?:go to|attend)\s+${SCHOOL}\b`,
  'i'
);

function ageOf(word: string): number {
  return WORD_AGES[word.toLowerCase()] ?? Number(word);
}

function anyAge(re: RegExp, text: string, under: number): boolean {
  for (const m of text.matchAll(re)) {
    const age = ageOf(m[1] ?? '');
    if (age >= 6 && age < under) return true;
  }
  return false;
}

/** The caller says, about themselves, that they are under 18. */
export function statesUnder18(text: string): boolean {
  const t = text.replace(/[‘’]/g, "'");
  return (
    anyAge(AGE_NOW, t, 18) ||
    anyAge(TURNED, t, 18) ||
    anyAge(TURNING, t, 19) ||
    GRADE.test(t) ||
    IN_SCHOOL.test(t)
  );
}

// ---------------------------------------------------------------- per session

/** Sessions whose caller said they're under 18 (the oldest go first). */
const likely = new Set<string>();
const MAX_SESSIONS = 500;
let ownerCheck: (sessionId: string) => boolean = () => false;

/** caller-recognition.ts registers how to tell a verified account owner (a higher layer). */
export function setVerifiedOwnerCheck(check: (sessionId: string) => boolean): void {
  ownerCheck = check;
}

/** Read the caller's words for this session; true once they have sounded under 18. */
export function noteCallerWords(sessionId: string | undefined, text: string): boolean {
  if (!sessionId) return false;
  if (likely.has(sessionId)) return true;
  if (!statesUnder18(text)) return false;
  likely.add(sessionId);
  if (likely.size > MAX_SESSIONS) likely.delete(likely.values().next().value as string);
  log.info({ sessionId }, 'MINOR_CARE likely minor');
  return true;
}

export function likelyMinor(sessionId: string | undefined): boolean {
  return !!sessionId && likely.has(sessionId);
}

/** Nothing personal is stored for this session: flag on, sounds under 18, not a verified owner. */
export function memoryHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  if (!sessionId || !minorCareOn(env) || !likely.has(sessionId)) return false;
  return !ownerCheck(sessionId);
}

/** Read this turn's words, then memoryHeld: the per-turn writers' one-line check. */
export function heldAfter(sessionId: string | undefined, said: string, env?: Env): boolean {
  noteCallerWords(sessionId, said);
  return memoryHeld(sessionId, env);
}

export const MINOR_CARE_NOTE =
  "[They sound under 18. Be warm and friendly, like a caring older friend. Don't ask for personal details: where they live, their school's name, their religion or their age. If they mention skipping school, being alone or something worrying, gently ask if they're okay, without a lecture. If they say they love you, kindly keep the same boundary every time: you're glad to talk, and you're a friend-voice, not a partner.]";

/**
 * The note for this reply: flag on and the caller sounds under 18, verified
 * owner or not (care is for whoever is talking). Never with crisis guidance.
 */
export function minorCareNote(
  sessionId: string | undefined,
  said: string,
  options: { careful?: boolean; env?: Env } = {}
): string {
  if (options.careful || !minorCareOn(options.env)) return '';
  return noteCallerWords(sessionId, said) ? MINOR_CARE_NOTE : '';
}

/** Tests only. */
export function resetMinorCare(): void {
  likely.clear();
  ownerCheck = () => false;
}
