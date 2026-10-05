/**
 * Computes "how we're doing together" and "things I've noticed" when the Trust
 * dashboard asks, and keeps the result in the docs the dashboard reads
 * (trust_profiles/relationship_health and trust_profiles/insights_reports).
 *
 * Computed lazily on read, in the API server, from what the voice agent already
 * persisted: nothing is added to the voice path. A stored result is reused for
 * a few minutes for the same time zone; after that, or for another zone, it is
 * recomputed from the source records and stored again.
 *
 * A source that can't be read is an error (TogetherStoreUnavailable), never an
 * empty history.
 *
 * @module services/trust-systems/together-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import { LIFE_EVENTS_DOC, TIMELINE_DOC } from './dashboard-history.js';
import type { LifeEvent } from './life-events.js';
import type { SentimentTimeline } from './sentiment-timeline.js';
import { computeTogetherHealth, type TogetherHealth } from './together-health.js';
import { computeNoticedNote, type NoticedNote } from './together-noticed.js';
import { localClock, type PromiseRecord, type TogetherSignals } from './together-signals.js';
import { getTrustDb, readTrustDoc, writeTrustDoc } from './trust-doc.js';
import { isInvitation } from '../superhuman/semantic-intelligence/promise-kinds.js';

const log = createLogger({ module: 'TogetherStore' });

export const HEALTH_DOC = 'relationship_health';
export const NOTES_DOC = 'insights_reports';
export const TOGETHER_CACHE_MS = 5 * 60 * 1000;
const KIND = 'together/v1';
const MAX_PROMISES = 50;

export class TogetherStoreUnavailable extends Error {}

export interface TogetherNotes {
  /** Whether there's any shared history at all. */
  state: TogetherHealth['state'];
  notes: NoticedNote[];
}

interface Stored<T> {
  kind: typeof KIND;
  computedAt: Date;
  tz: string;
  value: T;
}

async function source<T>(userId: string, doc: string): Promise<T | null> {
  const read = await readTrustDoc<T>(userId, doc);
  if (read.status === 'error') throw new TogetherStoreUnavailable(doc);
  return read.status === 'found' ? read.data : null;
}

type FirestoreDate = { toDate?: () => Date } | string | number | Date | undefined | null;
function asDate(v: FirestoreDate): Date | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v as string | number | Date);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Ferni's promises to this user (ferni_commitments), newest first. Invitations
 * ("let me know how it goes") aren't promises, so they never count either way.
 */
async function readPromises(userId: string): Promise<PromiseRecord[]> {
  try {
    const snap = await getTrustDb()
      .collection('bogle_users')
      .doc(userId)
      .collection('ferni_commitments')
      .orderBy('madeAt', 'desc')
      .limit(MAX_PROMISES)
      .get();
    return snap.docs.flatMap((doc) => {
      const d = doc.data() as Record<string, FirestoreDate | boolean | string>;
      const madeAt = asDate(d.madeAt as FirestoreDate);
      if (!madeAt || isInvitation(d.type)) return [];
      const fulfilled = d.fulfilled === true;
      const violated = d.violated === true;
      return [
        {
          id: typeof d.id === 'string' ? d.id : doc.id,
          text: typeof d.commitment === 'string' ? d.commitment : '',
          madeAt,
          fulfilled,
          violated,
          resolvedAt: violated
            ? asDate(d.violatedAt as FirestoreDate)
            : fulfilled
              ? asDate(d.fulfilledAt as FirestoreDate)
              : undefined,
        },
      ];
    });
  } catch (error) {
    log.warn({ error, userId }, 'Failed to read ferni_commitments');
    throw new TogetherStoreUnavailable('ferni_commitments');
  }
}

/** Everything the together read is built from, for one user. */
export async function loadTogetherSignals(userId: string): Promise<TogetherSignals> {
  const [timeline, events, promises] = await Promise.all([
    source<SentimentTimeline>(userId, TIMELINE_DOC),
    source<LifeEvent[]>(userId, LIFE_EVENTS_DOC),
    readPromises(userId),
  ]);
  return { snapshots: timeline?.snapshots ?? [], lifeEvents: events ?? [], promises };
}

function fresh<T>(stored: Stored<T> | null, tz: string, now: Date): stored is Stored<T> {
  return (
    stored !== null &&
    stored.kind === KIND &&
    stored.tz === tz &&
    stored.computedAt instanceof Date &&
    now.getTime() - stored.computedAt.getTime() < TOGETHER_CACHE_MS
  );
}

/** Recompute both reads from the source records and store them. */
async function refresh(
  userId: string,
  tz: string | null,
  now: Date
): Promise<{ health: TogetherHealth; notes: TogetherNotes; tz: string }> {
  const clock = localClock(tz);
  const signals = await loadTogetherSignals(userId);
  const health = computeTogetherHealth(signals, now, clock);
  const notes: TogetherNotes = {
    state: health.state,
    notes:
      health.state === 'none'
        ? []
        : (['week', 'month'] as const).map((p) => computeNoticedNote(signals, p, now, clock)),
  };
  const stamp = { kind: KIND, computedAt: now, tz: clock.tz } as const;
  const [savedHealth, savedNotes] = await Promise.all([
    writeTrustDoc<Stored<TogetherHealth>>(userId, HEALTH_DOC, { ...stamp, value: health }),
    writeTrustDoc<Stored<TogetherNotes>>(userId, NOTES_DOC, { ...stamp, value: notes }),
  ]);
  if (!savedHealth || !savedNotes) {
    log.warn({ userId, savedHealth, savedNotes }, 'Together read computed but not stored');
  }
  return { health, notes, tz: clock.tz };
}

/** The tz key a stored result is filed under (invalid zones file as UTC). */
function tzKey(tz: string | null): string {
  return localClock(tz).tz;
}

export async function getTogetherHealth(
  userId: string,
  tz: string | null,
  now: Date = new Date()
): Promise<TogetherHealth> {
  const stored = await source<Stored<TogetherHealth>>(userId, HEALTH_DOC);
  // Only a full read is reused: an early user's next call should show at once.
  if (fresh(stored, tzKey(tz), now) && stored.value.state === 'ready') return stored.value;
  return (await refresh(userId, tz, now)).health;
}

export async function getTogetherNotes(
  userId: string,
  tz: string | null,
  now: Date = new Date()
): Promise<TogetherNotes> {
  const stored = await source<Stored<TogetherNotes>>(userId, NOTES_DOC);
  if (fresh(stored, tzKey(tz), now) && stored.value.state === 'ready') return stored.value;
  return (await refresh(userId, tz, now)).notes;
}
