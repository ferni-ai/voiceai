/**
 * The record of every check-in Ferni sent unprompted: which channel, what
 * prompted it, and what came of it. Frequency caps read it, and outcome
 * learning can use it to learn the best channel and time for each person.
 *
 * bogle_users/{uid}/proactive_outreach_log/{sourceId}: one document per thing
 * Ferni followed up on, so the same promise or event is never sent twice.
 *
 * @module services/outreach/proactive-channels/outreach-log
 */

import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

export const LOG_COLLECTION = 'proactive_outreach_log';

/**
 * sent: out, no answer yet. replied: they talked with Ferni or wrote back
 * after it. ignored: a day went by without that. answered / no_answer /
 * busy / declined: how a call went. failed: the channel didn't take it.
 */
export type OutreachOutcome =
  'sent' | 'replied' | 'ignored' | 'answered' | 'no_answer' | 'busy' | 'declined' | 'failed';

export interface OutreachLogEntry {
  sourceId: string;
  kind: ProactiveTrigger['kind'];
  channel: ProactiveChannel;
  reason: string;
  /** Why this channel was picked. */
  why: string;
  at: string;
  outcome: OutreachOutcome;
  outcomeAt?: string;
}

function logOf(userId: string): FirebaseFirestore.CollectionReference {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  return db.collection('bogle_users').doc(userId).collection(LOG_COLLECTION);
}

/** Firestore ids can't contain '/'. */
export function logId(sourceId: string): string {
  return sourceId.replace(/\//g, '_').slice(0, 400);
}

export async function alreadySent(userId: string, sourceId: string): Promise<boolean> {
  return (await logOf(userId).doc(logId(sourceId)).get()).exists;
}

export async function writeOutreachLog(userId: string, entry: OutreachLogEntry): Promise<void> {
  await logOf(userId).doc(logId(entry.sourceId)).set(entry);
}
