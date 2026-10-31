/**
 * The session event carrying each reply's crisis decision (crisis-gate.ts),
 * pattern or classifier, so work held back for latency runs at once on a
 * risky turn (multi-agent/first-turn-defer.ts). A leaf module, so both sides
 * can import it without an import cycle.
 *
 * It also marks the turn for the handoff tools' transfer aliases
 * (services/safety/crisis-turn-mark.ts).
 *
 * @module agents/safety/crisis-gate-signal
 */

import { markCrisisTurn, unmarkCrisisTurn } from '../../services/safety/crisis-turn-mark.js';

export const CRISIS_GATE_SIGNAL = 'crisis_gate_decision';
import type { CrisisReader } from '../../services/safety/index.js';
import { recordCrisisOnCall, type CrisisEventKind } from './crisis-event-record.js';

const crisisSessions = new WeakSet<object>();

/** True once the gate guided or replaced a reply on this session: no banter for the rest of the call. */
export function crisisDecidedOn(session: unknown): boolean {
  return typeof session === 'object' && session !== null && crisisSessions.has(session);
}

/** Emits { action } on the session for any decision but 'pass', and marks the turn. */
export function signalCrisisDecision(
  session: unknown,
  action: string | undefined,
  reader: CrisisReader = 'pattern',
  kind?: CrisisEventKind
): void {
  // Every decision marks the turn, 'pass' included: only a pass clears it for transfer aliases
  // (crisis-turn-mark.ts). No pattern gate at all: unknown, so unmarked (fail closed).
  const userData = (session as { userData?: unknown } | null | undefined)?.userData;
  if (action) markCrisisTurn(userData, action);
  else if (reader === 'pattern') unmarkCrisisTurn(userData);
  if (!action || action === 'pass') return;
  if (typeof session === 'object' && session !== null) crisisSessions.add(session);
  const emitter = session as { emit?: (event: string, ...args: unknown[]) => unknown };
  emitter.emit?.(CRISIS_GATE_SIGNAL, { action });
  recordCrisisOnCall(session, action, reader, kind); // CRISIS_EVENT_RECORD: after the signal, never throws
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
