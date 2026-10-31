/**
 * Writes one engagement document (engagement_profiles/{uid}, or a ritual streak, weather
 * entry, prediction, team huddle or conversation session under it), but never for an
 * account being erased or erased by this process. Every engagement writer that can create
 * a document goes through here, so the rule lives in one place.
 *
 * getProfile creates a default profile for a uid it can't find, and saveProfile writes
 * whatever the process cached, so anything that ran for a uid during or after account
 * deletion recreated the doc: a menu route on the ID token the app still held, a live
 * call's cached profile, a background ritual or nudge. The prod orphan audit (#2902)
 * found 13 such profiles, and the subcollection writers were not guarded at all (#2966).
 *
 * The write reads the user record (bogle_users/{uid}) in its own transaction and is
 * dropped (and logged) only on an explicit erasure (writeBlockedFor, utils/erasing-mark.ts):
 * the record's `erasing` mark, or this process having erased the account. Account erasure
 * marks the record before it deletes anything, so a write that read the record first
 * conflicts with the mark and its retry finds it. A missing record is a new caller, so
 * their first saves land (#2982, menu-engagement-first-save.emulator.test.ts). After the
 * record is gone, another process's late write is caught only by an erasure tombstone
 * (a follow-up).
 *
 * @module services/engagement/engagement-write-unless-erased
 */

import { writeBlockedFor } from '../../utils/erasing-mark.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'engagement-write-unless-erased' });

const USER_RECORDS = 'bogle_users';

interface Snapshot {
  exists: boolean;
  data: () => unknown;
}

/** The part of a Firestore transaction this write uses */
interface WriteTransaction<Ref> {
  get: (ref: Ref) => Promise<Snapshot>;
  set: (ref: Ref, data: unknown, options: { merge: boolean }) => unknown;
}

/** The part of a Firestore client this write uses */
export interface GuardedWriteDb<Ref> {
  collection: (path: string) => { doc: (id: string) => Ref };
  runTransaction: <T>(fn: (tx: WriteTransaction<Ref>) => Promise<T>) => Promise<T>;
}

export interface GuardedWrite<Ref> {
  userId: string;
  /** The document written: the profile itself, or one under it */
  target: Ref;
  data: unknown;
  merge: boolean;
  /** What is written, for the log line (never the data) */
  kind: string;
}

/** Writes the document; false when it was dropped because the account is erased or being erased */
export async function writeUnlessErased<Ref>(
  db: GuardedWriteDb<Ref>,
  write: GuardedWrite<Ref>
): Promise<boolean> {
  const { userId, target, data, merge } = write;
  const record = db.collection(USER_RECORDS).doc(userId);
  const written = await db.runTransaction(async (tx) => {
    if (writeBlockedFor(userId, await tx.get(record))) return false;
    tx.set(target, data, { merge });
    return true;
  });
  if (!written)
    log.info({ userId, kind: write.kind }, 'Engagement write dropped: the account is erased');
  return written;
}
