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

import { markCrisisTurn } from '../../services/safety/crisis-turn-mark.js';

export const CRISIS_GATE_SIGNAL = 'crisis_gate_decision';

/** Emits { action } on the session for any decision but 'pass', and marks the turn. */
export function signalCrisisDecision(session: unknown, action: string | undefined): void {
  if (action) markCrisisTurn((session as { userData?: unknown }).userData, action);
  if (!action || action === 'pass') return;
  const emitter = session as { emit?: (event: string, ...args: unknown[]) => unknown };
  emitter.emit?.(CRISIS_GATE_SIGNAL, { action });
}
