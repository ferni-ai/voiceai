/**
 * A caller who sounds under 18 (MINOR_CARE=on, off by default): keep nothing
 * personal from the call.
 *
 * Hardening from a call review (2026-10-18): on an unverified call a caller who
 * said they were 16 also gave personal details, and the memory tools kept
 * them. Product call: don't save, gentle care.
 *
 * "Sounds under 18" is read conservatively and only from the caller's own
 * words this call: a stated age under 18 ("I'm 16 years old", "I just turned
 * fifteen", "16." answering "how old are you?") or a school grade they're in
 * ("I'm in 10th grade", "I'm in high school"). Never from their voice or
 * vocabulary, someone else's age ("my son is 16"), the past ("I was 16"), a
 * number with a unit ("I'll be 10 minutes late"), a bare number nobody asked
 * about as an age ("I'm 8" on a pain scale), a school event ("I go to high
 * school games") or a joke ("lol I feel like I'm 12"). A false positive holds
 * an adult's memory for the whole call, so ambiguity reads as adult.
 *
 * memoryHeld(sessionId) is the one check every writer asks: flag on, the
 * caller sounds under 18, and the session is not a verified account owner's
 * (the owner check is registered by caller-recognition.ts, a higher layer).
 * Crisis handling is untouched: nothing here reads or changes crisis code.
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
/** What may follow a stated age: the end, a pause, "years old", or a joining word. Not a unit ("16 minutes"). */
const AFTER_AGE = String.raw`(?=\s*(?:$|[.,!?;:]|years?\s+old\b|yrs?\s+old\b|y\/?o\b|and\b|but\b|so\b|now\b|actually\b|though\b))`;
/** A unit after the number: "10 minutes late", "12 days sober", "15 years sober", "16 percent". */
const UNIT = String.raw`(?:min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?|wks?|months?|(?:years?|yrs?)(?!\s*old)|sec(?:ond)?s?|percent|per\s*cent|%|miles?|mi|km|kilomet(?:er|re)s?|met(?:er|re)s?|feet|foot|ft|inch(?:es)?|pounds?|lbs?|kilos?|kgs?|dollars?|bucks|cents?|points?|pts|times|pages?|steps|reps|laps|o'?clock|[ap]\.?m\b\.?|degrees?|people|sober|more|less|late|early|out\s+of|of|grand|hundred|thousand|k)\b`;
const NO_UNIT = String.raw`(?!\s*-?\s*${UNIT})`;
/** "I'm", not "I feel like I'm" or "as if I'm" (a joke or a comparison). */
const ME = String.raw`(?<!\blike\s)(?<!\bas if\s)(?<!\bas though\s)\b(?:i'm|im|i am)\s+(?:only\s+|just\s+)?`;
/** The start of what they said, after a filler: "um, 16 years old", "yeah, junior in high school". */
const LEAD = String.raw`(?:^|[.!?]\s+)(?:(?:um+|uh+|er+|well|oh|yeah|yes|yep|so|i mean)[,\s]+)*`;
/** Words that make a bare "I'm 16" about age: on their own, "I'm 8" is as likely a 1-10 answer or a golf score. */
const AGE_WORDS = /\b(?:years?[\s-]+old|yrs?[\s-]+old|y\/?o|turn(?:ing|ed)|birthday|b-?day)\b/i;
/** Joking, so not a stated age: "lol I feel like I'm 12", "I'm like 14 now haha". */
const LAUGH = /\b(?:lol+|lmf?ao|rofl|ha(?:ha)+h?|he(?:he)+|jk|just kidding)\b|😂|🤣/i;
/** Ferni's previous line asked their age ("how old are you?"), so a bare "16." answers it. */
const ASKED_AGE = /\b(?:how old|your age|what age|age are you)\b/i;

/** "I'm 16", "im 14, so": an age only with age words or as the answer to "how old are you?". */
const AGE_NOW = new RegExp(`${ME}${AGE}${AFTER_AGE}`, 'gi');
/** "16 years old." at the start, "I'm a 15 year old girl": always an age, theirs. */
const YEARS_OLD = new RegExp(
  String.raw`(?:${LEAD}|${ME}a\s+)${AGE}[\s-]*(?:years?|yrs?)[\s-]*old\b`,
  'gi'
);
/** "16." or "Sixteen." and nothing else, answering "how old are you?". */
const BARE_ANSWER = new RegExp(
  String.raw`^\s*(?:(?:um+|uh+|er+|well|oh|so|yeah|i'm|im|i am|just|only|almost)[,\s]+)*${AGE}\s*[.!]*\s*$`,
  'gi'
);
/** "I just turned 15": the age they are now. */
const TURNED = new RegExp(String.raw`\bi(?: just)? turned\s+${AGE}${AFTER_AGE}`, 'gi');
/** "I'm turning 18 next month", "I turn 16 in May": a year older soon, so younger now. */
const TURNING = new RegExp(String.raw`(?:${ME}turning|\bi turn)\s+${AGE}\b${NO_UNIT}`, 'gi');
/** "I'll be 16 in March": only with a when (or age words), not "I'll be 10" (minutes, at the door). */
const WILL_BE = new RegExp(
  String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}(?=\s*(?:in (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|next (?:week|month|year)|this (?:year|month|week|summer|fall|spring|winter)|on my (?:birthday|b-?day)|soon\b))`,
  'gi'
);

/** "I'll be 16" with age words in the line ("I'll be 16, my birthday's Friday"). */
const WILL_BE_LOOSE = new RegExp(String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}`, 'gi');

/** "I'm in high school" as the whole thing they said, not "high school football games" or "pickup". */
const AFTER_PRED = String.raw`(?=\s*(?:$|[.,!?;:)]|(?:and|but|so|now|right now|this year|still|too|though|actually|at|over|in|near|with|here|yet)\b))`;
const GRADE_WORDS =
  'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
const ORDINAL = String.raw`(?:(?:[1-9]|1[0-2])(?:st|nd|rd|th)|${GRADE_WORDS})`;
/** "I'm in 10th grade", "I'm in the tenth grade", "I go to 9th grade". */
const GRADE = new RegExp(
  String.raw`(?:${ME}(?:in\s+)?|\bi\s+(?:go to|attend)\s+)(?:the\s+)?${ORDINAL}\s+grade\b${AFTER_PRED}`,
  'i'
);
const SCHOOL = String.raw`(?:high|middle|junior high|elementary|grade)\s+school`;
/** "I'm (still) in high school", "I go to middle school", "I'm a high schooler". */
const IN_SCHOOL = new RegExp(
  String.raw`(?:${ME}(?:still\s+)?in\s+|\bi\s+(?:go to|attend)\s+)${SCHOOL}\b${AFTER_PRED}|${ME}a\s+(?:high|middle)\s+schooler\b`,
  'i'
);
/** "I'm a sophomore in high school", or just "Sophomore in high school." as an answer. */
const SCHOOL_YEAR = new RegExp(
  String.raw`(?:${ME}a\s+|${LEAD}(?:a\s+)?)(?:freshman|sophomore|junior|senior)\s+(?:in|at)\s+${SCHOOL}\b${AFTER_PRED}`,
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

/** Ferni's last line in a chat's items, so a bare "16." can answer "how old are you?". */
export function lastFerniLine(
  items: readonly { type: string; role?: string; textContent?: string | undefined }[]
): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.type === 'message' && item.role === 'assistant') return item.textContent;
  }
  return undefined;
}

/** Ferni's line asked how old the caller is. */
export function askedAboutAge(ferniSaid: string | undefined): boolean {
  return !!ferniSaid && ASKED_AGE.test(ferniSaid);
}

/**
 * The caller says, about themselves, that they are under 18. `asked` is
 * Ferni's previous line: a bare "I'm 16" or "16." counts only as the answer
 * to an age question (or with age words like "years old" or "birthday").
 */
export function statesUnder18(text: string, asked?: string): boolean {
  const t = text.replace(/[‘’]/g, "'");
  if (GRADE.test(t) || IN_SCHOOL.test(t) || SCHOOL_YEAR.test(t)) return true;
  if (LAUGH.test(t)) return false;
  const aboutAge = askedAboutAge(asked) || AGE_WORDS.test(t);
  return (
    anyAge(YEARS_OLD, t, 18) ||
    anyAge(TURNED, t, 18) ||
    anyAge(TURNING, t, 19) ||
    anyAge(WILL_BE, t, 19) ||
    (aboutAge && (anyAge(AGE_NOW, t, 18) || anyAge(WILL_BE_LOOSE, t, 19))) ||
    (askedAboutAge(asked) && anyAge(BARE_ANSWER, t, 18))
  );
}

// ---------------------------------------------------------------- per session

/**
 * Sessions whose caller said they're under 18, least recently used first,
 * with when each was last used. Every writer's memoryHeld check uses it, so a
 * session whose call or after-call work is still running stays recent.
 */
const likely = new Map<string, number>();
/** Past this many, sessions idle longer than IDLE_MS go, least recently used first. */
const MAX_SESSIONS = 500;
/** Longer than any call plus its after-call work: a session this idle can't still be writing. */
const IDLE_MS = 6 * 60 * 60 * 1000;
let ownerCheck: (sessionId: string) => boolean = () => false;

function touch(sessionId: string): void {
  likely.delete(sessionId);
  likely.set(sessionId, Date.now());
}

/** Never a session still in use: only those idle past IDLE_MS, oldest first; over the cap otherwise. */
function evictIdle(): void {
  const cutoff = Date.now() - IDLE_MS;
  for (const [sessionId, used] of likely) {
    if (likely.size <= MAX_SESSIONS || used >= cutoff) return;
    likely.delete(sessionId);
  }
}

/** caller-recognition.ts registers how to tell a verified account owner (a higher layer). */
export function setVerifiedOwnerCheck(check: (sessionId: string) => boolean): void {
  ownerCheck = check;
}

interface HeardOptions {
  /** Ferni's previous line, so a bare "16." can answer "how old are you?". */
  asked?: string;
  env?: Env;
}

/** Read the caller's words for this session; true once they have sounded under 18. Flag off: nothing. */
export function noteCallerWords(
  sessionId: string | undefined,
  text: string,
  options: HeardOptions = {}
): boolean {
  if (!sessionId || !minorCareOn(options.env)) return false;
  if (likely.has(sessionId)) {
    touch(sessionId);
    return true;
  }
  if (!statesUnder18(text, options.asked)) return false;
  touch(sessionId);
  if (likely.size > MAX_SESSIONS) evictIdle();
  log.info({ sessionId }, 'MINOR_CARE likely minor');
  return true;
}

export function likelyMinor(sessionId: string | undefined): boolean {
  return !!sessionId && likely.has(sessionId);
}

/** Nothing personal is stored for this session: flag on, sounds under 18, not a verified owner. */
export function memoryHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  if (!sessionId || !minorCareOn(env) || !likely.has(sessionId)) return false;
  touch(sessionId);
  return !ownerCheck(sessionId);
}

/** Read this turn's words, then memoryHeld: the per-turn writers' one-line check. */
export function heldAfter(
  sessionId: string | undefined,
  said: string,
  options: HeardOptions = {}
): boolean {
  if (!minorCareOn(options.env)) return false;
  noteCallerWords(sessionId, said, options);
  return memoryHeld(sessionId, options.env);
}

/** Tests only. */
export function resetMinorCare(): void {
  likely.clear();
  ownerCheck = () => false;
}
