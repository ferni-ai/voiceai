/**
 * The session event carrying each reply's crisis decision (crisis-gate.ts),
 * pattern or classifier, so work held back for latency runs at once on a
 * risky turn (multi-agent/first-turn-defer.ts). A leaf module, so both sides
 * can import it without an import cycle.
 *
 * @module agents/safety/crisis-gate-signal
 */

export const CRISIS_GATE_SIGNAL = 'crisis_gate_decision';
import type { CrisisReader } from '../../services/safety/index.js';
import { recordCrisisOnCall, type CrisisEventKind } from './crisis-event-record.js';

const crisisSessions = new WeakSet<object>();

/** True once the gate guided or replaced a reply on this session: no banter for the rest of the call. */
export function crisisDecidedOn(session: unknown): boolean {
  return typeof session === 'object' && session !== null && crisisSessions.has(session);
}

/** Emits { action } on the session for any decision but 'pass'. */
export function signalCrisisDecision(
  session: unknown,
  action: string | undefined,
  from: { reader: CrisisReader; kind?: CrisisEventKind } = { reader: 'pattern' }
): void {
  if (!action || action === 'pass') return;
  recordCrisisOnCall(session, action, from.reader, from.kind); // CRISIS_EVENT_RECORD: a later tick, never awaited
  if (typeof session === 'object' && session !== null) crisisSessions.add(session);
  const emitter = session as { emit?: (event: string, ...args: unknown[]) => unknown };
  emitter.emit?.(CRISIS_GATE_SIGNAL, { action });
}

const pendingVerdicts = new WeakMap<object, Promise<unknown>>();
/** The session each pending verdict holds a reply on, for its TURN_RECEIPT (crisis-hold-timing.ts). */
const verdictSessions = new WeakMap<Promise<unknown>, object>();

/** The classifier holds this reply until `verdict` settles: no casual sound meanwhile. */
export function noteCrisisVerdictPending(session: object, verdict: Promise<unknown>): void {
  pendingVerdicts.set(session, verdict);
  verdictSessions.set(verdict, session);
  const clear = (): void => {
    if (pendingVerdicts.get(session) === verdict) pendingVerdicts.delete(session);
  };
  verdict.then(clear, clear);
}

export const crisisVerdictPending = (session: object): Promise<unknown> | null =>
  pendingVerdicts.get(session) ?? null;

/** The session a verdict holds a reply on (noteCrisisVerdictPending), if any. */
export const sessionHeldBy = (verdict: Promise<unknown>): object | undefined =>
  verdictSessions.get(verdict);
