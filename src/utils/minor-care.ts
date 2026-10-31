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
import { statesUnder18 } from './minor-care-detect.js';
import { createLogger } from './safe-logger.js';
import { PLACEHOLDER_IDS } from './synthetic-user.js';
import { sexualTopicHeld, sexualTopicUserHeld } from './sexual-topic-hold.js';
export { sexualReadsSettled } from './sexual-topic-hold.js';

const log = createLogger({ module: 'minor-care' });

type Env = Record<string, string | undefined>;

export function minorCareOn(env: Env = process.env): boolean {
  return flagOn('MINOR_CARE', env);
}

export { askedAboutAge, lastFerniLine, statesUnder18 } from './minor-care-detect.js';

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
  const fresh = sessionPhones.get(sessionId) !== e164;
  sessionPhones.set(sessionId, e164);
  if (sessionPhones.size > MAX_SESSIONS) sessionPhones.delete(sessionPhones.keys().next().value!);
  // The SIP caller joined after the hold was announced without a number: hold the number now.
  if (
    fresh &&
    !derived.has(sessionId) &&
    announced.has(`${sessionId} ${sessionUsers.get(sessionId)}`)
  ) {
    try {
      onPhoneHeld(e164);
    } catch (error) {
      log.warn({ error: String(error) }, 'MINOR_CARE phone hold listener failed');
    }
  }
  // Not held yet: a number another call left on hold holds this call too (minor-care-purge.ts).
  if (fresh && !likely.has(sessionId)) {
    try {
      onPhoneBound(sessionId, e164);
    } catch (error) {
      log.warn({ error: String(error) }, 'MINOR_CARE phone bound listener failed');
    }
  }
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

/** Told when a held, announced session's number is bound only afterwards (minor-care-purge.ts). */
let onPhoneHeld: (e164: string) => void = () => {};

export function setOnPhoneHeld(listener: (e164: string) => void): void {
  onPhoneHeld = listener;
}

/** Told when a session not yet held is bound to a number (minor-care-purge.ts reads its hold). */
let onPhoneBound: (sessionId: string, e164: string) => void = () => {};

export function setOnPhoneBound(listener: (sessionId: string, e164: string) => void): void {
  onPhoneBound = listener;
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
    if (derived.has(sessionId) && statesUnder18(text, options.asked)) restated(sessionId);
    return true;
  }
  if (!statesUnder18(text, options.asked)) return false;
  hold(sessionId, 'MINOR_CARE likely minor');
  return true;
}

function hold(sessionId: string, why: string): void {
  touch(sessionId);
  if (likely.size > MAX_SESSIONS) evictIdle();
  log.info({ sessionId }, why);
  announceHold(sessionId);
}

/** Sessions held only because their number was (holdSession): they never extend its hold. */
const derived = new Set<string>();

/** Held only by its number: the user's record and purge as usual, the number's hold untouched. */
export const derivedHold = (sessionId: string | undefined): boolean =>
  !!sessionId && derived.has(sessionId);

/**
 * Held as if the caller had said they're under 18 (the same note, owner rule, purge and user
 * record): MINOR_CARE_SHARED_HOLD, a call from a number a held call left on hold. Only an age
 * said again extends the number's hold (restated), so a shared line isn't held forever.
 */
export function holdSession(sessionId: string, env: Env = process.env): void {
  if (!minorCareOn(env) || likely.has(sessionId)) return;
  derived.add(sessionId);
  if (derived.size > MAX_SESSIONS) derived.delete(derived.values().next().value!);
  hold(sessionId, 'MINOR_CARE held number');
}

/** A derived hold's caller said their age: announced again as a detection, number included. */
function restated(sessionId: string): void {
  derived.delete(sessionId);
  log.info({ sessionId }, 'MINOR_CARE likely minor');
  announced.delete(`${sessionId} ${sessionUsers.get(sessionId)}`);
  announceHold(sessionId);
}

export function likelyMinor(sessionId: string | undefined): boolean {
  return !!sessionId && likely.has(sessionId);
}

/**
 * Nothing personal is stored for this session: MINOR_CARE holds it (minorHeld), or
 * SEXUAL_TOPIC_BOUNDARY does (sexual-topic-hold.ts).
 */
export function memoryHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  return minorHeld(sessionId, env) || sexualTopicHeld(sessionId, env);
}

/** MINOR_CARE's own hold: flag on, sounds under 18, not a verified owner. Its purge keys on this. */
export function minorHeld(sessionId: string | undefined, env: Env = process.env): boolean {
  if (!sessionId || !minorCareOn(env) || !likely.has(sessionId)) return false;
  touch(sessionId);
  return !ownerExempt(sessionId, env);
}

/** Any sign this caller is under 18: a held read, or MINOR_CARE=shadow's logged one. */
export const ageSignal = (sessionId: string | undefined): boolean =>
  !!sessionId && (likely.has(sessionId) || shadowLogged.has(sessionId));

/** The session is a verified account owner's (caller-recognition.ts registers the check). */
export const verifiedOwner = (sessionId: string | undefined): boolean =>
  !!sessionId && ownerCheck(sessionId);

/** Read this turn's words, then memoryHeld: the per-turn writers' one-line check. */
export function heldAfter(
  sessionId: string | undefined,
  said: string,
  options: HeardOptions = {}
): boolean {
  if (!minorCareOn(options.env)) return sexualTopicHeld(sessionId, options.env);
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
  if (!minorCareOn(env)) return memoryHeld(sessionId, env) || userHeld(userId, env);
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
  if (sexualTopicUserHeld(userId, env)) return true;
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
  derived.clear();
  ownerCheck = () => false;
}
