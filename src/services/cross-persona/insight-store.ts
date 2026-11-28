/**
 * The stored team insights for one user, shared by every process that reads or
 * writes them: the voice agent and each web server instance.
 *
 * Document: bogle_users/{uid}/team_insights/data, shaped
 * `{ insights: CrossPersonaInsight[], lastScannedAt, _updatedAt, _userId }`, the
 * shape the existing documents already have, so nothing needs migrating.
 *
 * Before (2026-10-25 menu audit): each process loaded a user's insights once for
 * its whole life and saved its own cached list over the stored one. The web
 * server never saw what the agent noticed after its first read, and a second
 * writer (another call, or the web app) replaced what the first had saved.
 * Now a read goes to the document, and every write is one change keyed by
 * insight id, applied in a transaction to the list as it is stored right then.
 * The caller hands in the Firestore client (getFirestoreDb()), so this context
 * doesn't import the platform layer.
 *
 * @module services/cross-persona/insight-store
 */

import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn } from '../../config/env-flag.js';
import { retry, type RetryOptions } from '../../utils/async.js';
import { isErasedOrErasing } from '../../utils/erasing-mark.js';
import { userHeld } from '../../utils/minor-care.js';
import { isSharedPlaceholderId } from '../../utils/synthetic-user.js';
import { createLogger } from '../../utils/safe-logger.js';
import { hideFromUser, markToasted } from './insight-visibility.js';
import type { CrossPersonaInsight } from './cross-persona-insights.js';

const log = createLogger({ module: 'cross-persona-insight-store' });

/** One change to a user's insight list. Pure: a transaction may run it more than once. */
export type InsightChange = (stored: CrossPersonaInsight[]) => CrossPersonaInsight[];

const recordFor = (db: Firestore, userId: string): DocumentReference =>
  db.collection('bogle_users').doc(userId);
const docFor = (db: Firestore, userId: string): DocumentReference =>
  recordFor(db, userId).collection('team_insights').doc('data');

function listOf(data: unknown): CrossPersonaInsight[] {
  const insights = (data as { insights?: unknown } | null | undefined)?.insights;
  return Array.isArray(insights) ? (insights as CrossPersonaInsight[]) : [];
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The same note from the same persona to the same audience: one in the last hour, or the
 * same words while the first is still live. Only the hour used to count, so a scan on each
 * GET /api/team-insights added the same note again every hour of its 24 (six copies in
 * the 2026-11-16 audit), and each copy was toasted again.
 */
export function isRecentDuplicate(
  existing: CrossPersonaInsight,
  next: Pick<CrossPersonaInsight, 'source' | 'target' | 'category' | 'content'>,
  now = Date.now()
): boolean {
  if (existing.source !== next.source || existing.target !== next.target) return false;
  if (existing.category !== next.category) return false;
  return (
    existing.createdAt > now - HOUR_MS ||
    (existing.content === next.content && existing.expiresAt > now)
  );
}

export const insightChanges = {
  /** Adds the insight unless it (or a recent duplicate) is there; drops expired ones. */
  add:
    (insight: CrossPersonaInsight): InsightChange =>
    (stored) => {
      const live = stored.filter((i) => i.expiresAt > Date.now());
      const there = live.some((i) => i.id === insight.id || isRecentDuplicate(i, insight));
      return there ? live : [...live, insight];
    },
  remove:
    (insightId: string): InsightChange =>
    (stored) =>
      stored.filter((i) => i.id !== insightId),
  hide:
    (insightId: string, now: number): InsightChange =>
    (stored) => {
      hideFromUser(stored, insightId, now);
      return stored;
    },
  toast:
    (insightId: string, now: number): InsightChange =>
    (stored) => {
      markToasted(stored, insightId, now);
      return stored;
    },
  dropExpired:
    (now: number): InsightChange =>
    (stored) =>
      stored.filter((i) => i.expiresAt > now),
};

/**
 * The user's stored insights: [] when there is no document, null when there is
 * no Firestore or the id is a shared placeholder. A failed read throws.
 */
export async function readStoredInsights(
  db: Firestore | null,
  userId: string
): Promise<CrossPersonaInsight[] | null> {
  if (!db || isSharedPlaceholderId(userId)) return null;
  const snap = await docFor(db, userId).get();
  return snap.exists ? listOf(snap.data()) : [];
}

const inFlight = new Set<Promise<unknown>>();

/** Each user's latest write in this process, settled: the next one waits for it. */
const lastWrite = new Map<string, Promise<void>>();

/**
 * Starts `write` once this user's previous write in this process has landed or failed.
 * A scan fires up to 17 changes at once, and each concurrent transaction on the same
 * document aborted the others (FIRESTORE_ERROR ABORTED). Every change is applied to
 * the list as stored, so running them in turn keeps all of them; the transaction still
 * guards against another process.
 */
async function afterPreviousWrite<T>(userId: string, write: () => Promise<T>): Promise<T> {
  const run = (lastWrite.get(userId) ?? Promise.resolve()).then(write);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  lastWrite.set(userId, settled);
  void settled.then(() => {
    if (lastWrite.get(userId) === settled) lastWrite.delete(userId);
  });
  return run;
}

/** gRPC codes worth another try: DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, ABORTED, INTERNAL, UNAVAILABLE */
const TRANSIENT = new Set([4, 8, 10, 13, 14]);
const grpcCode = (error: unknown): number | undefined => {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'number' ? code : undefined;
};

/**
 * A background write (add, consume, expiry) that fails on a transient error is tried again,
 * a bounded number of times: the SDK's own transaction attempts (5) run inside each of these
 * 3 tries. acknowledge (the app's route) doesn't retry here: its caller is told.
 */
export const BACKGROUND_RETRY: RetryOptions = {
  maxRetries: 2,
  initialDelay: 250,
  maxDelay: 1_000,
  shouldRetry: (error) => TRANSIENT.has(grpcCode(error) ?? -1),
};

/**
 * Applies one change to the stored list in a transaction, so a concurrent writer's
 * insights are kept. Never writes for a caller MINOR_CARE holds, a shared id, or an
 * erased account: when the user record (bogle_users/{uid}) is gone or marked `erasing`
 * (utils/erasing-mark.ts), the write is dropped, whether or not this document is still
 * there. Account erasure marks the record before it deletes anything and deletes it last
 * (erase-user-record.ts markErasing). The record is read in this write's transaction, so
 * a process still running during or after the erasure (a live call, a scan) can't recreate
 * the document: a write that read the record before the mark either lands first (and is
 * erased with the rest) or conflicts with the mark, and its retry finds it. Other writers
 * gated on the record (ponder-job.ts reads only whether it exists) don't see the mark yet.
 * TEAM_INSIGHT_WRITE_QUEUE on: a user's writes in this process run one at a time.
 * `background`: retried with BACKGROUND_RETRY. Rejects when the write fails; the failure
 * is logged once, by its code, never with the insight's words.
 */
export async function changeStoredInsights(
  db: Firestore | null,
  userId: string,
  change: InsightChange,
  options: { background?: boolean } = {}
): Promise<void> {
  if (!db || isSharedPlaceholderId(userId) || userHeld(userId)) return;
  const record = recordFor(db, userId);
  const ref = docFor(db, userId);
  let tries = 0;

  const once = async (): Promise<boolean> => {
    tries += 1;
    return db.runTransaction(async (tx) => {
      const [user, snap] = await Promise.all([tx.get(record), tx.get(ref)]);
      if (isErasedOrErasing(user)) return false; // erased, or being erased
      const insights = change(listOf(snap.data()));
      const doc = { insights, lastScannedAt: Date.now(), _updatedAt: new Date().toISOString() };
      // Plain JSON, as the app receives it: no undefined anywhere, Dates as ISO strings
      const plain = JSON.parse(JSON.stringify({ ...doc, _userId: userId })) as object;
      tx.set(ref, plain, { merge: true });
      return true;
    });
  };
  const attempt = async (): Promise<boolean> =>
    options.background ? retry(once, BACKGROUND_RETRY) : once();
  const queued = flagOn('TEAM_INSIGHT_WRITE_QUEUE');
  const write = (queued ? afterPreviousWrite(userId, attempt) : attempt()).then((written) => {
    if (!written) log.info({ userId }, 'Team insight write dropped: no user record');
  });
  const settled = write.catch((error: unknown) => {
    log.warn({ code: grpcCode(error) ?? 'none', tries, userId }, 'Team insight write failed');
  });
  inFlight.add(settled);
  void settled.finally(() => inFlight.delete(settled));
  await write;
}

/** Resolves once every write started in this process so far has landed or failed. */
export async function insightWritesSettled(): Promise<void> {
  await Promise.all([...inFlight]);
}
