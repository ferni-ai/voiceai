/**
 * After a call: the one thread Ferni would raise on the caller's next call
 * (right-moment B1). Reads inputs through ports, asks arbiter.ts, logs one
 * line. Nothing calls it yet: the after-call register that wires the ports
 * behind FOLLOW_UP_BRAIN comes next. In B1
 * shadow and on are the same: nothing reaches a prompt, is marked asked, is
 * stored, scheduled or sent.
 *
 * - Holds fail closed: a read that throws, or answers anything but `false`, holds; an
 *   unreadable or missing forgotten matcher blocks (G4).
 * - Asks: until B3 writes them, every `surfaced` entry (opener, in-call, text)
 *   and `asks` (#2084) entry on follow-ups changed in the last 7 days, closed included.
 * - Appetite: nothing stores it yet, so every caller has the prior (three a week) until B5.
 * - Quiet hours: the plan carries no time, only "the next call", so they hold by construction.
 * - Privacy: the log line holds mode, gate ids, counts, picked and kind. No id, words or hash.
 *
 * @module services/follow-through/plan
 */
import { createLogger } from '../../utils/safe-logger.js';
import { PRIOR_APPETITE, type Appetite } from './appetite.js';
import { pickThread, WEEK_MS, type AskEvent, type GateId, type ThreadPlan } from './arbiter.js';
import type { FollowUp, FollowUpKind } from './follow-up.js';

const log = createLogger({ module: 'follow-up-plan' });

/** The call that just ended. */
export interface PlanCall {
  readonly userId: string;
  readonly sessionId: string;
  readonly startedAt: Date;
}

/** Where the plan's inputs come from. Every read may throw. */
export interface PlanPorts {
  readonly followUps: (userId: string) => Promise<readonly FollowUp[]>;
  /** The caller's follow-ups changed in [from, to), for the asks in them. */
  readonly askHistory: (userId: string, from: Date, to: Date) => Promise<readonly FollowUp[]>;
  /** A matcher for topics the caller asked Ferni to forget; null when they can't be read. */
  readonly forgotten: (userId: string) => Promise<((text: string) => boolean) | null>;
  /** Crisis risk on the call that just ended; a crisis-level signal in the last `hours`. */
  readonly crisis: {
    readonly thisCall: (sessionId: string) => boolean | Promise<boolean>;
    readonly within: (userId: string, hours: number, now: Date) => Promise<boolean>;
  };
  readonly minorCare: (userId: string, sessionId: string) => boolean | Promise<boolean>;
  /** One port for every hold: opt-out and STOP today; a DV hold joins here. */
  readonly holds: (userId: string, sessionId: string) => Promise<boolean>;
  readonly appetite?: (userId: string) => Promise<Appetite>;
}

/** No Ferni-started ask within this long after a call where crisis risk fired (§8). */
const CRISIS_WAIT_HOURS = 72;

/** A hold read passes only on a strict `false`; undefined, null or anything else holds. */
const heldUnlessFalse = (answer: unknown): boolean => answer !== false;

/** A forgotten matcher, or null (unreadable, G4 stops the plan) when the port gave no function. */
const matcherOrNull = (answer: unknown): ((text: string) => boolean) | null =>
  typeof answer === 'function' ? (answer as (text: string) => boolean) : null;

/** The read's answer, or `unreadable` when it throws or rejects. */
async function readOr<T>(read: () => T | Promise<T>, unreadable: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    log.warn({ error: String(error) }, 'Follow-up plan input unreadable: held');
    return unreadable;
  }
}

/** Every raise and ask recorded on these follow-ups, once each. */
export function asksIn(rows: readonly FollowUp[]): AskEvent[] {
  const seen = new Map<string, AskEvent>();
  for (const f of rows) {
    for (const { at } of [...f.surfaced, ...(f.asks ?? [])])
      seen.set(`${f.id}|${at}`, {
        followUpId: f.id,
        at,
        ...(f.topicKey && { topicKey: f.topicKey }),
      });
  }
  return [...seen.values()];
}

/** Reads everything in parallel and asks the arbiter; a follow-up read that throws fails the plan. */
export async function planNextThread(
  call: PlanCall,
  ports: PlanPorts,
  now: Date
): Promise<{ plan: ThreadPlan; candidates: number }> {
  const { userId, sessionId } = call;
  const [crisisNow, crisisRecent, minorCare, held, forgotten, candidates, history, appetite] =
    await Promise.all([
      readOr(async () => heldUnlessFalse(await ports.crisis.thisCall(sessionId)), true),
      readOr(
        async () => heldUnlessFalse(await ports.crisis.within(userId, CRISIS_WAIT_HOURS, now)),
        true
      ),
      readOr(async () => heldUnlessFalse(await ports.minorCare(userId, sessionId)), true),
      readOr(async () => heldUnlessFalse(await ports.holds(userId, sessionId)), true),
      readOr(async () => matcherOrNull(await ports.forgotten(userId)), null),
      ports.followUps(userId),
      ports.askHistory(userId, new Date(now.getTime() - WEEK_MS), new Date(now.getTime() + 1)),
      ports.appetite?.(userId) ?? PRIOR_APPETITE,
    ]);
  const input = {
    crisis: crisisNow || crisisRecent,
    minorCare,
    held,
    forgotten,
    candidates,
    asks: asksIn([...history, ...candidates]),
    callStartedAt: call.startedAt,
    appetite,
  };
  return { plan: pickThread(input, now), candidates: candidates.length };
}

export type PlanMode = 'shadow' | 'on';

/** The one log line. Nothing else may go in it (plan §8b privacy). */
export interface PlanLogRecord {
  readonly mode: PlanMode;
  readonly picked: boolean;
  readonly kind: FollowUpKind | null;
  readonly blockedBy: GateId | null;
  readonly dropped: Partial<Record<GateId, number>>;
  readonly candidates: number;
}

/** Plans the next call's thread and logs one line: mode, gate ids, counts, picked, kind. */
export async function runFollowUpPlan(
  call: PlanCall,
  mode: PlanMode,
  ports: PlanPorts,
  now: Date
): Promise<PlanLogRecord> {
  const { plan, candidates } = await planNextThread(call, ports, now);
  const { pick, blockedBy, dropped } = plan;
  const kind = pick?.kind ?? null;
  const record: PlanLogRecord = {
    mode,
    picked: pick !== null,
    kind,
    blockedBy,
    dropped,
    candidates,
  };
  log.info(record, 'FOLLOW_UP_PLAN');
  return record;
}
