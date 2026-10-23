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

const pendingVerdicts = new WeakMap<object, Promise<void>>();

/**
 * The classifier holds this session's reply until `verdict` settles (crisis-gate.ts
 * holdUntilCleared): no casual sound meanwhile (slow-turn-sound.ts).
 */
export function noteCrisisVerdictPending(session: unknown, verdict: Promise<unknown>): void {
  if (typeof session !== 'object' || session === null) return;
  const settled: Promise<void> = verdict
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      if (pendingVerdicts.get(session) === settled) pendingVerdicts.delete(session);
    });
  pendingVerdicts.set(session, settled);
}

/** The session's pending crisis verdict, or null when nothing holds its reply. */
export function crisisVerdictPending(session: unknown): Promise<void> | null {
  if (typeof session !== 'object' || session === null) return null;
  return pendingVerdicts.get(session) ?? null;
}
