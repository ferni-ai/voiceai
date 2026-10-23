/**
 * The session event carrying each reply's crisis decision (crisis-gate.ts),
 * pattern or classifier, so work held back for latency runs at once on a
 * risky turn (multi-agent/first-turn-defer.ts). A leaf module, so both sides
 * can import it without an import cycle.
 *
 * @module agents/safety/crisis-gate-signal
 */

export const CRISIS_GATE_SIGNAL = 'crisis_gate_decision';

const crisisSessions = new WeakSet<object>();

/** True once the gate guided or replaced a reply on this session: no banter for the rest of the call. */
export function crisisDecidedOn(session: unknown): boolean {
  return typeof session === 'object' && session !== null && crisisSessions.has(session);
}

/** Emits { action } on the session for any decision but 'pass'. */
export function signalCrisisDecision(session: unknown, action: string | undefined): void {
  if (!action || action === 'pass') return;
  if (typeof session === 'object' && session !== null) crisisSessions.add(session);
  const emitter = session as { emit?: (event: string, ...args: unknown[]) => unknown };
  emitter.emit?.(CRISIS_GATE_SIGNAL, { action });
}

const pendingVerdicts = new WeakMap<object, Promise<unknown>>();

/** The classifier holds this reply until `verdict` settles: no casual sound meanwhile. */
export function noteCrisisVerdictPending(session: object, verdict: Promise<unknown>): void {
  pendingVerdicts.set(session, verdict);
  const clear = (): void => {
    if (pendingVerdicts.get(session) === verdict) pendingVerdicts.delete(session);
  };
  verdict.then(clear, clear);
}

export const crisisVerdictPending = (session: object): Promise<unknown> | null =>
  pendingVerdicts.get(session) ?? null;
