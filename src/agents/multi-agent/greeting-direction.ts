/**
 * What the director is told when a freshly spawned agent says hello, and the
 * filter its words pass through before they are spoken.
 *
 * @module agents/multi-agent/greeting-direction
 */

import { coachFollowThroughMode } from '../../services/superhuman/commitment-follow-up.js';
import { markWinSurfaced, winForOpener, type Win } from '../../services/superhuman/wins.js';
import { checkInsWithCalls } from '../../services/outreach/call-status.js';
import { claimIfAsked, lineAsks } from './greeting-claim.js';
import { isPonderingOn } from '../../intelligence/pondering/pondering.js';
import { markSurfaced } from '../../intelligence/pondering/pondering-reader.js';
import { ponderingForOpener } from '../../intelligence/pondering/pondering-opener.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { returningCallerGreeting } from '../../services/identity/returning-caller.js';
import { createLogger } from '../../utils/safe-logger.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { getDisplayName, isKnownId } from '../../personas/persona-ids.js';
import type { UserProfile } from '../../types/user-profile.js';
import { firstCallFallback, firstMeeting, withFirstCallIntro } from './first-call-greeting.js';
import { callerHour } from '../shared/time-context.js';
import {
  callerRecognitionFor,
  unrecognisedCallerGreeting,
} from '../voice-agent-entry/caller-recognition.js';
import {
  anniversaryDirection,
  anniversaryFor,
  lineSaysAnniversary,
} from './friendship-anniversary.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { loadWelcomeBack, planWelcomeBack, welcomeBackFacts } from './welcome-back.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { calendarDaysSince, daysAgoInWords } from '../../utils/calendar-days.js';
import * as notYet from './greeting-not-yet.js';
import * as stranger from './first-call-stranger.js';
import { launchDirection, takeCallLaunch } from '../shared/call-launch-hint.js';

// Low-key on purpose: "warm" produced "Hey Sam! Good morning! So good
// to hear your voice!" every call, and the exclamations made the voice
// sound hyped ("too happy to start the call", founder test, 2026-09-29).
// "Did you end up figuring that out?" opened a returning call with nothing to
// pin "that" to (dev, 2026-10-09): a callback must name the thing.
export const GREETING_DIRECTION =
  'They just called you. Answer like you would a friend calling: relaxed and low-key, one short sentence, maybe a quick easy question. No exclamation marks, no "so good to hear your voice", no cheer, do not list what you can do or introduce yourself. If they have called before, you may pick up from last time in a few words, the way a friend would, but only if it was light: never open on something painful. Name the actual thing ("how did the interview go?"), never a vague callback ("did you figure that out?"); if you are not told what you talked about, do not refer back.';

/**
 * FERNI_PLAYFUL=on, Ferni only: warm and a little playful instead of
 * relaxed and low-key, which read as calm and boring (Seth, 2026-10-17).
 * Still no exclamation marks (calmGreeting turns them into full stops) and
 * no hype: "too happy to start the call" is still the failure to avoid.
 */
export const PLAYFUL_GREETING_DIRECTION = GREETING_DIRECTION.replace(
  'relaxed and low-key, one short sentence, maybe a quick easy question. No exclamation marks, no "so good to hear your voice", no cheer,',
  'warm and a little playful, glad it\'s them, one short sentence, maybe a quick easy question or a light, friendly tease. No exclamation marks, no "so good to hear your voice", no hype,'
);

/**
 * The hello's direction for this persona. Never the playful one after a heavy
 * last call (what they talked about reads as heavy-moment.ts does) or when
 * welcome-back held back a tender thread: a tease is no way to pick that up.
 * A first call (`last.firstCall`) gets the stranger's hello (first-call-stranger.ts);
 * `introAs` is set on a first call (FIRST_CALL_INTRO).
 */
export function greetingDirection(
  personaId: string,
  env: Env = process.env,
  last: { topic?: string; tender?: boolean; firstCall?: boolean } = {},
  introAs?: string
): string {
  const playful = personaId === 'ferni' && flagOn('FERNI_PLAYFUL', env);
  const careful = last.tender === true || isHeavyMoment([last.topic]);
  const base = last.firstCall
    ? stranger.STRANGER_GREETING_DIRECTION
    : playful && !careful
      ? PLAYFUL_GREETING_DIRECTION
      : GREETING_DIRECTION;
  return introAs ? withFirstCallIntro(base, introAs) : base;
}

/**
 * Added when they told you last time they meant to do something (COACH_FOLLOW_THROUGH).
 * Without a written example he opened "Hey Sam, did you actually start running
 * again?": a yes-or-no check before any hello, which the judge called an
 * accountability check (dev, 2026-10-11).
 */
export const CHECK_IN_DIRECTION =
  ' They told you they meant to do something: you may say hello, then ask how it went as an open question, naming it in their words ("Hey Sam. How did the running go this week?"). Not a yes-or-no question and not "did you actually", which sound like checking up on them. Skip it if it was painful.';

/**
 * Added when they did something they said they would (a win, wins.ts). Named
 * once, glad with them, and the call is theirs: not a report or a lecture.
 */
export const WIN_DIRECTION =
  ' They did something they told you they would do: say hello, then name it once, glad with them, in a few plain words and the past tense ("Hey Sam. You called your sister, that\'s great."). Then let them talk; do not ask for a report or make a big speech of it.';

/** Added when the nightly pondering pass left one thing to ask about (PONDERING). */
export const PONDER_DIRECTION =
  ' There is one thing from an earlier call you could ask about: you may say hello, then ask how it is going as an open question, naming it in their words ("Hey Sam. How\'s the martial arts going?"). Not a yes-or-no question. Never say you were thinking about them, had them on your mind, or were wondering about it.';

/** "I was just thinking about you": warm once, a tic when it opens every call. */
const THINKING_OF_YOU =
  /\b(?:thinking (?:about|of) you|on my mind|been wondering|was (?:just )?wondering)\b/i;

const log = createLogger({ module: 'greeting-direction' });

/** How long the greeting waits for the caller's open commitments and wins before going without. */
const CHECK_IN_WAIT_MS = 400;

async function inTime<T>(work: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), CHECK_IN_WAIT_MS);
  });
  const result = await Promise.race([work, late]);
  clearTimeout(timer);
  return result;
}

/** The commitment to open on, or undefined (flag off, none open, or too slow). */
async function checkInFor(userId: string | undefined, zone?: string): Promise<string | undefined> {
  if (!isMemberIdentity(userId) || !coachFollowThroughMode()) return undefined;
  // Never one about a call Ferni hasn't completed (held, failed or unheard) or one not yet due.
  const open = await inTime(checkInsWithCalls(userId));
  return open?.find((c) => !c.callNote && !notYet.commitmentAhead(c, Date.now(), zone))?.statement;
}

/** A win not yet named, or undefined (COACH_WINS off, none, or too slow). */
async function winFor(userId: string | undefined): Promise<Win | undefined> {
  if (!isMemberIdentity(userId)) return undefined;
  return inTime(winForOpener(userId));
}

/**
 * One opening thread per call: a win first (it is news since last time and is
 * named only once), else what they said they'd do. A future one-thread arbiter
 * replaces this choice; welcome-back and pondering then defer to the thread.
 */
export function openingThread(
  win: Win | undefined,
  checkIn: string | undefined
): { win?: Win; checkIn?: string } {
  if (win) return { win };
  return checkIn ? { checkIn } : {};
}

interface PonderAsk {
  text: string;
  /** Records it as raised, so no later call asks it again. */
  mark: () => Promise<void>;
}

/**
 * The pondered thing to open on, or undefined: flag off, nothing due, a recent
 * crisis, a first call, or too slow. The pass writes nothing before a caller's
 * second call, and a profile that says this is their first or second call
 * keeps it out too.
 */
async function ponderFor(
  userId: string | undefined,
  history: CallerHistory | undefined
): Promise<PonderAsk | undefined> {
  if (!isMemberIdentity(userId) || !isPonderingOn()) return undefined;
  if (history && history.calls < 2) return undefined;
  const db = getFirestoreDb();
  if (!db) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), CHECK_IN_WAIT_MS);
  });
  const read = ponderingForOpener(db, userId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Pondering not read for the greeting');
    return undefined;
  });
  const found = await Promise.race([read, late]);
  clearTimeout(timer);
  return found && { text: found.text, mark: async () => markSurfaced(db, userId, found.item) };
}

export { lineAsks } from './greeting-claim.js';

/** The "time of day" fact for an hour of the day (0-23). */
export function partOfDayFor(hour: number): string {
  if (hour < 5) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'late evening';
}

/** A greeting without exclamation marks: they make the voice sound hyped. */
export function calmGreeting(text: string): string {
  return text
    .replace(/!+/g, '.')
    .replace(/\.\s*\?/g, '?')
    .replace(/\.{2,}/g, '.');
}

/** What the greeting knows about a returning caller. */
export interface CallerHistory {
  calls: number;
  daysSince?: number;
  lastTopic?: string;
  /** Their first call (ISO), for the friendship anniversary. */
  firstContact?: string;
}

const MAX_TOPIC_CHARS = 160;

/** The caller's history from their profile, or undefined for a first call. */
export function callerHistory(
  profile: {
    totalConversations?: number;
    lastContact?: string | number | Date;
    /** A Firestore Timestamp when read straight from the profile. */
    firstContact?: string | number | Date | { toDate: () => Date };
    /** Only a last-call summary checked for who said what (caller-assertions.ts). */
    lastCallerSummary?: string;
  },
  now: Date = new Date(),
  /** The call's settled zone (phone-parity.ts), never read off the profile here. */
  timeZone?: string
): CallerHistory | undefined {
  const calls = profile.totalConversations ?? 0;
  if (calls <= 0) return undefined;
  const history: CallerHistory = { calls };
  if (profile.lastContact) {
    // Calendar days in their zone: "yesterday" means the calendar day, not 24-48 hours ago
    const last = new Date(profile.lastContact).getTime();
    if (Number.isFinite(last) && last <= now.getTime()) {
      history.daysSince = calendarDaysSince(last, now, timeZone);
    }
  }
  const fc = profile.firstContact;
  const first =
    fc && typeof fc === 'object' && 'toDate' in fc
      ? typeof fc.toDate === 'function'
        ? fc.toDate()
        : undefined
      : fc && new Date(fc);
  if (first && Number.isFinite(first.getTime())) history.firstContact = first.toISOString();
  const topic = profile.lastCallerSummary?.trim();
  if (topic) history.lastTopic = topic.slice(0, MAX_TOPIC_CHARS);
  return history;
}

/**
 * The director's facts for a greeting. A returning caller's greeting may pick
 * up from last time, the way a friend does; a first call stays plain.
 */
export function greetingFacts(
  partOfDay: string,
  userName: string | undefined,
  history: CallerHistory | undefined,
  checkIn?: string,
  ponder?: string,
  win?: string
): Record<string, string> {
  // No time zone, no time of day: guessing it wrong is worse than leaving it out.
  const facts: Record<string, string> = partOfDay ? { 'time of day': partOfDay } : {};
  if (userName) facts['their name'] = userName;
  if (checkIn) facts['something they said they would do'] = checkIn.slice(0, MAX_TOPIC_CHARS);
  if (win) facts['something they said they would do, and did'] = win.slice(0, MAX_TOPIC_CHARS);
  if (ponder)
    facts['something to ask about from an earlier call'] = ponder.slice(0, MAX_TOPIC_CHARS);
  if (!history) return facts;
  facts['how well you know each other'] = `${history.calls} calls so far`;
  if (history.daysSince !== undefined)
    facts['last time you talked'] = daysAgoInWords(history.daysSince);
  if (history.lastTopic) facts['what you talked about last time'] = history.lastTopic;
  return facts;
}

export { firstTalkNote } from '../../services/identity/returning-caller.js';

/** Agent setup knows the profile, the greeting needs it: handed over per session. */
const pendingHistory = new Map<string, CallerHistory>();

export function rememberCallerHistory(sessionId: string, history: CallerHistory | undefined): void {
  if (history) pendingHistory.set(sessionId, history);
}

export function takeCallerHistory(sessionId: string): CallerHistory | undefined {
  const history = pendingHistory.get(sessionId);
  pendingHistory.delete(sessionId);
  return history;
}

// A call Ferni placed to its own user opened "Hey Seth, how's your week been
// treating you?" (prod 2026-10-10): GREETING_DIRECTION says "they just called
// you", and why Ferni called ("Seth asked Ferni to give him a call...") reached
// only the main model's prompt, never the greeting.
export const PROACTIVE_GREETING_DIRECTION =
  'You phoned them and they just picked up. Open the way a friend who called does: hi and their name, then in a few words why you called, in your own words, using only the reason you are given. If the reason is something hard, say it gently and never name how they feel. If no reason is given, just say you were calling to check in; never make one up. Relaxed and low-key, one or two short sentences, no exclamation marks, do not list what you can do.';

/** Why Ferni placed a proactive call, from the outreach job's metadata. */
export interface ProactiveReason {
  triggerReason?: string;
  relatedCommitment?: { summary?: string };
  lastSessionSummary?: string;
}

/** The default the metadata parser fills in when the job gave no reason. */
const PLACEHOLDER_REASONS = new Set(['proactive check-in']);

/** PROACTIVE_REASON_OPENER=on: a proactive call's opener says why Ferni called. */
export function proactiveReasonOpenerEnabled(env: Env = process.env): boolean {
  return flagOn('PROACTIVE_REASON_OPENER', env);
}

/** The reasons the opener may give, as director facts. Empty when the job gave none. */
export function proactiveReasonFacts(reason: ProactiveReason): Record<string, string> {
  const facts: Record<string, string> = {};
  const why = reason.triggerReason?.trim();
  if (why && !PLACEHOLDER_REASONS.has(why.toLowerCase()))
    facts['why you called them'] = why.slice(0, MAX_TOPIC_CHARS);
  const commitment = reason.relatedCommitment?.summary?.trim();
  if (commitment) facts['something they said they would do'] = commitment.slice(0, MAX_TOPIC_CHARS);
  const last = reason.lastSessionSummary?.trim();
  if (last) facts['what you talked about last time'] = last.slice(0, MAX_TOPIC_CHARS);
  return facts;
}

/**
 * A call Ferni placed to its own user (PROACTIVE_REASON_OPENER on): its opener
 * waits for the phone to be picked up, like an on-behalf call's.
 */
export async function isProactiveCall(sessionId: string): Promise<boolean> {
  if (!proactiveReasonOpenerEnabled()) return false;
  const { isProactiveSession } =
    await import('../../intelligence/context-builders/external/proactive-session-context.js');
  return isProactiveSession(sessionId);
}

/** The understudy for a proactive call: says Ferni called, never guesses why. */
export function proactiveFallback(userName: string | undefined, personaId = 'ferni'): string {
  // Whoever placed the call: "call me" can ring with Alex (live-agent-call.ts), not just Ferni.
  const caller = isKnownId(personaId) ? getDisplayName(personaId) : 'Ferni';
  return `Hey${userName ? ` ${userName}` : ''}, it's ${caller}, just calling to check in.`;
}

export interface GreetingUserData {
  callerTimezone?: string;
  userName?: string;
  userId?: string;
  isReturningUser?: unknown;
  /** The session's services: their profile may still be loading (deferred-profile.ts). */
  services?: { userProfile: UserProfile | null };
}

/** The director's hello for this caller and hour, with the scripted greeting as understudy. */
export async function directedGreeting(
  sessionId: string,
  personaId: string,
  userData: GreetingUserData | undefined
): Promise<string> {
  const { generateWarmGreeting } = await import('../shared/warm-greeting.js');
  // A returning caller's greeting can pick up from last time (agent-setup hands it over).
  const history = takeCallerHistory(sessionId);
  const hour = callerHour(new Date(), userData?.callerTimezone);
  const ctx = { hour: hour ?? 12, isReturningUser: history !== undefined };
  const { directedText } = await import('../../speech/direction/index.js');
  const partOfDay = hour === null ? '' : partOfDayFor(hour);
  // A call Ferni placed to its own user (callType proactive_outreach).
  const proactive = proactiveReasonOpenerEnabled()
    ? (
        await import('../../intelligence/context-builders/external/proactive-session-context.js')
      ).getProactiveSessionContext(sessionId)
    : undefined;
  if (proactive) {
    const directed = await directedText(sessionId, {
      moment: 'proactive_greeting',
      direction: PROACTIVE_GREETING_DIRECTION,
      facts: {
        ...greetingFacts(partOfDay, userData?.userName, history),
        ...proactiveReasonFacts(proactive),
      },
      fallback: proactiveFallback(userData?.userName, personaId),
      urgency: 'now',
      maxChars: 180,
    });
    return calmGreeting(directed.text);
  }
  // Not gated on history: the profile behind it can still be loading.
  const [openCheckIn, openWin, pondered, welcome, anniversary, isNew, introName] =
    await Promise.all([
      checkInFor(userData?.userId, userData?.callerTimezone),
      winFor(userData?.userId),
      ponderFor(userData?.userId, history),
      loadWelcomeBack(userData?.userId, personaId, history),
      anniversaryFor(userData?.userId, history, userData?.callerTimezone), // FRIEND_CELEBRATIONS
      stranger.isStrangerCall(userData, history),
      firstMeeting(personaId, userData, history), // FIRST_CALL_INTRO: the name to give
    ]);
  // An unrecognised phone caller: a name given on that number before (RETURNING_CALLER), or ask.
  const unknown =
    returningCallerGreeting(sessionId) ??
    unrecognisedCallerGreeting(callerRecognitionFor(sessionId));
  const firstCall = isNew && !unknown; // never greeted as an old friend
  const stage = firstCall ? ('stranger' as const) : ('friend' as const);
  const scripted = generateWarmGreeting(personaId, { ...ctx, relationshipStage: stage });
  const introAs = unknown ? undefined : introName;
  if (introAs) log.info({ sessionId, personaId }, 'First call: the hello says who is calling');
  // Nothing still ahead, and nothing from before on a same-day return (greeting-not-yet.ts).
  const hold = notYet.openingRestraint(history, userData?.callerTimezone);
  const dueCheckIn = hold.allows(openCheckIn) ? openCheckIn : undefined;
  const launched = launchDirection(takeCallLaunch(sessionId)); // CALL_LAUNCH_CONTEXT: their reason
  const { win, checkIn } =
    unknown || hold.sameDay || launched ? {} : openingThread(openWin, dueCheckIn);
  // One thread per call: why they called, a win or what they said they'd do, then a pondered ask.
  const ask = win || checkIn || launched || !hold.allows(pondered?.text) ? undefined : pondered;
  // Back after a gap (WELCOME_BACK_BOTH_SIDES): one thread, one thing from his life, never the gap.
  const back =
    welcome && !unknown && !launched
      ? planWelcomeBack(welcome, { checkIn: checkIn ?? win?.text, pondered: ask?.text })
      : undefined;
  if (win && userData?.userId) void markWinSurfaced(userData.userId, win.id);
  const direction =
    greetingDirection(
      personaId,
      process.env,
      { topic: history?.lastTopic, tender: back?.heldBack, firstCall },
      introAs
    ) +
    (win ? WIN_DIRECTION : '') +
    (checkIn ? CHECK_IN_DIRECTION : '') +
    (ask && !unknown ? PONDER_DIRECTION : '') +
    (back?.direction ?? '') +
    (anniversary && !unknown ? anniversaryDirection(anniversary) : '') +
    (hold.sameDay ? notYet.SAME_DAY_DIRECTION : '') +
    (unknown ? ` ${unknown}` : '') +
    launched;
  const directed = await directedText(sessionId, {
    moment: 'greeting',
    direction,
    facts: {
      ...welcomeBackFacts(
        greetingFacts(
          partOfDay,
          userData?.userName,
          hold.history,
          checkIn,
          unknown ? undefined : ask?.text,
          win?.text
        ),
        back
      ),
      ...(firstCall ? stranger.FIRST_CALL_FACTS : {}),
    },
    fallback: introAs ? firstCallFallback(userData?.userName, introAs) : scripted,
    urgency: 'now',
    maxChars: 140,
    rejectIf: firstCall ? stranger.impliesSharedPast : undefined,
  });
  const spoken = unknown ? directed.text : afterAsking(directed, scripted, ask);
  if (
    anniversary &&
    !unknown &&
    directed.source === 'actor' &&
    lineSaysAnniversary(spoken, anniversary)
  )
    anniversary.mark();
  // One follow-up per call opener: having asked, the greeting keeps the first
  // recall note from asking about a thread too (greeting-claim.ts).
  if (!unknown && userData?.userId && directed.source === 'actor' && spoken === directed.text) {
    const threads = { checkIn, pondered: ask?.text, lastTopic: history?.lastTopic };
    claimIfAsked(userData.userId, spoken, { ...threads, userName: userData.userName });
  }
  return calmGreeting(spoken);
}

/**
 * The line to speak when a pondered item was offered: the scripted greeting
 * instead of a "thinking about you" line, and the item marked as raised only
 * when the model's line actually asked it (otherwise it waits for another call).
 */
function afterAsking(
  directed: { text: string; source: string },
  scripted: string,
  ask: PonderAsk | undefined
): string {
  if (!ask || directed.source !== 'actor') return directed.text;
  if (THINKING_OF_YOU.test(directed.text)) return scripted;
  if (lineAsks(directed.text, ask.text)) {
    ask
      .mark()
      .catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Pondered item not marked as raised')
      );
  }
  return directed.text;
}
