/**
 * The TURN_RECEIPT number of each live call's open turn, by session id, so a log line
 * written outside the receipt (CRISIS_CLASSIFIER, the crisis override) can be joined to
 * its turn exactly instead of by time. The recorder (turn-receipt-session.ts) binds it;
 * a leaf module, so services can read it without importing the agents layer.
 *
 * @module utils/call-turn
 */
import { createSessionBindings } from './session-bindings.js';

const turns = createSessionBindings<() => number>();

/** The call's open turn number, read when asked. Returns the release. */
export function bindCallTurn(sessionId: string, current: () => number): () => void {
  turns.bind(sessionId, current);
  return () => turns.release(sessionId, current);
}

/** The open turn's number on this call; null with no call or no receipt recorder. */
export function callTurnOf(sessionId: string | undefined): number | null {
  if (!sessionId) return null; // never the lone bound call: it may be another caller's
  return turns.resolve(sessionId)?.() ?? null;
}
