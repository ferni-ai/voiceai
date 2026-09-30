/**
 * Remembers what the caller said they would do (memory/recall/commitments.ts).
 *
 * Reads committed user turns (not interim transcripts, so one sentence
 * saves once) and saves a plan with a when to bogle_users/{id}/commitments.
 * The recall store loads them as open threads for later calls, where they
 * are dated, asked about once, and closed like any other follow-up.
 *
 * @module agents/multi-agent/commitment-recorder
 */

import { commitmentFollowUp, commitmentIn } from '../../memory/recall/commitments.js';
import type { FollowUp } from '../../memory/recall/follow-ups.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'Commitments' });

const COLLECTION = 'commitments';
/** Plans older than this have usually happened or quietly lapsed. */
const MAX_AGE_DAYS = 30;
const MAX_LOADED = 20;
/** A few plans a call is plenty; more is a to-do list, not a conversation. */
const MAX_PER_CALL = 3;

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

/** Save the caller's plans from committed turns. Returns the unsubscribe. */
export function wireCommitmentRecorder(
  session: SessionEvents,
  save: (followUp: FollowUp) => void,
  now: () => number = Date.now
): () => void {
  const seen = new Set<string>();
  const onItem = (event: unknown) => {
    const item = (event as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role !== 'user' || !item.textContent || seen.size >= MAX_PER_CALL) return;
    const sentence = commitmentIn(item.textContent);
    if (!sentence) return;
    const followUp = commitmentFollowUp(sentence, now());
    if (seen.has(followUp.id)) return;
    seen.add(followUp.id);
    save(followUp);
    log.info('Commitment remembered');
  };
  session.on?.('conversation_item_added', onItem);
  return () => session.off?.('conversation_item_added', onItem);
}

/** The caller's recent plans, newest first, as open threads. Never throws. */
export async function loadCommitments(userId: string): Promise<FollowUp[]> {
  try {
    const db = getFirestoreDb();
    if (!db) return [];
    const since = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .orderBy('at', 'desc')
      .limit(MAX_LOADED)
      .get();
    return snap.docs
      .map((d) => d.data())
      .filter((d) => typeof d.text === 'string' && typeof d.at === 'number' && d.at >= since)
      .map((d) => ({ id: String(d.id), text: String(d.text), at: Number(d.at) }));
  } catch (error) {
    log.warn({ error: String(error) }, 'Commitments not loaded');
    return [];
  }
}

/** Save a plan. Never throws. */
export async function saveCommitment(userId: string, followUp: FollowUp): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc(followUp.id)
      .set(followUp);
  } catch (error) {
    log.warn({ error: String(error) }, 'Commitment not saved');
  }
}
