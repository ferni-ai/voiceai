/**
 * Shared moments (bogle_users/{uid}/shared_moments): callbacks deep-relationship.ts reads back, each
 * with what the caller said. MINOR_CARE: a held caller gets none; what a held call stored before its
 * hold began is purged (scrubHeldSince) and dropped on every read (held-window-check.ts).
 *
 * @module intelligence/context-builders/relationship/shared-moments
 */
import { getAdminFirestore } from '../../../utils/firebase-admin-app.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { withoutHeldAt, madeWhileHeld } from '../../../utils/held-window-check.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  clampMomentWords,
  momentExpireAt,
  unexpiredMoments,
} from '../../../utils/shared-moment-retention.js';

const log = createLogger({ module: 'SharedMoments' });

/** bogle_users/{userId}/{collection}: throws when Firestore isn't set up (each caller catches). */
const userDocs = (userId: string, collection = 'shared_moments') =>
  getAdminFirestore().collection('bogle_users').doc(userId).collection(collection);

/** Caches of moments already read (deep-relationship's history): the purge drops a user's. */
const readCaches: Array<(userId: string) => void> = [];
export function onForgetReadMoments(forget: (userId: string) => void): void {
  readCaches.push(forget);
}
export function forgetReadMoments(userId: string): void {
  for (const forget of readCaches) forget(userId);
}

/** These stored moments minus the expired ones and the ones made during a purged held call. */
export const withoutHeldMoments = <T extends Record<string, unknown>>(
  userId: string,
  moments: T[]
) => withoutHeldAt(userId, unexpiredMoments(moments), (m) => m.createdAt);

/**
 * Record a shared moment (joke, phrase, callback moment). A held caller gets none. It keeps 80
 * characters of what they said and expires in a year (shared-moment-retention.ts).
 */
export async function recordSharedMoment(
  userId: string,
  moment: {
    type: 'phrase' | 'running_gag' | 'callback_moment';
    content: string;
    whatTheySaid: string;
    triggers?: string[];
    significance?: 'life_changing' | 'meaningful' | 'warm' | 'fun';
    sessionId?: string; // the call's: held before the hold reaches the user (writeHeld)
  }
): Promise<void> {
  if (writeHeld(userId, moment.sessionId)) return;
  try {
    const momentId = `moment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ref = userDocs(userId).doc(momentId);
    await ref.set({
      ...cleanForFirestore({
        id: momentId,
        type: moment.type,
        content: clampMomentWords(moment.content),
        origin: { whatTheySaid: clampMomentWords(moment.whatTheySaid), timestamp: new Date() },
        triggers: moment.triggers || [],
        significance: moment.significance || 'warm',
        callbackCount: 0,
        callbackReception: 'unknown',
        createdAt: new Date(),
      }),
      expireAt: momentExpireAt(), // a Date, so Firestore keeps a Timestamp the TTL policy reads
    });
    log.info({ userId, momentId, type: moment.type }, '💫 Shared moment recorded');
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not record shared moment');
  }
}

/**
 * The purge: delete the user's docs in bogle_users/{uid}/{collection} written (the first present of
 * `fields`) in a held window, from `since`. Resolves the count, or -1 on a failure (logged; reads
 * still drop them, and the next session start retries). Never rejects.
 */
export async function scrubHeldSince(
  userId: string,
  since: number,
  collection = 'shared_moments',
  fields = ['createdAt']
): Promise<number> {
  try {
    const docs = userDocs(userId, collection);
    // An ISO string (cleanForFirestore), epoch ms (inside-joke-memory) or a Timestamp from another
    // writer: Firestore ranges never cross types, so one query each
    const from = [new Date(since).toISOString(), since, new Date(since)];
    const reads = fields.flatMap((f) => from.map((at) => docs.where(f, '>=', at).get()));
    const found = new Map((await Promise.all(reads)).flatMap((s) => s.docs.map((d) => [d.id, d])));
    const writtenAt = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
      fields.map((f) => doc.get(f)).find((at) => at !== undefined);
    const held = [...found.values()].filter((doc) => madeWhileHeld(userId, writtenAt(doc)));
    await Promise.all(held.map((doc) => doc.ref.delete()));
    log.info({ userId, collection, removed: held.length }, 'MINOR_CARE held docs removed');
    return held.length;
  } catch (error) {
    log.warn({ userId, collection, error: String(error) }, 'MINOR_CARE held-doc scrub failed');
    return -1;
  }
}
