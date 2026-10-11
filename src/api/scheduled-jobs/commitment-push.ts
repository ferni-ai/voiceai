/**
 * Between-call follow-up on what callers said they'd do (COACH_FOLLOW_THROUGH).
 *
 * The old query in superhuman-jobs.ts asked for `dueDate` and `description`,
 * which no writer sets (commitment-keeper.ts writes `followUpAfter` and
 * `statement`), so it never matched. This reads the fields that are written.
 *
 * @module api/scheduled-jobs/commitment-push
 */

import {
  dueForPush,
  firestoreCommitmentStore,
  toOpenCommitment,
  type CommitmentStore,
  type OpenCommitment,
} from '../../services/superhuman/commitment-follow-up.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CommitmentPush' });

/** Newest active commitments scanned per run (status + createdAt has a collection-group index). */
const SCAN_LIMIT = 300;

export interface DueCommitment {
  userId: string;
  commitment: OpenCommitment;
}

/** One due commitment per caller, oldest follow-up first. */
export function pickDuePerUser(rows: DueCommitment[], now: number): DueCommitment[] {
  const byUser = new Map<string, DueCommitment>();
  for (const row of rows) {
    if (!dueForPush(row.commitment, now)) continue;
    const held = byUser.get(row.userId);
    if (!held || row.commitment.followUpAfter < held.commitment.followUpAfter) {
      byUser.set(row.userId, row);
    }
  }
  return [...byUser.values()];
}

/** The push text: their own words, and a question a friend would ask. */
export function pushMessage(c: OpenCommitment): string {
  return `How did it go? Last time you said: "${c.statement}"`;
}

async function scanDue(now: number): Promise<DueCommitment[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db
    .collectionGroup('commitments')
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .limit(SCAN_LIMIT)
    .get();
  const rows: DueCommitment[] = [];
  for (const doc of snap.docs) {
    const userId = doc.ref.parent.parent?.id;
    const commitment = toOpenCommitment(doc.id, doc.data());
    if (userId && commitment) rows.push({ userId, commitment });
  }
  return pickDuePerUser(rows, now);
}

export interface PushDeps {
  scan?: (now: number) => Promise<DueCommitment[]>;
  send: (userId: string, message: string, commitmentId: string) => Promise<boolean>;
  store?: CommitmentStore;
}

/** Push one follow-up per caller whose commitment is due. Returns how many were sent. */
export async function sendCommitmentPushes(
  deps: PushDeps,
  now: number = Date.now()
): Promise<number> {
  const store = deps.store ?? firestoreCommitmentStore;
  // A failed scan must not take the rest of the outreach job down with it.
  const due = await (deps.scan ?? scanDue)(now).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Commitment scan failed');
    return [];
  });
  let sent = 0;
  for (const { userId, commitment } of due) {
    try {
      if (!(await deps.send(userId, pushMessage(commitment), commitment.id))) continue;
      sent++;
      await store.markFollowedUp(userId, commitment, now);
    } catch (error) {
      log.warn(
        { error: String(error), userId, commitmentId: commitment.id },
        'Commitment push failed'
      );
    }
  }
  log.info({ due: due.length, sent }, 'Commitment pushes done');
  return sent;
}
