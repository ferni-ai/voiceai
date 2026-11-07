/**
 * K1e: nothing a call with an abuse disclosure set off may reach the caller, since the person
 * hurting them may read the texts or pick up. The one check every outreach writer asks:
 * the trigger publisher, the decision engine, group outreach, session-end analysis and the
 * per-turn superhuman writers (live-superhuman-writes.ts).
 *
 * A call is held when any read on it told of someone hurting the caller (abuseTold): the kernel's
 * pattern read (notePatternRisk), a settled turn read (trackAbuseRead), or, at session end, any
 * caller line (abuseToldOnCall). A call with only suicidal or other crisis risk is not held: its
 * follow-ups and memory writes go out as on main, since a caring check-in can protect.
 *
 * Per call, in memory, for 6 hours from the last disclosure. A writer that knows only the user
 * (the burnout and dormant-dream bridges) is held when a held call is bound to that user
 * (minor-care.ts binds every call at session start).
 *
 * A turn read still in flight defers the answer until it settles, up to the wait it was tracked
 * with (twice the classifier timeout: a first read and a second read). One that has not settled
 * by then holds, and one that fails holds: an unread call is not known to be safe. Every outcome
 * is logged as counts only, never ids or words.
 *
 * @module AbuseOutreachHold
 */

import { sessionUser } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { abuseTold, abuseToldOnCall } from './abuse-disclosure.js';

const log = createLogger({ module: 'AbuseOutreachHold' });

const TTL_MS = 6 * 60 * 60 * 1000;

/** Calls an abuse disclosure was noted on, with when it was last noted. */
const told = new Map<string, number>();
/** Per call: turn reads in flight, with when each stops being waited for. */
const reading = new Map<string, Map<Promise<unknown>, number>>();

type Outcome = 'held' | 'sent' | 'deferred_held' | 'deferred_sent' | 'timeout' | 'rejected';

/** Logs the outcome as counts only; true when outreach is held. */
function counted(outcome: Outcome, reads: number): boolean {
  // Nothing held and nothing waited on is every ordinary write: debug only.
  if (outcome === 'sent' && reads === 0) log.debug({ outcome, reads }, 'Abuse outreach hold');
  else log.info({ outcome, reads }, 'Abuse outreach hold');
  return outcome !== 'sent' && outcome !== 'deferred_sent';
}

/** Note an abuse disclosure on this call when the read tells of one. */
export function noteAbuseRead(
  sessionId: string | undefined,
  read: { indicators: readonly string[] },
  now = Date.now()
): void {
  if (!sessionId || !abuseTold(read)) return;
  for (const [id, at] of told) if (now - at > TTL_MS) told.delete(id);
  told.delete(sessionId);
  told.set(sessionId, now);
}

/**
 * Track one turn's settled read on this call: in flight until it settles, then noted when it
 * tells of abuse. A read that fails is noted too (fail closed).
 */
export async function trackAbuseRead<T extends { crisis: { indicators: readonly string[] } }>(
  sessionId: string | undefined,
  read: Promise<T>,
  waitMs: number
): Promise<T> {
  if (!sessionId) return read;
  const reads = reading.get(sessionId) ?? new Map<Promise<unknown>, number>();
  reads.set(read, Date.now() + waitMs);
  reading.set(sessionId, reads);
  const done = (): void => {
    reads.delete(read);
    if (reads.size === 0 && reading.get(sessionId) === reads) reading.delete(sessionId);
  };
  read.then(
    (settled) => {
      done();
      noteAbuseRead(sessionId, settled.crisis);
    },
    () => {
      done();
      told.set(sessionId, Date.now());
      counted('rejected', 1);
    }
  );
  return read;
}

/** Who a writer is writing for: the call, the user, and at session end the caller's lines. */
export interface OutreachFor {
  sessionId?: string;
  userId?: string;
  callerLines?: readonly string[];
}

/** This call, and every call bound to this user, that has a disclosure or a read in flight. */
function callsOf({ sessionId, userId }: OutreachFor): string[] {
  const calls = new Set<string>(sessionId ? [sessionId] : []);
  if (userId) {
    for (const id of [...told.keys(), ...reading.keys()]) {
      if (sessionUser(id) === userId) calls.add(id);
    }
  }
  return [...calls];
}

function heldNow(calls: readonly string[], now: number): boolean {
  return calls.some((id) => {
    const at = told.get(id);
    return at !== undefined && now - at <= TTL_MS;
  });
}

/**
 * The hold for a writer that can't wait (the decision engine's addTrigger): a read still in
 * flight holds, as one that never settles would.
 */
export function abuseHoldNow(who: OutreachFor, now = Date.now()): boolean {
  const calls = callsOf(who);
  if (heldNow(calls, now) || abuseToldOnCall(who.callerLines ?? [])) return counted('held', 0);
  const reads = calls.reduce((n, id) => n + (reading.get(id)?.size ?? 0), 0);
  return counted(reads > 0 ? 'timeout' : 'sent', reads);
}

/**
 * Whether outreach for this call or user is held. Reads in flight are waited on, up to their
 * wait; then the call is held if one told of abuse, failed, or has still not settled.
 */
export async function abuseHoldsOutreach(who: OutreachFor): Promise<boolean> {
  const calls = callsOf(who);
  if (heldNow(calls, Date.now()) || abuseToldOnCall(who.callerLines ?? [])) {
    return counted('held', 0);
  }
  const inFlight = calls.flatMap((id) => [...(reading.get(id)?.entries() ?? [])]);
  if (inFlight.length === 0) return counted('sent', 0);
  const until = Math.max(...inFlight.map(([, at]) => at));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, until - Date.now()));
  });
  const reads: Array<Promise<unknown>> = [];
  for (const [read] of inFlight) reads.push(read);
  const all = Promise.allSettled(reads).then(() => true);
  const settled = await Promise.race([all, late]);
  clearTimeout(timer);
  if (!settled) return counted('timeout', inFlight.length);
  return counted(heldNow(calls, Date.now()) ? 'deferred_held' : 'deferred_sent', inFlight.length);
}

/** For tests. */
export function resetAbuseOutreachHold(): void {
  told.clear();
  reading.clear();
}
