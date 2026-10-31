/**
 * Inside jokes in call summaries expire a year after the call (Seth, 2026-10-26:
 * utils/shared-moment-retention.ts). A summary is written once and never saved again, and a
 * TTL can only delete a whole doc, so after each call this takes the expired bits out of the
 * person's summaries: the ones whose earliest bit has expired (insideJokesExpireAt, stamped by
 * the summarizer through operations/inside-jokes.ts). Recall skips an expired bit until then.
 * Summaries from before the policy have no insideJokesExpireAt and are left as they are.
 *
 * @module memory/storage/summary-joke-retention
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { summaryInsideJokes } from '../operations/inside-jokes.js';
import { unexpiredMoments } from '../../utils/shared-moment-retention.js';
import type { InsideJokeRef } from '../../types/profile/inside-joke.js';

/** Summaries swept per call; any left over go on the next call */
const MAX_PER_RUN = 50;

/** Takes expired bits out of this person's summaries; returns how many summaries it changed */
export async function dropExpiredSummaryJokes(
  userId: string,
  db: Firestore | null = getFirestoreDb(),
  now: number = Date.now()
): Promise<number> {
  if (!db) return 0;
  const due = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('summaries')
    .where('insideJokesExpireAt', '<=', new Date(now).toISOString())
    .limit(MAX_PER_RUN)
    .get();
  if (due.empty) return 0;
  const batch = db.batch();
  for (const doc of due.docs) {
    const jokes = doc.get('insideJokes') as unknown;
    const kept = unexpiredMoments(Array.isArray(jokes) ? (jokes as InsideJokeRef[]) : [], now);
    const fields = summaryInsideJokes(kept);
    batch.update(doc.ref, {
      insideJokes: fields.insideJokes ?? FieldValue.delete(),
      insideJokesExpireAt: fields.insideJokesExpireAt ?? FieldValue.delete(),
    });
  }
  await batch.commit();
  return due.size;
}
