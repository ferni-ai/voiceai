/**
 * The live report's own record on the call doc (bogle_users/{uid}/on_behalf_calls/{callId}):
 * `liveReport: { claimedAt, spokenAt }`.
 *
 * Claimed once, across the in-process report and the owner call's watch
 * (call-result-live.ts, call-result-watch.ts), so the owner hears it once. It
 * never reads `told.*`: the once-per-channel ledger (call-result-once, #3081)
 * claims `told.voice` before it asks for the live report, so reading it here
 * would stop every report (#3082 verify, round 1). An owner already texted
 * (`delivered`) counts as told.
 *
 * Marked spoken only when the speaker heard it played (CALL_ALERT_SPOKEN): then
 * the result is delivered by voice in both While You Were Away stores, so the
 * next call's opener doesn't repeat it. Held or dropped, nothing is marked and
 * the opener still tells it.
 *
 * @module services/outreach/live-report-record
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'live-report-record' });

/** Claims this process already made, so its two paths never both speak (oldest dropped first). */
const claimedHere = new Set<string>();
const CLAIMS_KEPT = 500;
/** When to look for the While You Were Away result: capture may store it after the report is heard. */
const UNIFIED_TRIES_MS = [0, 5000, 15_000];

type CallDoc = NonNullable<
  ReturnType<typeof import('../superhuman/firestore-utils.js').getFirestoreDb>
>;

async function callDoc(
  userId: string,
  callId: string
): Promise<{ db: CallDoc; ref: ReturnType<ReturnType<CallDoc['collection']>['doc']> } | null> {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) return null;
  return {
    db,
    ref: db.collection('bogle_users').doc(userId).collection('on_behalf_calls').doc(callId),
  };
}

/**
 * Claim the spoken report of this call: false when it is already claimed
 * (`liveReport.claimedAt`) or the owner was already texted (`delivered`). Never
 * throws. The other path that could speak this report runs where the owner's call
 * is, which is this process (liveSessionFor), so with no call record (stored in
 * memory) or a failed transaction, this process's own claim decides.
 */
export async function claimVoiceReport(userId: string, callId: string): Promise<boolean> {
  const key = `${userId}/${callId}`;
  if (claimedHere.has(key)) return false;
  claimedHere.add(key);
  if (claimedHere.size > CLAIMS_KEPT) claimedHere.delete(claimedHere.values().next().value ?? '');
  try {
    const doc = await callDoc(userId, callId);
    if (!doc) return true;
    return await doc.db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.exists !== true) return true;
      const data = fresh.data() as
        { liveReport?: { claimedAt?: unknown }; delivered?: unknown } | undefined;
      if (data?.liveReport?.claimedAt !== undefined || data?.delivered === true) return false;
      tx.update(doc.ref, { 'liveReport.claimedAt': new Date().toISOString() });
      return true;
    });
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'CALL_RESULT_LIVE_REPORT claim failed; told here');
    return true;
  }
}

const later = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

/** The owner heard it: note it, and mark it delivered by voice in both stores. Never throws. */
export async function markLiveReportSpoken(userId: string, callId: string): Promise<void> {
  try {
    const doc = await callDoc(userId, callId);
    await doc?.ref.update({ 'liveReport.spokenAt': new Date().toISOString() });
    const { markCallResultsDelivered } =
      await import('../../intelligence/context-builders/external/pending-call-results.js');
    await markCallResultsDelivered(userId, [callId]);
    const { getPendingResults, markResultsDelivered } =
      await import('../background-agents/unified-result-capture.js');
    for (const wait of UNIFIED_TRIES_MS) {
      // eslint-disable-next-line no-await-in-loop -- one look at a time, until it is stored
      await later(wait);
      // eslint-disable-next-line no-await-in-loop -- one look at a time, until it is stored
      const pending = await getPendingResults(userId, { types: ['on_behalf_call'] });
      const ids = pending.filter((r) => r.relatedTaskId === callId).map((r) => r.id);
      if (ids.length > 0) {
        // eslint-disable-next-line no-await-in-loop -- found: mark it and stop
        await markResultsDelivered(userId, ids, 'voice');
        break;
      }
    }
    log.info({ callId }, 'CALL_RESULT_LIVE_REPORT spoken; marked delivered');
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'Live report spoken, but not marked delivered');
  }
}
