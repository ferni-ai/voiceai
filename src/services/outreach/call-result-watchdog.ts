/**
 * CALL_RESULT_WATCHDOG: the owner always hears how an on-behalf call went, even
 * when the call never reports.
 *
 * The result is captured inside the outbound call's own agent job. When that job
 * never reports (prod 2026-11-05: the agent joined and SIP rang, then nothing was
 * stored), the owner, told "I'll let you know", heard nothing and asked again.
 * agent-join.ts covers only "no agent joined".
 *
 * When a call is placed, a watch is written at
 * bogle_users/{uid}/call_result_watchdogs/{callId}, due NO_REPORT_AFTER_MS later.
 * The per-minute execute-scheduled-outreach job (background-delivery-jobs.ts)
 * claims the due watches (due-items.ts) and, for a call with no stored result,
 * captures a failed result marked noReport ("I couldn't confirm how the call to
 * X went"), told through the same tellOwnerOnce path as any result. Durable:
 * a restart of the agent or the server loses no watch.
 *
 * A no-report result is stored only while the call has none, in one transaction
 * (writeCallResult), so it never replaces a real one. A real result that comes
 * later replaces it and is told by tellOwnerOnce's own rule: again when it
 * carries more than the line status (their words, a summary, action items, a
 * crisis line), only recorded when it is status alone.
 *
 * The flag must be on where calls are placed (the agent) and where the job runs
 * (the API server). Off: nothing is written, swept or read.
 *
 * @module services/outreach/call-result-watchdog
 */
import { createHash } from 'crypto';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from '../../utils/firestore-utils.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/index.js';

const log = createLogger({ module: 'call-result-watchdog' });

const COLLECTION = 'call_result_watchdogs';
/**
 * How long a placed call has to report. The longest call is the SIP cap, 15 min
 * after a 45 s ring (call-opening-flag.ts), and the result is stored seconds after
 * it ends. Under call-result-watch's 30 min, so an owner still on the call hears it there.
 */
const NO_REPORT_AFTER_MS = 25 * 60 * 1000;
/** A watch found later than this (the job was down) is still settled, then dropped. */
const LATE_AFTER_MS = 24 * 60 * 60 * 1000;

type WatchOutcome = 'reported' | 'timed_out' | 'late_real_result';

export function callResultWatchdogOn(env?: Env): boolean {
  return flagOn('CALL_RESULT_WATCHDOG', env);
}

/** Words-free: a hash of the call id and what the watch found. */
function logWatch(callId: string, outcome: WatchOutcome): void {
  const callHash = createHash('sha256').update(callId).digest('hex').slice(0, 12);
  log.info({ callHash, outcome }, 'CALL_RESULT_WATCHDOG');
}

/** The result stored when the call never reported: how it went is not known. */
function noReportOutcome(callId: string, contactName: string): CallOutcome {
  return {
    callId,
    status: 'failed',
    objectiveAchieved: false,
    outcome: `I couldn't confirm how the call to ${contactName} went.`,
    callbackRequired: false,
    noReport: true,
  };
}

/** Watch a call just placed for the owner. Never throws; a no-op with the flag off. */
export async function armCallResultWatchdog(
  request: OnBehalfCallRequest,
  callId: string,
  now = new Date()
): Promise<void> {
  if (!callResultWatchdogOn() || !isMemberIdentity(request.userId?.trim())) return;
  try {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const dueAt = new Date(now.getTime() + NO_REPORT_AFTER_MS).toISOString();
    const watch = cleanForFirestore({ status: 'pending', dueAt, request });
    await db.collection('bogle_users').doc(request.userId).collection(COLLECTION).doc(callId).set(watch); // prettier-ignore
  } catch (error) {
    log.warn({ callId, error: String(error) }, 'CALL_RESULT_WATCHDOG not armed');
  }
}

/**
 * Write a captured result to the call record (call-result-capture.ts). A
 * no-report result only while the call has no result; false when it lost to one.
 * Flag off: the plain write, as before.
 */
export async function writeCallResult(
  db: Firestore,
  ref: DocumentReference,
  clean: Record<string, unknown>
): Promise<boolean> {
  const fields = { mergeFields: Object.keys(clean) };
  if (!callResultWatchdogOn()) return ref.set(clean, fields).then(() => true);
  const noReport = (clean.outcome as CallOutcome | undefined)?.noReport === true;
  const write = await db.runTransaction(async (tx) => {
    const before = (await tx.get(ref)).data()?.outcome as CallOutcome | undefined;
    if (noReport && before) return 'lost';
    // A real result over a no-report one: the next opener brings it up even if that was told.
    const late = !noReport && before?.noReport === true;
    tx.set(ref, late ? { ...clean, delivered: false } : clean, late ? { mergeFields: [...fields.mergeFields, 'delivered'] } : fields); // prettier-ignore
    return late ? 'late' : 'stored';
  });
  const callId = String(clean.callId);
  if (noReport) logWatch(callId, write === 'stored' ? 'timed_out' : 'reported');
  else if (write === 'late') logWatch(callId, 'late_real_result');
  return write !== 'lost';
}

/** One due watch: the call reported, or it gets the no-report result. */
async function settle(
  callId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  const { captureCallResult, getCallResult } = await import('./call-result-capture.js');
  if ((await getCallResult(callId, userId))?.outcome) return logWatch(callId, 'reported');
  // The owner from the watch's path, never the stored request's own field.
  const request = { ...(data.request as OnBehalfCallRequest), userId };
  const contactName = request.resolvedContact?.name || request.contactQuery;
  await captureCallResult(callId, noReportOutcome(callId, contactName), request);
}

export interface WatchdogRun {
  due: number;
  settled: number;
  failed: number;
}

/** Settle the due watches. Run by the execute-scheduled-outreach job; a no-op with the flag off. */
export async function sweepCallResultWatchdogs(
  opts: { now?: Date; limit?: number } = {}
): Promise<WatchdogRun> {
  const run: WatchdogRun = { due: 0, settled: 0, failed: 0 };
  if (!callResultWatchdogOn()) return run;
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const { claimDueItems } = await import('../scheduling/index.js');
  const claim = await claimDueItems(db, {
    collection: COLLECTION,
    dueField: 'dueAt',
    dueType: 'iso',
    claimStatus: 'settling',
    lateStatus: 'late',
    lateAfterMs: LATE_AFTER_MS,
    now: opts.now,
    limit: opts.limit ?? 20,
  });
  run.due = claim.due;
  const late = new Set(claim.lateItems);
  for (const item of [...claim.claimed, ...claim.lateItems]) {
    const settled = await settle(item.id, item.userId, item.data).then(
      () => true,
      (error: unknown) => log.warn({ callId: item.id, error: String(error) }, 'CALL_RESULT_WATCHDOG not settled') // prettier-ignore
    );
    run[settled ? 'settled' : 'failed']++;
    // The watch holds the request (who, what for): it goes once settled. A failure is
    // tried again next minute, until the watch is a day late.
    const done = settled || late.has(item);
    await (done ? item.ref.delete() : item.ref.update({ status: 'pending' })).catch(() => undefined); // prettier-ignore
  }
  if (run.due > 0) log.info({ ...run }, 'CALL_RESULT_WATCHDOG run');
  return run;
}
