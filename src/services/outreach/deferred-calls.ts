/**
 * Deferred Calls
 *
 * A call the call-hours guard held back (see call-hours-guard.ts) waits in
 * bogle_users/{uid}/deferred_calls until its time, then the per-minute
 * execute-scheduled-outreach job places it again through the same path, so
 * the guard checks it once more on the way out.
 *
 * @module services/outreach/deferred-calls
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';
import type { ProactiveCallRequest } from './conversational-calls.js';
import {
  checkCallHours,
  isCallHoursGuardOn,
  type CallHoursDecision,
  type CallHoursInput,
} from './call-hours-guard.js';

const log = createLogger({ module: 'DeferredCalls' });

const COLLECTION = 'deferred_calls';
/** A call more than this late is dropped rather than placed out of the blue. */
const LATE_AFTER_MS = 12 * 60 * 60 * 1000;

export type DeferredCall =
  | { kind: 'on_behalf'; request: OnBehalfCallRequest }
  | { kind: 'proactive'; request: ProactiveCallRequest };

export interface Deferral {
  id: string;
  at: Date;
  timezone: string;
}

// The on-behalf tool reads this back to tell the user when the call will happen.
const recent = new Map<string, Deferral>();

/** What to tell the user when their call was deferred; undefined when it was placed. */
export function deferredCallReply(
  callId: string,
  contactName: string,
  purpose: string,
  now = new Date()
): string | undefined {
  const deferral = recent.get(callId);
  if (!deferral) return undefined;
  const timeZone = deferral.timezone;
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const tomorrow = day(new Date(now.getTime() + 86_400_000));
  const when =
    day(deferral.at) === day(now)
      ? 'later today'
      : day(deferral.at) === tomorrow
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(deferral.at);
  return (
    `It's not a good hour to call ${contactName} right now, so I'll call ${when} at ` +
    `${time.format(deferral.at)} their time to ${purpose}.`
  );
}

export async function deferCall(
  userId: string,
  call: DeferredCall,
  decision: CallHoursDecision
): Promise<Deferral> {
  const id = `deferred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const deferral = { id, at: decision.at, timezone: decision.timezone };
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available to defer the call');
  await db
    .collection('bogle_users')
    .doc(userId)
    .collection(COLLECTION)
    .doc(id)
    .set(
      cleanForFirestore({
        ...call,
        status: 'pending',
        scheduledFor: decision.at.toISOString(),
        timezone: decision.timezone,
        timezoneSource: decision.source,
        createdAt: new Date().toISOString(),
      })
    );
  recent.set(id, deferral);
  if (recent.size > 100) recent.delete(recent.keys().next().value as string);
  log.info(
    { userId, kind: call.kind, at: deferral.at, timezone: deferral.timezone },
    'Call deferred'
  );
  return deferral;
}

/** With CALL_HOURS_GUARD=on, defer a call the recipient's local hours rule out. */
export async function holdForCallHours(
  userId: string,
  call: DeferredCall,
  recipient: CallHoursInput
): Promise<Deferral | undefined> {
  if (!isCallHoursGuardOn()) return undefined;
  const decision = await checkCallHours(recipient);
  return decision.allowed ? undefined : deferCall(userId, call, decision);
}

export interface DeferredCallsRunResult {
  due: number;
  placed: number;
  failed: number;
  missed: number;
}

async function place(userId: string, call: DeferredCall): Promise<void> {
  if (call.kind === 'on_behalf') {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    await getOnBehalfCallOrchestrator().initiateCall({ ...call.request, userId });
    return;
  }
  const { scheduleProactiveCall } = await import('./conversational-calls.js');
  const result = await scheduleProactiveCall({ ...call.request, userId });
  if (!result.success) throw new Error(result.error ?? 'proactive call failed');
}

/** Place the deferred calls that are due. Run by the execute-scheduled-outreach job. */
export async function executeDueDeferredCalls(
  opts: { now?: Date; limit?: number } = {}
): Promise<DeferredCallsRunResult> {
  const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const { claimDueItems } = await import('../scheduling/due-items.js');
  const claim = await claimDueItems(db, {
    collection: COLLECTION,
    dueField: 'scheduledFor',
    dueType: 'iso',
    claimStatus: 'placing',
    lateStatus: 'missed',
    lateAfterMs: LATE_AFTER_MS,
    now: opts.now,
    limit: opts.limit ?? 10,
  });
  const result = { due: claim.due, placed: 0, failed: 0, missed: claim.late };
  for (const item of claim.claimed) {
    const call = item.data as unknown as DeferredCall;
    let status = 'placed';
    try {
      // Owner from the document's path, not the stored request.
      await place(item.userId, call);
      result.placed++;
    } catch (error) {
      status = 'failed';
      result.failed++;
      log.warn({ userId: item.userId, error: String(error) }, 'Deferred call failed');
    }
    await db
      .collection('bogle_users')
      .doc(item.userId)
      .collection(COLLECTION)
      .doc(item.id)
      .set({ ...item.data, status, placedAt: new Date().toISOString() });
  }
  if (result.due > 0) log.info(result, 'Deferred calls run');
  return result;
}
