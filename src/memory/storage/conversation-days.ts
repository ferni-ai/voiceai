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
 * the profile document. STREAK_FROM_SUMMARIES=on turns the read on; it is off
 * by default because it adds up to CONVERSATION_DAYS_LIMIT reads to every load.
 *
 * @module memory/storage/conversation-days
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { distinctDays } from '../../utils/conversation-day.js';
import { getLogger } from '../../utils/safe-logger.js';

// Pure helpers live in utils (L2) so streak code outside storage can use them too
export { dayOf, distinctDays } from '../../utils/conversation-day.js';

/** Summaries read for streaks: more than a year of daily calls. */
export const CONVERSATION_DAYS_LIMIT = 400;

export function streakFromSummariesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.STREAK_FROM_SUMMARIES === 'on';
}

/** The days of the user's most recent call summaries (timestamps only), oldest first. */
export async function readConversationDays(
  db: Pick<Firestore, 'collection'>,
  usersCollection: string,
  userId: string,
  limit = CONVERSATION_DAYS_LIMIT
): Promise<string[]> {
  return daysUnder(db.collection(usersCollection).doc(userId), limit);
}

async function daysUnder(
  userDoc: Pick<DocumentReference, 'collection'>,
  limit = CONVERSATION_DAYS_LIMIT
): Promise<string[]> {
  const snapshot = await userDoc
    .collection('summaries')
    .orderBy('timestamp', 'desc')
    .select('timestamp')
    .limit(limit)
    .get();
  return distinctDays(snapshot.docs.map((d) => d.get('timestamp')));
}

/**
 * The days for getProfile, read under the user's document alongside the profile read
 * (no added wait). Undefined when switched off or unreadable, so a load never fails on them.
 * saveProfile leaves them out: they are never stored on the profile.
 */
export async function conversationDaysFor(userDoc: unknown): Promise<string[] | undefined> {
  if (!streakFromSummariesEnabled()) return undefined;
  try {
    // firebase-admin's DocumentReference; the store's local Firestore interface lacks select()
    return await daysUnder(userDoc as Pick<DocumentReference, 'collection'>);
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'Conversation days unreadable');
    return undefined;
  }
}
