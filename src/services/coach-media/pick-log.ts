/**
 * Every checked pick Ferni offered, and what became of it: sent or not, the
 * follow-up asked or not, tried or not, helped or not. One small document per
 * pick under the user (bogle_users/{uid}/coach_media_picks/{id}).
 *
 * It is what taste.ts learns from (what kind, which creators, what length
 * worked for this person) and what the bar-raiser scorecard reads (tried
 * rate, helpful rate, follow-ups landed, time to the first pick).
 *
 * @module services/coach-media/pick-log
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

export type Helped = 'yes' | 'somewhat' | 'no';

export interface PickRecord {
  id: string;
  offeredAt: string;
  topic: string;
  format: string;
  title: string;
  by: string;
  lengthSeconds?: number;
  /** YouTube channelId; taste trusts this, never the display name in `by`. */
  creatorId?: string;
  /** Tool start until the pick was returned. */
  latencyMs: number;
  firstInCall: boolean;
  sentVia: 'text' | 'app' | null;
  sentAt: string | null;
  followUpDueAt: string | null;
  /** The follow-up's answer as the generic reader saw it; 'unanswered' once asked and the window closed. */
  outcome: 'done' | 'not_done' | 'deflected' | 'unanswered' | null;
  helped: Helped | null;
  /** When Ferni asked the follow-up; the scorecard checks it against followUpDueAt. */
  followUpAskedAt?: string;
  /** When the follow-up was settled; the scorecard dates tried/helped by it. */
  answeredAt?: string;
}

/** Picks read for taste. */
export const TASTE_WINDOW = 50;

function picks(userId: string) {
  return getFirestoreDb()?.collection('bogle_users').doc(userId).collection('coach_media_picks');
}

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function write(userId: string, id: string, fields: Partial<PickRecord>): Promise<void> {
  try {
    await picks(userId)?.doc(id).set(fields, { merge: true });
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'coach-media: pick log write failed');
  }
}

/** Records an offered pick; returns its id. */
export async function logOffered(
  userId: string,
  pick: Omit<
    PickRecord,
    'id' | 'offeredAt' | 'sentVia' | 'sentAt' | 'followUpDueAt' | 'outcome' | 'helped'
  >
): Promise<string> {
  const id = newId();
  await write(userId, id, {
    ...pick,
    id,
    offeredAt: new Date().toISOString(),
    sentVia: null,
    sentAt: null,
    followUpDueAt: null,
    outcome: null,
    helped: null,
  });
  return id;
}

export async function markSent(
  userId: string,
  id: string,
  via: 'text' | 'app',
  followUpDueAt: Date
): Promise<void> {
  await write(userId, id, {
    sentVia: via,
    sentAt: new Date().toISOString(),
    followUpDueAt: followUpDueAt.toISOString(),
  });
}

export async function markAsked(userId: string, id: string, at: string): Promise<void> {
  await write(userId, id, { followUpAskedAt: at });
}

/**
 * Records how a pick went. False for a pick not in the log, or one that
 * already says whether it helped: the follow-up reader and the feedback action
 * can both hear the same answer, and only the first counts.
 */
export async function claimAnswer(
  userId: string,
  id: string,
  answer: { outcome: PickRecord['outcome']; helped: Helped | null }
): Promise<boolean> {
  const db = getFirestoreDb();
  const ref = picks(userId)?.doc(id);
  if (!db || !ref) return false;
  try {
    return await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const known = doc.data() as PickRecord | undefined;
      if (!known?.offeredAt || known.helped) return false;
      tx.set(ref, { ...answer, answeredAt: new Date().toISOString() }, { merge: true });
      return true;
    });
  } catch (error) {
    getLogger().warn({ error: String(error) }, 'coach-media: pick answer not recorded');
    return false;
  }
}

/** The user's most recent picks, newest first. */
export async function recentPicks(userId: string, limit = TASTE_WINDOW): Promise<PickRecord[]> {
  try {
    const snap = await picks(userId)?.orderBy('offeredAt', 'desc').limit(limit).get();
    return (snap?.docs ?? []).map((d) => d.data() as PickRecord);
  } catch (error) {
    getLogger().debug({ error: String(error) }, 'coach-media: pick log read failed');
    return [];
  }
}
