/**
 * The owner's records over the last 30 days for activity-recall.ts: calls (deferred_calls and
 * on_behalf_calls, through call-status.ts's reader), reminders, emailed messages
 * (outreach_history, channel email) and Ferni's promises (follow_through, owner 'ferni'), all
 * under bogle_users/{uid}. Each store is read on its own: one that fails is left out and
 * logged, never guessed. Logs: counts only.
 *
 * @module services/outreach/activity-records
 */

import { createLogger } from '../../utils/safe-logger.js';
import { firestoreCallRecords, type CallRecords } from './call-status.js';
import { callHistory } from './call-recall.js';
import { validZone, type ActivityRecords } from './activity-recall.js';

const log = createLogger({ module: 'ActivityRecords' });

type Doc = Record<string, unknown>;
const WINDOW_MS = 30 * 86_400_000;
/** At most this many documents per store: the list shows 14 lines. */
const PER_STORE = 60;

/** The reads, as functions, so tests hand in fakes. */
export interface ActivityStores {
  calls: CallRecords;
  /** Newest documents of bogle_users/{uid}/{store}, ordered by `field`, at most `limit`. */
  recent: (userId: string, store: string, field: string, limit: number) => Promise<Doc[]>;
}

async function firestoreRecent(
  userId: string,
  store: string,
  field: string,
  limit: number
): Promise<Doc[]> {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection(store)
    .orderBy(field, 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data());
}

export const firestoreActivityStores: ActivityStores = {
  calls: firestoreCallRecords,
  recent: firestoreRecent,
};

const zoneOf = (docs: readonly Doc[]): string | undefined => {
  for (const d of docs) {
    const r = (d.request ?? {}) as Doc;
    for (const z of [d.timezone, d.zone, r.userTimezone])
      if (typeof z === 'string' && validZone(z) !== undefined) return z;
  }
  return undefined;
};

/** One read of every store, 30 days back; a store that fails is empty and logged. Never throws. */
export async function loadActivity(
  userId: string,
  now = Date.now(),
  stores: ActivityStores = firestoreActivityStores
): Promise<ActivityRecords> {
  const failed: string[] = [];
  const safely = async <T>(name: string, read: () => Promise<T>, none: T): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      failed.push(name);
      log.warn({ userId, store: name, error: String(error) }, 'RECALL_ACTIVITY: store not read');
      return none;
    }
  };
  const [calls, reminders, emails, promises] = await Promise.all([
    safely('calls', async () => stores.calls.load(userId, new Date(now - WINDOW_MS)), {
      deferred: [] as Doc[],
      results: [] as Doc[],
    }),
    safely(
      'reminders',
      async () => stores.recent(userId, 'reminders', 'scheduledFor', PER_STORE),
      []
    ),
    safely(
      'outreach_history',
      async () => stores.recent(userId, 'outreach_history', 'deliveredAt', PER_STORE),
      []
    ),
    safely(
      'follow_through',
      async () => stores.recent(userId, 'follow_through', 'createdAt', PER_STORE),
      []
    ),
  ]);
  const history = callHistory(calls, now);
  const zone = zoneOf([...calls.deferred, ...calls.results, ...reminders, ...promises]);
  log.info(
    {
      userId,
      calls: history.length,
      reminders: reminders.length,
      emails: emails.length,
      promises: promises.length,
      failed: failed.length,
    },
    'RECALL_ACTIVITY'
  );
  return {
    calls: history,
    reminders,
    emails,
    promises,
    ...(zone ? { zone } : {}),
    ...(failed.length ? { unread: failed } : {}),
  };
}
