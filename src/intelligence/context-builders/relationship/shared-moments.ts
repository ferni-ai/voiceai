/**
 * Shared moments: bogle_users/{uid}/shared_moments, the callbacks deep-relationship.ts reads back
 * as inside jokes and shared phrases. Each keeps what the caller said (origin.whatTheySaid).
 *
 * MINOR_CARE: a held caller (writeHeld) gets none. What a held call stored before its hold began
 * (between its start and the age statement) is the held caller's too: the purge deletes those docs
 * (scrubHeldSharedMoments), and every read drops them, so a purge that failed never puts them in a
 * later call's prompt. minor-care-purge.ts sets the window check (held-window.ts), as it does for
 * music memories: this layer reaches the trust stores only through their index.
 *
 * @module intelligence/context-builders/relationship/shared-moments
 */
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SharedMoments' });

async function momentsOf(userId: string): Promise<FirebaseFirestore.CollectionReference> {
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  return getAdminFirestore().collection('bogle_users').doc(userId).collection('shared_moments');
}

/** Was this moment made during a purged held call? Answers false until the purge sets it. */
let madeWhileHeld: (userId: string, at: number) => boolean = () => false;
export function setSharedMomentsHeldWindow(check: (userId: string, at: number) => boolean): void {
  madeWhileHeld = check;
}

/** Caches of moments already read (deep-relationship's history): the purge drops a user's. */
const readCaches: Array<(userId: string) => void> = [];
export function onForgetReadMoments(forget: (userId: string) => void): void {
  readCaches.push(forget);
}
export function forgetReadMoments(userId: string): void {
  for (const forget of readCaches) forget(userId);
}

/** A stored createdAt in ms: ISO (written here), epoch ms (inside-joke-memory) or a Timestamp. */
function madeAt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: () => number } | null | undefined)?.toMillis;
  return typeof toMillis === 'function' ? toMillis.call(value) : NaN;
}

/** These stored moments minus the ones made during a purged held call. */
export function withoutHeldMoments<T extends Record<string, unknown>>(
  userId: string,
  moments: T[]
): T[] {
  return moments.filter((m) => !madeWhileHeld(userId, madeAt(m.createdAt)));
}

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
    await (await momentsOf(userId)).doc(momentId).set(
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
 * The purge: delete this user's moments stored since `since` (the held call's start) that a held
 * window covers; older ones stay. Resolves the count deleted, or -1 on a failure (logged; every
 * read still drops them). Never rejects.
 */
export async function scrubHeldSharedMoments(userId: string, since: number): Promise<number> {
  try {
    const moments = await momentsOf(userId);
    // createdAt is an ISO string here (cleanForFirestore), epoch ms from inside-joke-memory, and a
    // Timestamp from any other writer: Firestore ranges never cross types, so one query each
    const from = [new Date(since).toISOString(), since, new Date(since)];
    const reads = from.map((at) => moments.where('createdAt', '>=', at));
    const snaps = await Promise.all(reads.map((q) => q.get()));
    const held = snaps
      .flatMap((snap) => snap.docs)
      .filter((doc) => madeWhileHeld(userId, madeAt(doc.get('createdAt'))));
    await Promise.all(held.map((doc) => doc.ref.delete()));
    log.info({ userId, removed: held.length }, 'MINOR_CARE held shared moments removed');
    return held.length;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'MINOR_CARE shared-moment scrub failed');
    return -1;
  }
}
