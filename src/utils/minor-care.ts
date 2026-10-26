/**
 * A caller who sounds under 18 (MINOR_CARE=on, off by default): keep nothing
 * personal from the call, and a short note so Ferni stays a kind, careful
 * friend-voice.
 *
 * Hardening from a call review (2026-10-18): on an unverified call a caller who
 * said they were 16 also gave personal details, and the memory tools kept
 * them. Product call: don't save, gentle care.
 *
 * "Sounds under 18" is read only from the caller's own words this call: a
 * stated age under 18 ("I'm 16 years old", "I'm only 14", "I just turned
 * fifteen", "16." answering "how old are you?") or a school grade they're in
 * ("I'm in 10th grade", "I'm in high school"). Never from their voice or
 * vocabulary, someone else's age or words ("my son is 16", "she said I'm 14"),
 * the past ("I was 16", "16 years old when I had her"), a number with a unit
 * ("I'm 14 days sober"), a low bare number nobody asked about as an age ("I'm
 * 8" on a pain scale), a parent at a school ("I'm in high school now, waiting
 * for my son") or a joke ("lol I feel like I'm 12"). The cost is asymmetric:
 * a false hold costs an adult one call's memory, a miss stores a child's
 * details, so "I'm" plus 10-17 ending its clause ("I'm 14.") counts.
 *
 * memoryHeld(sessionId) is the one check every writer asks: flag on, the
 * caller sounds under 18, and the session is not a verified account owner's
 * (the owner check is registered by caller-recognition.ts, a higher layer;
 * MINOR_CARE_OWNERS=on holds a verified owner too).
 * Crisis handling is untouched: the note is never added to a crisis reply,
 * and nothing here reads or changes crisis code.
 *
 * MINOR_CARE=shadow runs the same detection and logs it once per session (with
 * whether the session is a verified owner's), but holds nothing and adds no
 * note: a way to measure detection on real calls before holds go live.
 *
 * @module utils/minor-care
 */
import { flagModeOf, flagOn } from '../config/env-flag.js';
import { createLogger } from './safe-logger.js';
import { PLACEHOLDER_IDS } from './synthetic-user.js';

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
/** "I'm 12 years old at heart": the one thing that undoes an explicit "I'm N years old". */
const AT_HEART = String.raw`(?!\s+at heart\b)`;
/** Without "I'm", a past age: "16 years old when I had her", "Sixteen years old is when I started". */
const NOT_PAST = String.raw`(?![\s,]+(?:when i|is when|was when|at heart)\b)`;
/** What may follow a stated age: the end, a pause, "years old", or a joining word. Not a unit ("16 minutes"). */
const AFTER_AGE = String.raw`(?=\s*(?:$|[.,!?;:]|(?:years?|yrs?)\s+old\b${AT_HEART}|y\/?o\b|and\b|but\b|so\b|now\b|actually\b|though\b))`;
/** A unit after the number: "10 minutes late", "12 days sober", "15 years sober", "16 percent". */
const UNIT = String.raw`(?:min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?|wks?|months?|(?:years?|yrs?)(?!\s*old)|sec(?:ond)?s?|percent|per\s*cent|%|miles?|mi|km|kilomet(?:er|re)s?|met(?:er|re)s?|feet|foot|ft|inch(?:es)?|pounds?|lbs?|kilos?|kgs?|dollars?|bucks|cents?|points?|pts|times|pages?|steps|reps|laps|o'?clock|[ap]\.?m\b\.?|degrees?|people|sober|more|less|late|early|out\s+of|of|grand|hundred|thousand|k)\b`;
const NO_UNIT = String.raw`(?!\s*-?\s*${UNIT})`;
/** "I'm", not "I feel like I'm" or "as if I'm" (a joke or a comparison). */
const ME = String.raw`(?<!\blike\s)(?<!\bas if\s)(?<!\bas though\s)\b(?:i'm|im|i am)\s+(?:only\s+|just\s+)?`;
/**
 * A stated age that is someone else's words: only a clear third-party subject right before
 * said/says/goes/told me ("she said I'm 14", "my mom goes I'm 14"). "I (just) said I'm 14" or an
 * unclear subject counts as the caller's own words.
 */
const NOT_REPORTED = String.raw`(?<!\b(?:she|he|they|(?:the|this|that|my|his|her|their|our|your|some|a|an)\s+[a-z']+)\s+(?:said|says|goes|told me|tells me)[,:]?\s+(?:that\s+)?["“”']?)`;
/** "I'm" in an age rule: the caller's own, unless clearly reported. */
const ME_AGE = `${NOT_REPORTED}${ME}`;
/** The start of what they said, after a filler: "um, 16 years old", "yeah, junior in high school". */
const LEAD = String.raw`(?:^|[.!?]\s+)(?:(?:um+|uh+|er+|well|oh|yeah|yes|yep|so|i mean)[,\s]+)*`;
/** Words that make a bare "I'm 16" about age: on their own, "I'm 8" is as likely a 1-10 answer or a golf score. */
const AGE_WORDS = /\b(?:years?[\s-]+old|yrs?[\s-]+old|y\/?o|turn(?:ing|ed)|birthday|b-?day)\b/i;
/** Joking, so not a stated age: "lol I feel like I'm 12", "I'm like 14 now haha". */
const LAUGH = /\b(?:lol+|lmf?ao|rofl|ha(?:ha)+h?|he(?:he)+|jk|just kidding)\b|😂|🤣/i;
/** Ferni's previous line asked their age ("how old are you?"), so a bare "16." answers it. */
const ASKED_AGE = /\b(?:how old|your age|what age|age are you)\b/i;

/** "I'm 16", "im 14, so": an age only with age words or as the answer to "how old are you?". */
const AGE_NOW = new RegExp(`${ME_AGE}${AGE}${AFTER_AGE}`, 'gi');
/** "16 years old." at the start: their age, unless a past tense follows. */
const YEARS_OLD = new RegExp(
  String.raw`${LEAD}${AGE}[\s-]*(?:years?|yrs?)[\s-]*old\b${NOT_PAST}`,
  'gi'
);
/** "I'm a 15 year old girl": always their age. */
const A_YEARS_OLD = new RegExp(
  String.raw`${ME_AGE}a\s+${AGE}[\s-]*(?:years?|yrs?)[\s-]*old\b${AT_HEART}`,
  'gi'
);
/** "I'm 14", "im only 13.", "I'm just fifteen, so": a present age that ends its clause (10-17 only). */
const CLAUSE_END = String.raw`(?=\s*(?:$|[.,!?;:]|(?:so|but|now)\b|and\b(?!\s+a\s+half\b)))`;
const AGE_ENDS = new RegExp(`${ME_AGE}(?:like\\s+)?${AGE}${CLAUSE_END}`, 'gi');
/** Ferni asked for a rating or an amount: "I'm 10." then answers that, not an age. */
const ASKED_AMOUNT =
  /\b(?:scale|one to ten|1 to 10|1-10|rate|rating|out of (?:ten|10)|how (?:many|much|far|long|soon))\b/i;
/** "16." or "Sixteen." and nothing else, answering "how old are you?". */
const BARE_ANSWER = new RegExp(
  String.raw`^\s*(?:(?:um+|uh+|er+|well|oh|so|yeah|i'm|im|i am|just|only|almost)[,\s]+)*${AGE}\s*[.!]*\s*$`,
  'gi'
);
/** "I just turned 15": the age they are now. */
const TURNED = new RegExp(String.raw`\bi(?: just)? turned\s+${AGE}${AFTER_AGE}`, 'gi');
/** "I'm turning 18 next month", "I turn 16 in May": a year older soon, so younger now. */
const TURNING = new RegExp(String.raw`(?:${ME_AGE}turning|\bi turn)\s+${AGE}\b${NO_UNIT}`, 'gi');
/** "I'll be 16 in March": only with a when (or age words), not "I'll be 10" (minutes, at the door). */
const WILL_BE = new RegExp(
  String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}(?=\s*(?:in (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|next (?:week|month|year)|this (?:year|month|week|summer|fall|spring|winter)|on my (?:birthday|b-?day)|soon\b))`,
  'gi'
);

/** "I'll be 16" with age words in the line ("I'll be 16, my birthday's Friday"). */
const WILL_BE_LOOSE = new RegExp(String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}`, 'gi');

/** "I'm in high school" as the whole thing they said, not "high school football games" or "pickup". */
const AFTER_PRED = String.raw`(?=\s*(?:$|[.,!?;:)]|(?:and|but|so|at|over|in|near|with|here)\b|(?:right now|now|this year|still|too|though|actually|yet)\s*(?:$|[.,!?;:)]|(?:and|but|so)\b)))`;
/** "in high school (right) now, waiting for my son": a parent at the school, only when it follows directly. */
const NOT_PARENT = String.raw`(?![\s,]*(?:(?:right\s+)?now[\s,]+)?(?:picking up|pick up|dropping off|drop off|waiting for|waiting on)\s+(?:my|our)\s+(?:kids?|sons?|daughters?|child|children)\b)`;
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
  String.raw`(?:${ME}(?:still\s+)?in\s+|\bi\s+(?:go to|attend)\s+)${SCHOOL}\b${NOT_PARENT}${AFTER_PRED}|${ME}a\s+(?:high|middle)\s+schooler\b`,
  'i'
);
/** "I'm a sophomore in high school", or just "Sophomore in high school." as an answer. */
const SCHOOL_YEAR = new RegExp(
  String.raw`(?:${ME}a\s+|${LEAD}(?:a\s+)?)(?:freshman|sophomore|junior|senior)\s+(?:in|at)\s+${SCHOOL}\b${AFTER_PRED}|${ME}a\s+(?:freshman|sophomore)\b${CLAUSE_END}`,
  'i'
);

function ageOf(word: string): number {
  return WORD_AGES[word.toLowerCase()] ?? Number(word);
}

function anyAge(re: RegExp, text: string, under: number, from = 6): boolean {
  for (const m of text.matchAll(re)) {
    const age = ageOf(m[1] ?? '');
    if (age >= from && age < under) return true;
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
    // A miss stores a child's details; a false hold costs an adult one call's memory.
    (!ASKED_AMOUNT.test(asked ?? '') && anyAge(AGE_ENDS, t, 18, 10)) ||
    anyAge(YEARS_OLD, t, 18) ||
    anyAge(A_YEARS_OLD, t, 18) ||
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
export const IDLE_MS = 6 * 60 * 60 * 1000;
let ownerCheck: (sessionId: string) => boolean = () => false;
/** sessionId -> its userId (session start, and every detector call that knows it), for userHeld. */
const sessionUsers = new Map<string, string>();
/** Past this many, sessions that never sounded under 18 go first, oldest first. */
const MAX_SESSION_USERS = 5000;
/** sessionId -> when it was first bound to a user: a held call's purge drops what came after it. */
const sessionBound = new Map<string, number>();

/** When this session was first bound to a user (session start), if it was. */
export const sessionBoundAt = (sessionId: string | undefined): number | undefined =>
  sessionId === undefined ? undefined : sessionBound.get(sessionId);
/** sessionId -> a phone caller's E.164 (caller-recognition.ts), never logged: its hold covers the number. */
const sessionPhones = new Map<string, string>();

export function bindSessionPhone(sessionId: string, e164: string): void {
  sessionPhones.set(sessionId, e164);
  if (sessionPhones.size > MAX_SESSIONS) sessionPhones.delete(sessionPhones.keys().next().value!);
}

export function sessionPhone(sessionId: string): string | undefined {
  return sessionPhones.get(sessionId);
}

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

type HoldListener = (userId: string, sessionId: string) => void;
/** Told once per user a held session is bound to (minor-care-purge.ts: the shared record). */
let onUserHeld: HoldListener = () => {};
/** "sessionId userId" pairs already announced, bounded like `likely`. */
const announced = new Set<string>();

export function setOnUserHeld(listener: HoldListener): void {
  onUserHeld = listener;
}

/** This session is held and bound to a user: tell the listener, once per (session, user). Never throws. */
function announceHold(sessionId: string): void {
  const userId = sessionUsers.get(sessionId);
  const key = `${sessionId} ${userId}`;
  if (!userId || announced.has(key) || !likely.has(sessionId)) return;
  if (ownerExempt(sessionId)) return;
  announced.add(key);
  if (announced.size > MAX_SESSIONS) announced.delete(announced.values().next().value!);
  try {
    onUserHeld(userId, sessionId);
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CARE hold listener failed');
  }
}

/** caller-recognition.ts registers how to tell a verified account owner (a higher layer). */
export function setVerifiedOwnerCheck(check: (sessionId: string) => boolean): void {
  ownerCheck = check;
}

/**
 * A verified owner is exempt, unless MINOR_CARE_OWNERS=on: a teen with their own account who says
 * they're under 18 is held like anyone else (Seth, 2026-10-24).
 */
function ownerExempt(sessionId: string, env: Env = process.env): boolean {
  return !flagOn('MINOR_CARE_OWNERS', env) && ownerCheck(sessionId);
}

interface HeardOptions {
  /** Ferni's previous line, so a bare "16." can answer "how old are you?". */
  asked?: string;
  env?: Env;
  /** The caller's userId: binds this session to it, so userHeld(userId) follows memoryHeld. */
  userId?: string;
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
  announceHold(sessionId);
  return true;
}

export function likelyMinor(sessionId: string | undefined): boolean {
  return !!sessionId && likely.has(sessionId);
}

/** Nothing personal is stored for this session: flag on, sounds under 18, not a verified owner. */
export function memoryHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  if (!sessionId || !minorCareOn(env) || !likely.has(sessionId)) return false;
  touch(sessionId);
  return !ownerExempt(sessionId, env);
}

/** Read this turn's words, then memoryHeld: the per-turn writers' one-line check. */
export function heldAfter(
  sessionId: string | undefined,
  said: string,
  options: HeardOptions = {}
): boolean {
  if (!minorCareOn(options.env)) return false;
  noteCallerWords(sessionId, said, options);
  bindSessionUser(sessionId, options.userId);
  return memoryHeld(sessionId, options.env);
}

/** This session is this user's (session start, and any detector call that knows the userId). */
export function bindSessionUser(sessionId: string | undefined, userId: string | undefined): void {
  if (!sessionId || !userId || sharedId(userId)) return; // never a placeholder or shared id
  sessionUsers.delete(sessionId);
  sessionUsers.set(sessionId, userId);
  if (!sessionBound.has(sessionId)) sessionBound.set(sessionId, Date.now());
  for (const s of sessionUsers.keys()) {
    if (sessionUsers.size <= MAX_SESSION_USERS) break;
    if (!likely.has(s)) sessionUsers.delete(s);
  }
  for (const s of sessionBound.keys()) {
    if (sessionBound.size <= MAX_SESSION_USERS) break;
    if (!sessionUsers.has(s)) sessionBound.delete(s);
  }
  announceHold(sessionId);
}

/**
 * Every writer's one check (MINOR_CARE on): this session is held, any of this user's sessions
 * is, or the id is a placeholder that can't be bound to a session (userHeld can't see it).
 */
export function writeHeld(
  userId: string | undefined,
  sessionId?: string,
  env: Env = process.env
): boolean {
  if (!minorCareOn(env)) return false;
  return memoryHeld(sessionId, env) || userHeld(userId, env) || sharedId(userId);
}

/** writeHeld, or a hold its caller already read where this process can't see it (chat: ctx.held). */
export function callerHeld(
  ctx: { held?: boolean; userId?: string; sessionId?: string },
  env: Env = process.env
): boolean {
  return ctx.held === true || writeHeld(ctx.userId, ctx.sessionId, env);
}

/**
 * The per-user writers' check, at write time (a flush timer's tick): true whenever memoryHeld is
 * true for any of this user's sessions, from either detector. Never refreshes a session, so a
 * timer can't keep a hold alive past IDLE_MS.
 */
export function userHeld(userId: string | undefined, env: Env = process.env): boolean {
  if (!userId || sharedId(userId) || !minorCareOn(env)) return false;
  for (const [sessionId, owner] of sessionUsers) {
    const used = likely.get(sessionId);
    const live = used !== undefined && Date.now() - used <= IDLE_MS;
    if (owner === userId && live && !ownerExempt(sessionId, env)) return true;
  }
  return false;
}

/** A tool's reply when a held caller's plan wasn't saved: no promise to remember it. */
export const MINOR_CARE_NOT_SAVED =
  "Not saved: nothing from this call is kept. Cheer them on warmly, but don't say you'll remember it or check in on it later.";

export const MINOR_CARE_NOTE =
  "[They sound under 18. Be warm and friendly, like a caring older friend. Don't ask for personal details: where they live, their school's name, their religion or their age. If they mention skipping school, being alone or something worrying, gently ask if they're okay, without a lecture. If they say they love you, kindly keep the same boundary every time: you're glad to talk, and you're a friend-voice, not a partner. Nothing from this call is kept, so never say you'll remember it; if they ask, kindly say you won't keep notes from today.]";

/**
 * The note for this reply: flag on, the caller sounds under 18 and isn't a
 * verified account owner (an owner who mentions school isn't a stranger
 * child). Never with crisis guidance.
 */
export function minorCareNote(
  sessionId: string | undefined,
  said: string,
  options: HeardOptions & { careful?: boolean } = {}
): string {
  if (flagModeOf('MINOR_CARE', options.env) === 'shadow') {
    shadowNote(sessionId, said, options.asked);
    return '';
  }
  if (options.careful || !minorCareOn(options.env)) return '';
  if (sessionId && ownerExempt(sessionId, options.env)) return '';
  return noteCallerWords(sessionId, said, options) ? MINOR_CARE_NOTE : '';
}

/** A verified owner's session bound to this user, if any: purgeHeldUser leaves their state. */
export function ownerSessionFor(userId: string): string | undefined {
  for (const [sessionId, owner] of sessionUsers)
    if (owner === userId && ownerCheck(sessionId)) return sessionId;
  return undefined;
}

/**
 * A placeholder or shared id ('anonymous', 'default', 'unknown', blank): one bucket for many
 * people, so never held, bound or purged. A per-device id (anon:<id>) is one caller's: held.
 */
export function sharedId(userId: string | undefined): boolean {
  return !userId?.trim() || PLACEHOLDER_IDS.has(userId.trim().toLowerCase());
}

/** Shadow sessions already logged, oldest first, bounded like `likely`. */
const shadowLogged = new Set<string>();

/** MINOR_CARE=shadow: log a detection once per session; never hold, never note. */
function shadowNote(sessionId: string | undefined, said: string, asked: string | undefined): void {
  if (!sessionId || shadowLogged.has(sessionId) || !statesUnder18(said, asked)) return;
  shadowLogged.add(sessionId);
  if (shadowLogged.size > MAX_SESSIONS) shadowLogged.delete(shadowLogged.values().next().value!);
  log.info({ sessionId, verifiedOwner: ownerCheck(sessionId) }, 'MINOR_CARE shadow: likely minor');
}

/** Tests only. */
export function resetMinorCare(): void {
  shadowLogged.clear();
  likely.clear();
  sessionUsers.clear();
  sessionBound.clear();
  announced.clear();
  sessionPhones.clear();
  ownerCheck = () => false;
}
