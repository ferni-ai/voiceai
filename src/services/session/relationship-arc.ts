/**
 * Where a caller's stories stand, carried from call to call (RELATIONSHIP_ARC).
 *
 * Ferni's per-call picture of a caller was the last call's summary plus
 * whatever per-turn recall matched their words. In one relationship-arc eval
 * run (scripts/relationship-eval) call 20 asked "did you hear back from the
 * clinic?" of someone who got the job on call 18: news from two calls back
 * never reached the turn. It did not recur in a second run, and with this flag
 * on a pairwise judge preferred the flagged calls 15 to 10 (p ~ 0.4): not
 * shown to help yet. Kept off until a larger run says otherwise.
 *
 * With the flag on, the end of each call keeps its key points (newest first,
 * a few calls deep) in the profile's customData, and the "Who You're Talking
 * To" block shows them in place of the single last-call line, with a line on
 * how close they are by now. Off (the default), nothing is written or shown.
 *
 * @module services/session/relationship-arc
 */

import type { UserProfile } from '../../types/user-profile.js';

export function relationshipArcEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RELATIONSHIP_ARC === 'on';
}

export interface CallNote {
  at: string;
  note: string;
}

/** Calls kept: enough to cover a few weeks of regular calls, small enough for every prompt. */
export const CALL_NOTES_KEPT = 4;
const NOTE_CHARS = 220;

export function callNotes(profile: Pick<UserProfile, 'customData'>): CallNote[] {
  const raw = profile.customData?.recentCallNotes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (n): n is CallNote =>
      typeof n === 'object' && n !== null && typeof n.at === 'string' && typeof n.note === 'string'
  );
}

/**
 * Record a finished call's key points: always as lastConversationSummary (as
 * before), and with the flag on also at the front of the recent call notes.
 */
export function rememberCall(
  profile: UserProfile,
  keyPoints: string[],
  at: Date = new Date(),
  env: Record<string, string | undefined> = process.env
): void {
  profile.lastConversationSummary = keyPoints.slice(0, 2).join('; ');
  if (!relationshipArcEnabled(env)) return;
  const note = keyPoints.slice(0, 3).join('; ').slice(0, NOTE_CHARS);
  const kept = callNotes(profile);
  // Both end-of-call paths may record the same call: keep it once.
  if (!note || kept[0]?.note === note) return;
  const notes = [{ at: at.toISOString(), note }, ...kept].slice(0, CALL_NOTES_KEPT);
  profile.customData = { ...profile.customData, recentCallNotes: notes };
}

function ago(at: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(at)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

/** How close they are by now, said as what to do rather than a label. */
export function closenessLine(calls: number): string {
  if (calls < 3) {
    return "You're still new to each other: don't act more familiar than you are.";
  }
  if (calls < 10) {
    return "You're getting to know each other: bring back what they've told you when it fits, and tease a little.";
  }
  return (
    'You know each other well by now, so talk like it: their shorthand needs no explaining, ' +
    "never ask again what they've already told you, and if their story has moved on, the newest news is " +
    "where things stand (don't ask about something that has already happened). Running bits can come back when they fit."
  );
}

/**
 * The lines for "Who You're Talking To", or null when the flag is off or there
 * is no history (the caller then keeps the single last-call line).
 */
export function relationshipArcLines(
  profile: Pick<UserProfile, 'customData' | 'totalConversations'>,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env
): string[] | null {
  if (!relationshipArcEnabled(env) || !profile.totalConversations) return null;
  const notes = callNotes(profile);
  if (notes.length === 0) return null;
  return [
    closenessLine(profile.totalConversations),
    'Where their stories stand, newest first (the newest is the latest news):',
    ...notes.map((n) => `- ${ago(n.at, now)}: ${n.note}`),
  ];
}
