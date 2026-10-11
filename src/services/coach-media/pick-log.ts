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
  checked: boolean;
  /** Tool start until the pick was returned. */
  latencyMs: number;
  firstInCall: boolean;
  sentVia: 'text' | 'app' | null;
  sentAt: string | null;
  followUpDueAt: string | null;
  /** The follow-up's answer as the generic reader saw it; 'unanswered' once asked and the window closed. */
  outcome: 'done' | 'not_done' | 'deflected' | 'unanswered' | null;
  helped: Helped | null;
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

export async function markAnswered(
  userId: string,
  id: string,
  answer: { outcome: PickRecord['outcome']; helped: Helped | null }
): Promise<void> {
  await write(userId, id, answer);
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
