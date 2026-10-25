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
import { userHeld } from '../../utils/minor-care.js';
import { isSharedPlaceholderId } from '../../utils/synthetic-user.js';
import { createLogger } from '../../utils/safe-logger.js';
import { hideFromUser } from './insight-visibility.js';
import type { CrossPersonaInsight } from './cross-persona-insights.js';

const log = createLogger({ module: 'cross-persona-insight-store' });

/** One change to a user's insight list. Pure: a transaction may run it more than once. */
export type InsightChange = (stored: CrossPersonaInsight[]) => CrossPersonaInsight[];

const docFor = (db: Firestore, userId: string): DocumentReference =>
  db.collection('bogle_users').doc(userId).collection('team_insights').doc('data');

function listOf(data: unknown): CrossPersonaInsight[] {
  const insights = (data as { insights?: unknown } | null | undefined)?.insights;
  return Array.isArray(insights) ? (insights as CrossPersonaInsight[]) : [];
}

const HOUR_MS = 60 * 60 * 1000;

/** The same note from the same persona to the same audience within the last hour. */
export function isRecentDuplicate(
  existing: CrossPersonaInsight,
  next: Pick<CrossPersonaInsight, 'source' | 'target' | 'category'>,
  now = Date.now()
): boolean {
  return (
    existing.source === next.source &&
    existing.target === next.target &&
    existing.category === next.category &&
    existing.createdAt > now - HOUR_MS
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

/**
 * Applies one change to the stored list in a transaction, so a concurrent writer's
 * insights are kept. Never writes for a caller MINOR_CARE holds, or a shared id.
 * Rejects when the write fails (already logged).
 */
export async function changeStoredInsights(
  db: Firestore | null,
  userId: string,
  change: InsightChange
): Promise<void> {
  if (!db || isSharedPlaceholderId(userId) || userHeld(userId)) return;
  const ref = docFor(db, userId);

  const write = db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const insights = change(listOf(snap.data()));
    const doc = { insights, lastScannedAt: Date.now(), _updatedAt: new Date().toISOString() };
    // Plain JSON, as the app receives it: no undefined anywhere, Dates as ISO strings
    const plain = JSON.parse(JSON.stringify({ ...doc, _userId: userId })) as object;
    tx.set(ref, plain, { merge: true });
  });
  const settled = write.catch((error: unknown) => {
    log.warn({ error: String(error), userId }, 'Team insight write failed');
  });
  inFlight.add(settled);
  void settled.finally(() => inFlight.delete(settled));
  await write;
}

/** Resolves once every write started in this process so far has landed or failed. */
export async function insightWritesSettled(): Promise<void> {
  await Promise.all([...inFlight]);
}
