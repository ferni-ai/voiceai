/**
 * The waitlist write behind the public feature vote (POST /api/waitlist/vote).
 *
 * The vote is unauthenticated, so it must not change who someone is on the list: create-only
 * for a new address; an existing entry gets only the feature added to interestedFeatures.
 * (Before #2264 it merged source, timestamp and the rest over the entry, which corrupted the
 * admin list's attribution and order and relabelled open-access approvals.)
 *
 * @module api/waitlist-feature-interest
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const isAlreadyExists = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
};

export async function saveFeatureInterest<T extends { email: string }>(
  db: Firestore,
  signup: T,
  featureId: string
): Promise<void> {
  const docId = Buffer.from(signup.email).toString('base64').replace(/[/+=]/g, '_');
  const ref = db.collection('waitlist').doc(docId);
  const interestedFeatures = FieldValue.arrayUnion(featureId);
  const doc = cleanForFirestore({ ...signup, interestedFeatures, updatedAt: new Date() });
  const created = await ref.create(doc).then(
    () => true,
    (err: unknown) => {
      if (isAlreadyExists(err)) return false;
      throw err;
    }
  );
  if (!created) await ref.update({ interestedFeatures });
}
