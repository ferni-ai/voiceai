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
import { reportOutreachLog } from '../outreach-bq.js';
import type { TextSource } from './outreach-text.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

export const LOG_COLLECTION = 'proactive_outreach_log';

/**
 * sent: out, no answer yet. replied: they talked with Ferni or wrote back
 * after it. ignored: a day went by without that. answered / no_answer /
 * busy / declined: how a call went. failed: the channel didn't take it.
 * pending: claimed by a run that is still sending it.
 */
export type OutreachOutcome =
  | 'pending'
  | 'sent'
  | 'replied'
  | 'ignored'
  | 'answered'
  | 'no_answer'
  | 'busy'
  | 'declined'
  | 'failed';

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
  /** The channel the policy chose when delivery fell back from it (a text that failed). */
  fallbackFrom?: ProactiveChannel;
  /** A call that couldn't be placed: where its words went instead (it still counts as a call). */
  fallbackChannel?: ProactiveChannel;
  /** Phone channels ruled out by the person's STOP or do-not-call (opt-outs.ts). */
  optedOut?: ProactiveChannel[];
  /** What was sent, and who wrote it (outreach-text.ts). */
  text?: string;
  textSource?: TextSource;
}

/** The newest text in the log, so the same words don't go out twice in a row. */
export function lastTextOf(entries: OutreachLogEntry[]): string | undefined {
  return [...entries].filter((e) => e.text).sort((a, b) => b.at.localeCompare(a.at))[0]?.text;
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
  reportOutreachLog(userId, entry);
}

/** Their log since `since` (ISO), for the daily caps and back-off. */
export async function recentOutreach(userId: string, since: Date): Promise<OutreachLogEntry[]> {
  const snap = await logOf(userId).where('at', '>=', since.toISOString()).get();
  return snap.docs.map((d) => d.data() as OutreachLogEntry);
}

/**
 * Decide and claim in one transaction: read their log (the caps), let
 * `decide` choose, and create this trigger's entry when it goes out. Two runs
 * that overlap (a call rings for up to 40 s) can't both send it or both pass
 * a cap. 'claimed' when another run already has it.
 */
export async function claimOutreach<T>(
  userId: string,
  sourceId: string,
  since: Date,
  decide: (recent: OutreachLogEntry[]) => { result: T; claim?: OutreachLogEntry }
): Promise<T | 'claimed'> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const ref = logOf(userId).doc(logId(sourceId));
  const claimed = (error: unknown): 'claimed' => {
    if (/ALREADY_EXISTS/.test(String(error))) return 'claimed';
    throw error;
  };
  return db
    .runTransaction(async (tx) => {
      const mine = await tx.get(ref);
      const recent = await tx.get(logOf(userId).where('at', '>=', since.toISOString()));
      if (mine.exists) return 'claimed' as const;
      const { result, claim } = decide(recent.docs.map((d) => d.data() as OutreachLogEntry));
      if (claim) tx.create(ref, claim);
      return result;
    })
    .catch(claimed);
}
