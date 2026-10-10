/**
 * Which teammates Ferni has introduced to a person, so each introduction happens once.
 *
 * Ferni introduces a teammate the first time they're unlocked: by the relationship
 * rules or a subscription, never before. The introduction is kept here
 * (`bogle_users/{uid}/team/introductions`), so it isn't repeated in a later session.
 */
import type { Firestore } from '@google-cloud/firestore';
import { FieldValue } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TeamIntroductions' });

/** Read once per person per process; introductions only ever get added */
const cache = new Map<string, Set<string>>();

function introductionsDoc(db: Firestore, userId: string) {
  return db.collection('bogle_users').doc(userId).collection('team').doc('introductions');
}

/** The teammates already introduced to this person */
export async function getIntroducedTeammates(
  userId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<Set<string>> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const introduced = new Set<string>();
  if (db) {
    try {
      const snap = await introductionsDoc(db, userId).get();
      const members: unknown = snap.exists ? snap.data()?.members : undefined;
      if (Array.isArray(members))
        members.forEach((m) => typeof m === 'string' && introduced.add(m));
    } catch (error) {
      // Unread means "not introduced yet": the worst case is one repeated introduction
      log.warn({ error: String(error), userId }, 'Could not read team introductions');
      return introduced;
    }
  }
  cache.set(userId, introduced);
  return introduced;
}

/** Remember that this teammate has now been introduced */
export async function recordTeammateIntroduced(
  userId: string,
  memberId: string,
  db: Firestore | null = getFirestoreDb()
): Promise<void> {
  (await getIntroducedTeammates(userId, db)).add(memberId);
  if (!db) return;
  await introductionsDoc(db, userId).set(
    { members: FieldValue.arrayUnion(memberId), updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** For tests */
export function clearTeamIntroductionsCache(): void {
  cache.clear();
}
