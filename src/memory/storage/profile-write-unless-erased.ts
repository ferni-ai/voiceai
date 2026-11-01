/**
 * Writes bogle_users/{uid}, the user record saveProfile keeps, but never brings back an
 * erased person's record (#2966). The end-of-call save (session/session-manager.ts)
 * writes the profile loaded at call start, so an account erased during the call came
 * back, and with a record again the engagement guard took the person for live.
 *
 * The write reads the record in its own transaction and decides with the shared
 * predicate (isErasedOrErasing, utils/erasing-mark.ts):
 * - the record is marked `erasing` (an erasure is running): dropped;
 * - the record is gone and the profile has had a conversation (totalConversations > 0):
 *   dropped. Erasure leaves no record and no tombstone, and only a profile loaded before
 *   it can carry a conversation; the end-of-call save counts the call first;
 * - the record is gone and the profile has had none: created. That is a brand-new
 *   caller at call start (load-session-profile.ts, fast-session-init.ts) or a first
 *   app visit (getOrCreateProfile), which save a fresh createUserProfile.
 * A device profile moved to a new account (user-migration.ts) creates the account's
 * record first, then saves into it. A dropped write is logged.
 *
 * @module memory/storage/profile-write-unless-erased
 */

import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'profile-write-unless-erased' });

interface Snapshot {
  exists: boolean;
  data: () => unknown;
}

/** The part of a Firestore client this write uses */
export interface ProfileWriteDb<Ref> {
  runTransaction: <T>(
    fn: (tx: {
      get: (ref: Ref) => Promise<Snapshot>;
      set: (ref: Ref, data: unknown, options: { merge: boolean }) => unknown;
    }) => Promise<T>
  ) => Promise<T>;
}

/** Merges `data` into the record at `ref`; false when it was dropped for an erased account */
export async function writeProfileUnlessErased<Ref>(
  db: ProfileWriteDb<Ref>,
  ref: Ref,
  data: unknown,
  profile: { id: string; totalConversations?: number }
): Promise<boolean> {
  const hadConversation = (profile.totalConversations ?? 0) > 0;
  const written = await db.runTransaction(async (tx) => {
    const record = await tx.get(ref);
    // A missing record is erasure only for a profile that has already had a conversation
    if (isErasedOrErasing(record) && (record.exists || hadConversation)) return false;
    tx.set(ref, data, { merge: true });
    return true;
  });
  if (!written) log.info({ userId: profile.id }, 'Profile write dropped: the account is erased');
  return written;
}
