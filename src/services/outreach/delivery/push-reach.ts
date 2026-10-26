/**
 * Whether a push to this member has anywhere to go: a phone in push_devices, or
 * a browser or app subscription in bogle_users/{uid}/push_subscriptions/data.
 *
 * deliverOutreach asks before a push. With neither, it isn't tried: no failed
 * attempt in their history and no conversation context for a push that never
 * came. The job asks again next run (two reads, no writes), so a member who
 * installs the app is reached from then on.
 *
 * A read that fails answers true: the push is tried and recorded, as before.
 *
 * @module services/outreach/delivery/push-reach
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { PUSH_DEVICES_COLLECTION } from '../../push-devices.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';

const log = createLogger({ module: 'push-reach' });

export async function hasPushDevice(userId: string): Promise<boolean> {
  try {
    const db = getFirestoreDb();
    if (!db) return true;
    const [devices, subs] = await Promise.all([
      db.collection(PUSH_DEVICES_COLLECTION).where('userId', '==', userId).limit(1).get(),
      db.collection('bogle_users').doc(userId).collection('push_subscriptions').doc('data').get(),
    ]);
    const list: unknown = subs.exists ? subs.data()?.subscriptions : undefined;
    return !devices.empty || (Array.isArray(list) && list.length > 0);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Push devices unreadable: trying the push');
    return true;
  }
}
