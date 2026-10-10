/**
 * What the director is told when a freshly spawned agent says hello, and the
 * filter its words pass through before they are spoken.
 *
 * @module agents/multi-agent/greeting-direction
 */

import { callerHour } from '../shared/time-context.js';

// Low-key on purpose: "warm" produced "Hey Sam! Good morning! So good
// to hear your voice!" every call, and the exclamations made the voice
// sound hyped ("too happy to start the call", founder test, 2026-09-29).
// "Did you end up figuring that out?" opened a returning call with nothing to
// pin "that" to (dev, 2026-10-09): a callback must name the thing.
export const GREETING_DIRECTION =
  'They just called you. Answer like you would a friend calling: relaxed and low-key, one short sentence, maybe a quick easy question. No exclamation marks, no "so good to hear your voice", no cheer, do not list what you can do or introduce yourself. If they have called before, you may pick up from last time in a few words, the way a friend would, but only if it was light: never open on something painful. Name the actual thing ("how did the interview go?"), never a vague callback ("did you figure that out?"); if you are not told what you talked about, do not refer back.';

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
  history: CallerHistory | undefined
): Record<string, string> {
  // No time zone, no time of day: guessing it wrong is worse than leaving it out.
  const facts: Record<string, string> = partOfDay ? { 'time of day': partOfDay } : {};
  if (userName) facts['their name'] = userName;
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
export function proactiveReasonOpenerEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.PROACTIVE_REASON_OPENER === 'on';
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
export function proactiveFallback(userName: string | undefined): string {
  return `Hey${userName ? ` ${userName}` : ''}, it's Ferni, just calling to check in.`;
}

/** The director's hello for this caller and hour, with the scripted greeting as understudy. */
export async function directedGreeting(
  sessionId: string,
  personaId: string,
  userData: { callerTimezone?: string; userName?: string } | undefined
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
  const { directedText } = await import('../../speech/direction/index.js');
  const partOfDay = hour === null ? '' : partOfDayFor(hour);
  const facts = greetingFacts(partOfDay, userData?.userName, history);
  // A call Ferni placed to its own user (callType proactive_outreach).
  const proactive = proactiveReasonOpenerEnabled()
    ? (
        await import('../../intelligence/context-builders/external/proactive-session-context.js')
      ).getProactiveSessionContext(sessionId)
    : undefined;
  const directed = await directedText(
    sessionId,
    proactive
      ? {
          moment: 'proactive_greeting',
          direction: PROACTIVE_GREETING_DIRECTION,
          facts: { ...facts, ...proactiveReasonFacts(proactive) },
          fallback: proactiveFallback(userData?.userName),
          urgency: 'now',
          maxChars: 180,
        }
      : {
          moment: 'greeting',
          direction: GREETING_DIRECTION,
          facts,
          fallback: generateWarmGreeting(personaId, ctx),
          urgency: 'now',
          maxChars: 140,
        }
  );
  return calmGreeting(directed.text);
}
