/**
 * Whether crisis handling may touch a turn, for the handoff tools: they never
 * take a transfer-only alias ("pass me to 9") as consent near crisis handling
 * (tools/handoff/transfer-aliases.ts). Marked on the session's userData by the
 * reply gate (agents/safety/crisis-gate-signal.ts).
 *
 * A guide or replace marks the whole call, for good, like holdCommitmentInvite;
 * only a live gate's 'pass' clears a turn; a turn no live gate decided is
 * unknown, which counts as guided (fail closed).
 *
 * @module services/safety/crisis-turn-mark
 */

/** Where a live gate's 'pass' marks the turn on userData. */
const PASSED_TURN = 'crisisGatePassedTurn';
/** userData of calls with any crisis-guided or replaced turn: never cleared. */
const crisisCalls = new WeakSet<object>();

const asObject = (userData: unknown): Record<string, unknown> | null =>
  typeof userData === 'object' && userData !== null ? (userData as Record<string, unknown>) : null;

/** A live gate's decision for this turn: 'pass' clears it, anything else marks the call. */
export function markCrisisTurn(userData: unknown, action: string): void {
  const data = asObject(userData);
  if (!data) return;
  data[PASSED_TURN] = action === 'pass';
  if (action !== 'pass') crisisCalls.add(data);
}

/**
 * No live gate decided this turn (CRISIS_GUARD_MODE off or shadow): unknown. Set, never
 * `delete`d: the live userData is a proxy with no deleteProperty trap (user-data-proxy.ts), so
 * a delete left the last turn's pass in place and aliases failed open (Opus verify, #2015).
 */
export function unmarkCrisisTurn(userData: unknown): void {
  const data = asObject(userData);
  if (data) data[PASSED_TURN] = false;
}

/**
 * Whether crisis handling may touch this turn: true on a call that has had any,
 * and unless a live gate passed this turn (unknown counts as guided).
 */
export function crisisGuidedTurn(userData: unknown): boolean {
  const data = asObject(userData);
  return !data || crisisCalls.has(data) || data[PASSED_TURN] !== true;
}
