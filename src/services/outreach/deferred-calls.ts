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
import { USER_REQUESTED_CALL } from './live-agent-call.js';
import {
  checkCallHours,
  isCallHoursGuardOn,
  type CallHoursDecision,
  type CallHoursInput,
} from './call-hours-guard.js';
import {
  deferredCallOutcome,
  logPromiseJobRun,
  logPromiseOutcome,
} from '../follow-through/index.js';

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
  /** Who the waiting call is to, as stored (pendingCallTo only). */
  contactName?: string;
}

// The on-behalf tool reads this back to tell the user when the call will happen.
const recent = new Map<string, Deferral>();

/** A held call whose time is no longer known here: nothing dialed, never "calling now" (#1415). */
export function heldCallReply(contactName: string): string {
  return `Nothing was dialed yet: it's not a good hour to call ${contactName}, so the call is held for a better time.`;
}

/** When a held call rings, in the recipient's time: "later today at 9:00 AM", "tomorrow at …". */
export function spokenWhen(at: Date, timeZone: string, now: Date): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  const tomorrow = day(new Date(now.getTime() + 86_400_000));
  const when =
    day(at) === day(now)
      ? 'later today'
      : day(at) === tomorrow
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(at);
  return `${when} at ${time.format(at)}`;
}

/**
 * What to tell the user when their call was deferred; undefined when it was placed.
 * Starts "Nothing was dialed yet" like heldCallReply, so the claim check
 * (agents/personas/action-claims.ts) reads it as held, never as a call placed:
 * prod 2026-10-17, Nayan said "I'm placing the call now" over this result.
 */
export function deferredCallReply(
  callId: string,
  contactName: string,
  purpose: string,
  now = new Date()
): string | undefined {
  const deferral = recent.get(callId);
  // deferCall's ids: a held call, even when its time has left this process's memory.
  if (!deferral) return callId.startsWith('deferred_') ? heldCallReply(contactName) : undefined;
  return (
    `Nothing was dialed yet: it's not a good hour to call ${contactName}, so I'll call ` +
    `${spokenWhen(deferral.at, deferral.timezone, now)} their time to ${purpose}.`
  );
}

/**
 * `quietAllDay`: the guard's input, kept when their saved window covers all their call hours
 * (QUIET_HOURS_FROM_PREFS, decision.none). The call then waits for their next day and is
 * dropped, not held again, if the window still covers it all (executeDueDeferredCalls).
 */
export async function deferCall(
  userId: string,
  call: DeferredCall,
  decision: CallHoursDecision,
  quietAllDay?: CallHoursInput
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
        ...(quietAllDay && { quietAllDay }),
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
  const userAsked = call.kind === 'proactive' && call.request.reason === USER_REQUESTED_CALL;
  const input = { ...recipient, ...(userAsked && { userAsked }) };
  const decision = await checkCallHours(input);
  if (decision.allowed) return undefined;
  // Quiet all day: no call today, one more look on their next day (never a call at `at`, past it).
  if (decision.recheckAt)
    return deferCall(userId, call, { ...decision, at: decision.recheckAt }, input);
  return deferCall(userId, call, decision);
}

/** The last ten digits, so "+13035550100" and "303-555-0100" match. */
const lastTen = (phone: unknown): string =>
  String(phone ?? '')
    .replace(/\D/g, '')
    .slice(-10);

/**
 * The user's on-behalf call to this number that is still waiting for its hour,
 * if any. A failed read finds none, so a call is never refused on a hiccup.
 */
export async function pendingCallTo(
  userId: string,
  phone: string | undefined,
  now = new Date()
): Promise<Deferral | undefined> {
  const want = lastTen(phone);
  if (want.length < 7) return undefined;
  return (await pendingCalls(userId, now)).find((call) => call.phone === want);
}

/** Every on-behalf call of the user's still waiting for its hour, soonest first. */
export async function pendingCalls(
  userId: string,
  now = new Date()
): Promise<Array<Deferral & { phone: string }>> {
  const waiting: Array<Deferral & { phone: string }> = [];
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return waiting;
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .where('status', '==', 'pending')
      .get();
    for (const doc of snap.docs) {
      const data = doc.data() as Partial<DeferredCall> & {
        scheduledFor?: string;
        timezone?: string;
      };
      if (data.kind !== 'on_behalf') continue;
      const at = new Date(data.scheduledFor ?? '');
      // Too late to be placed (executeDueDeferredCalls drops it): not waiting any more.
      if (Number.isNaN(at.getTime()) || now.getTime() - at.getTime() > LATE_AFTER_MS) continue;
      const { request } = data;
      const contactName = request?.resolvedContact?.name || request?.contactQuery;
      const phone = lastTen(request?.resolvedContact?.phone);
      waiting.push({ id: doc.id, at, timezone: data.timezone || 'UTC', contactName, phone });
    }
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not read pending deferred calls');
  }
  return waiting.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The other calls still set, each by name, so a reply about one call can't be
 * taken for another (owner call 2026-10-18: asked to call his sister, Ferni
 * said the call was "already scheduled for nine", which was his mom's).
 */
export function otherCallsLine(
  others: readonly Deferral[],
  now = new Date(),
  except?: string
): string {
  const set = others.filter((call) => call.id !== except && call.contactName);
  if (set.length === 0) return '';
  const each = set.map(
    (call) => `the call to ${call.contactName} ${spokenWhen(call.at, call.timezone, now)}`
  );
  return ` Separately, still set and unchanged: ${each.join('; ')} (their time).`;
}

/**
 * Place an on-behalf call unless one to the same number already waits for its
 * hour. `held` is what to tell the user when nothing rang now: the call already
 * set (prod 2026-10-17: after a handoff Ferni went to call the same mom again and
 * asked "Should I go ahead?"), or this one held by the call-hours guard.
 */
export async function placeOrHold(
  request: OnBehalfCallRequest,
  place: (request: OnBehalfCallRequest) => Promise<string>,
  now = new Date()
): Promise<{ callId?: string; held?: string; others?: string }> {
  const name = request.resolvedContact?.name || request.contactQuery;
  const want = lastTen(request.resolvedContact?.phone);
  const all = await pendingCalls(request.userId, now);
  const waiting = want.length >= 7 ? all.find((call) => call.phone === want) : undefined;
  const others = all.filter((call) => call !== waiting);
  if (waiting) return { held: alreadySetReply(name, waiting, now) + otherCallsLine(others, now) };
  const callId = await place(request);
  const held = deferredCallReply(callId, name, request.purpose, now);
  const also = otherCallsLine(others, now, callId);
  return { callId, held: held && held + also, others: also };
}

/**
 * A call to this number is already set: nothing new dialed, and when the set
 * one rings. Named by the waiting call's own contact, so a request for someone
 * else at that number is never told their call is set.
 */
export function alreadySetReply(contactName: string, waiting: Deferral, now = new Date()): string {
  const when = `${spokenWhen(waiting.at, waiting.timezone, now)} their time`;
  const setFor = waiting.contactName?.trim();
  if (setFor && setFor.toLowerCase() !== contactName.trim().toLowerCase()) {
    return (
      `Nothing was dialed yet: that number already has a call set, the call to ${setFor} ` +
      `${when}, so nothing new was set up for ${contactName}. Check the number with the caller.`
    );
  }
  return (
    `Nothing was dialed yet: a call to ${contactName} is already set for ${when}, so I ` +
    `didn't set up another. Tell the caller it's already on the way then.`
  );
}

export interface DeferredCallsRunResult {
  due: number;
  placed: number;
  /** Still outside the recipient's hours when picked up, so held again for the next good hour. */
  rescheduled: number;
  failed: number;
  missed: number;
  /** Dropped at the re-check: their saved window still covers all their call hours. */
  quietAllDay?: number;
}

/** The new deferral's id when the call-hours guard held it again, else undefined (it rang). */
async function place(userId: string, call: DeferredCall): Promise<string | undefined> {
  if (call.kind === 'on_behalf') {
    const { getOnBehalfCallOrchestrator } = await import('./on-behalf-call-orchestrator.js');
    const callId = await getOnBehalfCallOrchestrator().initiateCall({ ...call.request, userId });
    return callId.startsWith('deferred_') ? callId : undefined;
  }
  const { scheduleProactiveCall } = await import('./conversational-calls.js');
  const result = await scheduleProactiveCall({ ...call.request, userId });
  if (!result.success) throw new Error(result.error ?? 'proactive call failed');
  return undefined;
}

/** Held for a saved window over all their call hours, and still so now: drop it. */
async function stillQuietAllDay(data: Record<string, unknown>, now = new Date()): Promise<boolean> {
  const input = data.quietAllDay as CallHoursInput | undefined;
  return !!input && !!(await checkCallHours({ ...input, now })).none;
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
  const result: DeferredCallsRunResult = {
    due: claim.due,
    placed: 0,
    rescheduled: 0,
    failed: 0,
    missed: claim.late,
  };
  for (const item of claim.lateItems) {
    logPromiseOutcome('deferred-call', deferredCallOutcome('missed'), { userId: item.userId });
  }
  for (const item of claim.claimed) {
    const call = item.data as unknown as DeferredCall;
    let status: 'placed' | 'rescheduled' | 'failed' | 'quiet-all-day' = 'placed';
    let heldAs: string | undefined;
    try {
      if (await stillQuietAllDay(item.data, opts.now)) {
        status = 'quiet-all-day';
        result.quietAllDay = (result.quietAllDay ?? 0) + 1;
      } else {
        // Owner from the document's path, not the stored request.
        heldAs = await place(item.userId, call);
        // Still outside their hours (prod 2026-10-18 02:39Z, 8:39pm in Denver): held, not placed.
        if (heldAs) status = 'rescheduled';
        result[heldAs ? 'rescheduled' : 'placed']++;
      }
    } catch (error) {
      status = 'failed';
      result.failed++;
      log.warn({ userId: item.userId, error: String(error) }, 'Deferred call failed');
    }
    logPromiseOutcome('deferred-call', deferredCallOutcome(status), { userId: item.userId });
    await db
      .collection('bogle_users')
      .doc(item.userId)
      .collection(COLLECTION)
      .doc(item.id)
      .set({
        ...item.data,
        status,
        placedAt: new Date().toISOString(),
        ...(heldAs ? { rescheduledAs: heldAs } : {}),
      });
  }
  if (result.due > 0) log.info(result, 'Deferred calls run');
  logPromiseJobRun('deferred-calls', {
    due: result.due,
    done: result.placed,
    failed: result.failed,
    held: result.rescheduled,
    missed: result.missed,
  });
  return result;
}
