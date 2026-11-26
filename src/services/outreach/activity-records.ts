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
/** At most this many documents per store. */
const PER_STORE = 200;

/**
 * Which documents of a store to read, without a composite index: the newest by `orderBy` (only
 * those at or after `since` on that same field, when given), or all whose `where` field equals the
 * value. An equality read has no time order (Firestore returns it by document id), so it is only
 * for a store whose matching documents stay well under the limit; hitting the limit is logged.
 */
export interface StoreQuery {
  readonly orderBy?: string;
  readonly since?: string;
  readonly where?: readonly [field: string, value: string];
}

/** The reads, as functions, so tests hand in fakes. */
export interface ActivityStores {
  calls: CallRecords;
  /** Documents of bogle_users/{uid}/{store} matching `query`, at most `limit`. */
  recent: (userId: string, store: string, query: StoreQuery, limit: number) => Promise<Doc[]>;
}

async function firestoreRecent(
  userId: string,
  store: string,
  query: StoreQuery,
  limit: number
): Promise<Doc[]> {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return [];
  const col = db.collection('bogle_users').doc(userId).collection(store);
  const filtered = query.where ? col.where(query.where[0], '==', query.where[1]) : col;
  const from =
    query.orderBy && query.since ? filtered.where(query.orderBy, '>=', query.since) : filtered;
  const ordered = query.orderBy ? from.orderBy(query.orderBy, 'desc') : from;
  const snap = await ordered.limit(limit).get();
  if (snap.size >= limit)
    log.warn({ userId, store, limit }, 'RECALL_ACTIVITY: store read hit the limit');
  return snap.docs.map((d) => d.data());
}

const firestoreActivityStores: ActivityStores = {
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
      async () => stores.recent(userId, 'reminders', { orderBy: 'scheduledFor' }, PER_STORE),
      []
    ),
    safely(
      'outreach_history',
      async () =>
        stores.recent(
          userId,
          'outreach_history',
          // every delivery in the window, newest first; activity-recall keeps the emails
          { orderBy: 'deliveredAt', since: new Date(now - WINDOW_MS).toISOString() },
          PER_STORE
        ),
      []
    ),
    safely(
      'follow_through',
      async () => stores.recent(userId, 'follow_through', { where: ['owner', 'ferni'] }, PER_STORE),
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
