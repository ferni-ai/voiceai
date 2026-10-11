/**
 * The days a user has talked with Ferni, read from where calls actually save
 * their summaries, for the streaks that decide team unlocks.
 *
 * calculateStreaks (team-unlocks.ts) read profile.conversationSummaries, which
 * nothing on the live path writes: calls save to bogle_users/{uid}/summaries
 * (session-manager endSession → saveSummary). So every streak was 0 and no
 * free user could pass "getting-started", whatever they'd done. Dev
 * 2026-10-11: the owner (647 conversations over 281 days, 318 summaries, a
 * 12-day longest streak) was computed "getting-started" and got only Maya.
 *
 * getProfile reads the days alongside the profile and puts them on it as
 * conversationDays; saveProfile leaves them out, so they never go stale in
 * the profile document. STREAK_FROM_SUMMARIES=off turns the read off.
 *
 * @module memory/storage/conversation-days
 */
import type { Firestore } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';

/** Summaries read for streaks: more than a year of daily calls. */
export const CONVERSATION_DAYS_LIMIT = 400;

export function streakFromSummariesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.STREAK_FROM_SUMMARIES !== 'off';
}

/** YYYY-MM-DD (UTC) for a summary timestamp in any stored shape; null when unreadable. */
export function dayOf(value: unknown): string | null {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object') {
    const ts = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof ts.toDate === 'function') date = ts.toDate();
    else if (typeof ts._seconds === 'number') date = new Date(ts._seconds * 1000);
    else if (typeof ts.seconds === 'number') date = new Date(ts.seconds * 1000);
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/** Distinct days, oldest first. */
export function distinctDays(timestamps: unknown[]): string[] {
  const days = new Set<string>();
  for (const t of timestamps) {
    const day = dayOf(t);
    if (day) days.add(day);
  }
  return [...days].sort();
}

/** The days of the user's most recent call summaries (timestamps only), oldest first. */
export async function readConversationDays(
  db: Pick<Firestore, 'collection'>,
  usersCollection: string,
  userId: string,
  limit = CONVERSATION_DAYS_LIMIT
): Promise<string[]> {
  const snapshot = await db
    .collection(usersCollection)
    .doc(userId)
    .collection('summaries')
    .orderBy('timestamp', 'desc')
    .select('timestamp')
    .limit(limit)
    .get();
  return distinctDays(snapshot.docs.map((d) => d.get('timestamp')));
}

/** The days for getProfile: undefined when switched off or unreadable, so a load never fails on them. */
export async function conversationDaysFor(
  db: unknown,
  usersCollection: string,
  userId: string
): Promise<string[] | undefined> {
  if (!streakFromSummariesEnabled()) return undefined;
  try {
    // The client is firebase-admin's; the store's local Firestore interface just doesn't declare select()
    return await readConversationDays(db as Pick<Firestore, 'collection'>, usersCollection, userId);
  } catch (error) {
    getLogger().warn({ userId, error: String(error) }, 'Conversation days unreadable');
    return undefined;
  }
}
