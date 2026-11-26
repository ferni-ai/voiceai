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
 * claims the due watches (due-items.ts). A call whose LiveKit room is still
 * open, or can't be read, is looked at again RECHECK_MS later, until MAX_WATCH_MS
 * after it was placed: a long call is never told as unreported. Otherwise, for a
 * call with no stored result, it captures one with status 'unconfirmed' ("I
 * couldn't confirm how the call to X went"), told through the same tellOwnerOnce
 * path every result takes; every reader says it couldn't confirm, never that it
 * failed. Durable: a restart of the agent or the server loses no watch. A sweep
 * claims a watch by a lease (LEASE_MS): one whose process died is due again when
 * the lease ends. A watch goes once settled; one that still can't be settled is
 * dropped once it is a day late (LATE_AFTER_MS). No Firestore TTL policy is involved.
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
import { onBehalfRoom } from './on-behalf-dispatch.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/index.js';

const log = createLogger({ module: 'call-result-watchdog' });

const COLLECTION = 'call_result_watchdogs';
/**
 * When a placed call is first looked at. Most calls end well inside it (the SIP cap
 * is 15 min only with CALL_OPENING_AMD on), and the result is stored seconds after
 * one ends. A call still going then is looked at again, not told.
 */
const NO_REPORT_AFTER_MS = 25 * 60 * 1000;
/** How often a call whose room is still open (or unreadable) is looked at again. */
const RECHECK_MS = 5 * 60 * 1000;
/** No call runs this long: a room still open past it is stuck, and the owner is told. */
const MAX_WATCH_MS = 4 * 60 * 60 * 1000;
/** A watch found later than this (the job was down) is still settled, then dropped. */
const LATE_AFTER_MS = 24 * 60 * 60 * 1000;
/** A claimed watch is due again this long after its claim, unless its sweep settled it. */
const LEASE_MS = 10 * 60 * 1000;

type WatchOutcome = 'reported' | 'timed_out' | 'late_real_result' | 'still_on';

export function callResultWatchdogOn(env?: Env): boolean {
  return flagOn('CALL_RESULT_WATCHDOG', env);
}

/** Logged in place of the call id. */
const callHashOf = (callId: string): string =>
  createHash('sha256').update(callId).digest('hex').slice(0, 12);

/** Words-free: a hash of the call id and what the watch found. */
function logWatch(callId: string, outcome: WatchOutcome): void {
  log.info({ callHash: callHashOf(callId), outcome }, 'CALL_RESULT_WATCHDOG');
}

/** The result stored when the call never reported: how it went is not known. */
function noReportOutcome(callId: string, contactName: string): CallOutcome {
  return {
    callId,
    status: 'unconfirmed',
    objectiveAchieved: false,
    outcome: `I couldn't confirm how the call to ${contactName} went.`,
    callbackRequired: false,
  };
}

/** Whether the call's room is still open; 'unknown' when LiveKit can't be read here. */
async function callRoom(callId: string): Promise<'open' | 'gone' | 'unknown'> {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!url || !key || !secret) return 'unknown';
  try {
    const { RoomServiceClient } = await import('livekit-server-sdk');
    const rooms = await new RoomServiceClient(url, key, secret).listRooms([onBehalfRoom(callId)]); // prettier-ignore
    return rooms.length > 0 ? 'open' : 'gone';
  } catch {
    return 'unknown';
  }
}

/** Watch a call just placed for the owner: true once the watch is written. Never throws. */
export async function armCallResultWatchdog(
  request: OnBehalfCallRequest,
  callId: string,
  now = new Date()
): Promise<boolean> {
  if (!callResultWatchdogOn() || !isMemberIdentity(request.userId?.trim())) return false;
  try {
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const dueAt = new Date(now.getTime() + NO_REPORT_AFTER_MS).toISOString();
    const watch = cleanForFirestore({ status: 'pending', dueAt, armedAt: now.toISOString(), request }); // prettier-ignore
    await db.collection('bogle_users').doc(request.userId).collection(COLLECTION).doc(callId).set(watch); // prettier-ignore
    return true;
  } catch (error) {
    log.warn({ callHash: callHashOf(callId), error: String(error) }, 'CALL_RESULT_WATCHDOG not armed'); // prettier-ignore
    return false;
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
  const noReport = (clean.outcome as CallOutcome | undefined)?.status === 'unconfirmed';
  const write = await db.runTransaction(async (tx) => {
    const before = (await tx.get(ref)).data()?.outcome as CallOutcome | undefined;
    if (noReport && before) return 'lost';
    // A real result over a no-report one: the next opener brings it up even if that was told.
    const late = !noReport && before?.status === 'unconfirmed';
    tx.set(ref, late ? { ...clean, delivered: false } : clean, late ? { mergeFields: [...fields.mergeFields, 'delivered'] } : fields); // prettier-ignore
    return late ? 'late' : 'stored';
  });
  const callId = String(clean.callId);
  if (noReport) logWatch(callId, write === 'stored' ? 'timed_out' : 'reported');
  else if (write === 'late') logWatch(callId, 'late_real_result');
  return write !== 'lost';
}

/** One due watch: the call reported, is still going (looked at again), or gets the no-report. */
async function settle(
  callId: string,
  userId: string,
  data: Record<string, unknown>,
  now: Date
): Promise<'settled' | 'again'> {
  const { captureCallResult, getCallResult } = await import('./call-result-capture.js');
  if ((await getCallResult(callId, userId))?.outcome) {
    logWatch(callId, 'reported');
    return 'settled';
  }
  const armedAt = Date.parse(String(data.armedAt));
  const capped = !(now.getTime() - armedAt < MAX_WATCH_MS); // no armedAt: told now
  if (!capped && (await callRoom(callId)) !== 'gone') {
    logWatch(callId, 'still_on');
    return 'again';
  }
  // The owner from the watch's path, never the stored request's own field.
  const request = { ...(data.request as OnBehalfCallRequest), userId };
  const contactName = request.resolvedContact?.name || request.contactQuery;
  await captureCallResult(callId, noReportOutcome(callId, contactName), request);
  return 'settled';
}

export interface WatchdogRun {
  due: number;
  settled: number;
  /** Still going: looked at again RECHECK_MS later. */
  again: number;
  failed: number;
}

/** Settle the due watches. Run by the execute-scheduled-outreach job; a no-op with the flag off. */
export async function sweepCallResultWatchdogs(
  opts: { now?: Date; limit?: number } = {}
): Promise<WatchdogRun> {
  const run: WatchdogRun = { due: 0, settled: 0, again: 0, failed: 0 };
  if (!callResultWatchdogOn()) return run;
  const now = opts.now ?? new Date();
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
    leaseMs: LEASE_MS,
    now,
    limit: opts.limit ?? 20,
  });
  run.due = claim.due;
  const late = new Set(claim.lateItems);
  for (const item of [...claim.claimed, ...claim.lateItems]) {
    const got = await settle(item.id, item.userId, item.data, now).catch((error: unknown) => {
      log.warn({ callHash: callHashOf(item.id), error: String(error) }, 'CALL_RESULT_WATCHDOG not settled'); // prettier-ignore
      return 'failed' as const;
    });
    run[got]++;
    // The watch holds the request (who, what for): it goes once settled. A failure is
    // tried again next minute, until the watch is a day late; a call still going, later.
    // A failure keeps its own due time (so it turns late); a write lost here leaves the lease.
    const next = got === 'again' ? new Date(now.getTime() + RECHECK_MS).toISOString() : item.data.dueAt; // prettier-ignore
    const done = got === 'settled' || (got === 'failed' && late.has(item));
    await (done ? item.ref.delete() : item.ref.update({ dueAt: next })).catch(() => undefined);
  }
  if (run.due > 0) log.info({ ...run }, 'CALL_RESULT_WATCHDOG run');
  return run;
}
