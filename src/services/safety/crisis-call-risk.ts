/**
 * Whether anything on a call has found crisis risk, for CRISIS_TRANSFER_EVERYDAY
 * (crisis-transfer-request.ts): a bare "pass me to Nayan" is only eased on a
 * call where nothing has.
 *
 * Per call, in memory, for 6 hours from the last thing noted:
 * - a pattern match, the crisis script, or a classifier read the agreement
 *   gate or adjudicator let stand (noted by the gate and the turn pipeline);
 * - any classifier read that was not none, or gave no verdict;
 * - a soft check-in;
 * - reads still in flight, which count as risk until they finish.
 * A call with risk noted is never dropped before its 6 hours are up.
 *
 * CRISIS_GROUNDED_RELEASE (crisis-grounded-release.ts) also asks a narrower
 * question: is there risk on this call that no grounded release explained?
 * crisisRiskThisCall never forgets a release; only unexplainedCrisisRisk does.
 *
 * @module CrisisCallRisk
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisCallRisk' });

const TTL_MS = 6 * 60 * 60 * 1000;

/** Calls with risk noted, least recently noted first. */
const risky = new Map<string, number>();
/** Per call: reads in flight, by the caller words they read (a turn). */
const pending = new Map<string, Map<string, number>>();
/**
 * Per call, for unexplainedCrisisRisk: whether risk was ever noted with no
 * turn (a pattern match, a script that stood), the turns whose reads noted
 * risk, and the turns a grounded release explained.
 */
interface RiskNotes {
  turnless: boolean;
  turns: Set<string>;
  explained: Set<string>;
}
const notes = new Map<string, RiskNotes>();
const notesOf = (sessionId: string): RiskNotes => {
  let kept = notes.get(sessionId);
  if (!kept) {
    kept = { turnless: false, turns: new Set(), explained: new Set() };
    notes.set(sessionId, kept);
  }
  return kept;
};

const turnOf = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Told of every risk noted: the call, and the caller words whose read noted it, when known. */
type RiskListener = (sessionId: string, turn: string | undefined) => void;
const listeners = new Set<RiskListener>();

/**
 * Hear of every risk noted on any call (crisis-lone-imminent.ts drops its
 * snapshots). Returns a function that stops listening (call-wrap-up.ts listens
 * only while a call is ending).
 */
export function onCrisisRiskNoted(listener: RiskListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** For tests: how many listeners are attached. */
export function crisisRiskListenerCount(): number {
  return listeners.size;
}

/**
 * Note risk on this call, moving it to the back. Only expired calls are ever
 * dropped. `turn` is the caller words whose read found it, when one did.
 */
export function noteCrisisRisk(
  sessionId: string | undefined,
  now = Date.now(),
  turn?: string
): void {
  if (!sessionId) return;
  for (const [id, at] of risky) {
    if (now - at > TTL_MS) {
      risky.delete(id);
      notes.delete(id);
    }
  }
  risky.delete(sessionId);
  risky.set(sessionId, now);
  const kept = notesOf(sessionId);
  if (turn === undefined) kept.turnless = true;
  else kept.turns.add(turn);
  for (const listener of listeners) {
    try {
      listener(sessionId, turn);
    } catch (error) {
      // A listener's failure never stops risk being noted.
      log.warn({ error: String(error) }, 'Crisis risk listener failed');
    }
  }
}

/**
 * Track one classifier read for this call: in flight until it settles, then
 * noted as risk unless it is a clean none.
 */
export function trackCrisisRead<T extends { risk: string } | null>(
  sessionId: string | undefined,
  latest: string,
  read: Promise<T>
): Promise<T> {
  if (!sessionId) return read;
  const turn = turnOf(latest);
  const reads = pending.get(sessionId) ?? new Map<string, number>();
  reads.set(turn, (reads.get(turn) ?? 0) + 1);
  pending.set(sessionId, reads);
  const settle = (risk: boolean): void => {
    const left = (reads.get(turn) ?? 1) - 1;
    if (left > 0) reads.set(turn, left);
    else reads.delete(turn);
    if (reads.size === 0 && pending.get(sessionId) === reads) pending.delete(sessionId);
    if (risk) noteCrisisRisk(sessionId, Date.now(), turn);
  };
  read.then(
    (v) => settle(v?.risk !== 'none'),
    () => settle(true)
  );
  return read;
}

/**
 * Any risk on this call: noted risk, or a read still in flight. With `latest`,
 * reads in flight of those same words (this turn's other path) are not counted.
 */
export function crisisRiskThisCall(sessionId: string, latest?: string, now = Date.now()): boolean {
  const at = risky.get(sessionId);
  if (at !== undefined && now - at <= TTL_MS) return true;
  const reads = pending.get(sessionId);
  if (!reads) return false;
  const turn = latest === undefined ? undefined : turnOf(latest);
  return [...reads.keys()].some((t) => t !== turn);
}

/** A grounded release explained this turn's risk: unexplainedCrisisRisk stops counting it. */
export function explainCrisisTurn(sessionId: string | undefined, latest: string): void {
  if (sessionId) notesOf(sessionId).explained.add(turnOf(latest));
}

/** How many turns grounded releases have explained on this call. */
export function explainedCrisisTurns(sessionId: string): number {
  return notes.get(sessionId)?.explained.size ?? 0;
}

/**
 * crisisRiskThisCall without the turns a grounded release explained: any risk
 * noted with no turn, any noted turn not explained, or a read of other words
 * still in flight.
 */
export function unexplainedCrisisRisk(
  sessionId: string,
  latest: string,
  now = Date.now()
): boolean {
  const turn = turnOf(latest);
  const at = risky.get(sessionId);
  if (at !== undefined && now - at <= TTL_MS) {
    const kept = notes.get(sessionId);
    if (!kept || kept.turnless) return true;
    for (const t of kept.turns) if (t !== turn && !kept.explained.has(t)) return true;
  }
  const reads = pending.get(sessionId);
  return !!reads && [...reads.keys()].some((t) => t !== turn);
}

/** For tests. */
export function resetCrisisCallRisk(): void {
  risky.clear();
  pending.clear();
  notes.clear();
}
