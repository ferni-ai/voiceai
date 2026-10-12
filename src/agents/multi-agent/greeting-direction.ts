/**
 * What the director is told when a freshly spawned agent says hello, and the
 * filter its words pass through before they are spoken.
 *
 * @module agents/multi-agent/greeting-direction
 */

import {
  callCheckIns,
  coachFollowThroughMode,
} from '../../services/superhuman/commitment-follow-up.js';
import { markWinSurfaced, winForOpener, type Win } from '../../services/superhuman/wins.js';
import { callerHour } from '../shared/time-context.js';
import {
  callerRecognitionFor,
  unrecognisedCallerGreeting,
} from '../voice-agent-entry/caller-recognition.js';
import { loadWelcomeBack, planWelcomeBack, welcomeBackFacts } from './welcome-back.js';

// Low-key on purpose: "warm" produced "Hey Sam! Good morning! So good
// to hear your voice!" every call, and the exclamations made the voice
// sound hyped ("too happy to start the call", founder test, 2026-09-29).
// "Did you end up figuring that out?" opened a returning call with nothing to
// pin "that" to (dev, 2026-10-09): a callback must name the thing.
export const GREETING_DIRECTION =
  'They just called you. Answer like you would a friend calling: relaxed and low-key, one short sentence, maybe a quick easy question. No exclamation marks, no "so good to hear your voice", no cheer, do not list what you can do or introduce yourself. If they have called before, you may pick up from last time in a few words, the way a friend would, but only if it was light: never open on something painful. Name the actual thing ("how did the interview go?"), never a vague callback ("did you figure that out?"); if you are not told what you talked about, do not refer back.';

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
async function checkInFor(userId: string | undefined): Promise<string | undefined> {
  if (!userId || userId === 'anonymous' || !coachFollowThroughMode()) return undefined;
  return (await inTime(callCheckIns(userId)))?.[0]?.statement;
}

/** A win not yet named, or undefined (COACH_WINS off, none, or too slow). */
async function winFor(userId: string | undefined): Promise<Win | undefined> {
  if (!userId || userId === 'anonymous') return undefined;
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
}

const MAX_TOPIC_CHARS = 160;

/** The caller's history from their profile, or undefined for a first call. */
export function callerHistory(
  profile: {
    totalConversations?: number;
    lastContact?: string | number | Date;
    lastConversationSummary?: string;
  },
  now: Date = new Date()
): CallerHistory | undefined {
  const calls = profile.totalConversations ?? 0;
  if (calls <= 0) return undefined;
  const history: CallerHistory = { calls };
  if (profile.lastContact) {
    const ms = now.getTime() - new Date(profile.lastContact).getTime();
    if (Number.isFinite(ms) && ms >= 0) history.daysSince = Math.floor(ms / 86_400_000);
  }
  const topic = profile.lastConversationSummary?.trim();
  if (topic) history.lastTopic = topic.slice(0, MAX_TOPIC_CHARS);
  return history;
}

function lastTalked(days: number): string {
  if (days === 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `about ${Math.round(days / 7)} weeks ago`;
  return 'a while ago';
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
  win?: string
): Record<string, string> {
  // No time zone, no time of day: guessing it wrong is worse than leaving it out.
  const facts: Record<string, string> = partOfDay ? { 'time of day': partOfDay } : {};
  if (userName) facts['their name'] = userName;
  if (checkIn) facts['something they said they would do'] = checkIn.slice(0, MAX_TOPIC_CHARS);
  if (win) facts['something they said they would do, and did'] = win.slice(0, MAX_TOPIC_CHARS);
  if (!history) return facts;
  facts['how well you know each other'] = `${history.calls} calls so far`;
  if (history.daysSince !== undefined)
    facts['last time you talked'] = lastTalked(history.daysSince);
  if (history.lastTopic) facts['what you talked about last time'] = history.lastTopic;
  return facts;
}

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

/** The director's hello for this caller and hour, with the scripted greeting as understudy. */
export async function directedGreeting(
  sessionId: string,
  personaId: string,
  userData: { callerTimezone?: string; userName?: string; userId?: string } | undefined
): Promise<string> {
  const { generateWarmGreeting } = await import('../shared/warm-greeting.js');
  // A returning caller's greeting can pick up from last time (agent-setup hands it over).
  const history = takeCallerHistory(sessionId);
  const hour = callerHour(new Date(), userData?.callerTimezone);
  const ctx = {
    hour: hour ?? 12,
    isReturningUser: history !== undefined,
    relationshipStage: 'friend' as const, // Default for multi-agent
  };
  const scripted = generateWarmGreeting(personaId, ctx);
  const { directedText } = await import('../../speech/direction/index.js');
  const partOfDay = hour === null ? '' : partOfDayFor(hour);
  // Not gated on history: the profile behind it can still be loading.
  const [openCheckIn, openWin, welcome] = await Promise.all([
    checkInFor(userData?.userId),
    winFor(userData?.userId),
    loadWelcomeBack(userData?.userId, personaId, history),
  ]);
  // A phone caller Ferni hasn't recognised: ask who it is (caller-recognition.ts).
  const unknown = unrecognisedCallerGreeting(callerRecognitionFor(sessionId));
  const { win, checkIn } = unknown ? {} : openingThread(openWin, openCheckIn);
  // Back after a gap (WELCOME_BACK_BOTH_SIDES): one thread, one thing from his life, never the gap.
  const back =
    welcome && !unknown ? planWelcomeBack(welcome, { checkIn: checkIn ?? win?.text }) : undefined;
  if (win && userData?.userId) void markWinSurfaced(userData.userId, win.id);
  const direction =
    GREETING_DIRECTION +
    (win ? WIN_DIRECTION : '') +
    (checkIn ? CHECK_IN_DIRECTION : '') +
    (back?.direction ?? '') +
    (unknown ? ` ${unknown}` : '');
  const directed = await directedText(sessionId, {
    moment: 'greeting',
    direction,
    facts: welcomeBackFacts(
      greetingFacts(partOfDay, userData?.userName, history, checkIn, win?.text),
      back
    ),
    fallback: scripted,
    urgency: 'now',
    maxChars: 140,
  });
  return calmGreeting(directed.text);
}
