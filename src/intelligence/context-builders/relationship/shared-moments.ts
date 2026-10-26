/**
 * Shared moments: bogle_users/{uid}/shared_moments, the callbacks deep-relationship.ts reads back
 * as inside jokes and shared phrases. Each keeps what the caller said (origin.whatTheySaid).
 *
 * MINOR_CARE: a held caller (writeHeld) gets none. What a held call stored before its hold began
 * (between its start and the age statement) is the held caller's too: the purge deletes those docs
 * (scrubHeldSince), and every read drops them (held-window-check.ts), so a purge that failed never
 * puts them in a later call's prompt.
 *
 * @module intelligence/context-builders/relationship/shared-moments
 */
import { getAdminFirestore } from '../../../utils/firebase-admin-app.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { withoutHeldAt, madeWhileHeld } from '../../../utils/held-window-check.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';

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

/** These stored moments minus the ones made during a purged held call. */
export const withoutHeldMoments = <T extends Record<string, unknown>>(
  userId: string,
  moments: T[]
) => withoutHeldAt(userId, moments, (m) => m.createdAt);

/**
 * Record a shared moment (joke, phrase, callback moment) when a significant moment is detected.
 * A held caller gets none.
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
    await userDocs(userId)
      .doc(momentId)
      .set(
        cleanForFirestore({
          id: momentId,
          type: moment.type,
          content: moment.content,
          origin: { whatTheySaid: moment.whatTheySaid, timestamp: new Date() },
          triggers: moment.triggers || [],
          significance: moment.significance || 'warm',
          callbackCount: 0,
          callbackReception: 'unknown',
          createdAt: new Date(),
        })
      );
    log.info({ userId, momentId, type: moment.type }, '💫 Shared moment recorded');
  } catch (err) {
    log.debug({ error: String(err) }, 'Could not record shared moment');
  }
}

/**
 * The purge: delete this user's docs in bogle_users/{uid}/{collection} whose `field` (when they were
 * made) a held window covers, from `since` (the held call's start); older ones stay. Shared moments
 * and Memory Lane captures. Resolves the count deleted, or -1 on a failure (logged; every read still
 * drops them). Never rejects.
 */
export async function scrubHeldSince(
  userId: string,
  since: number,
  collection = 'shared_moments',
  field = 'createdAt'
): Promise<number> {
  try {
    const docs = userDocs(userId, collection);
    // An ISO string (cleanForFirestore), epoch ms (inside-joke-memory) or a Timestamp from another
    // writer: Firestore ranges never cross types, so one query each
    const from = [new Date(since).toISOString(), since, new Date(since)];
    const snaps = await Promise.all(from.map((at) => docs.where(field, '>=', at).get()));
    const held = snaps
      .flatMap((snap) => snap.docs)
      .filter((doc) => madeWhileHeld(userId, doc.get(field)));
    await Promise.all(held.map((doc) => doc.ref.delete()));
    log.info({ userId, collection, removed: held.length }, 'MINOR_CARE held docs removed');
    return held.length;
  } catch (error) {
    log.warn({ userId, collection, error: String(error) }, 'MINOR_CARE held-doc scrub failed');
    return -1;
  }
}
