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
 * Also per call: which caller turns got a reply with crisis handling
 * (noteCrisisReply), so the adjudicator never softens the turn answering one.
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

const turnOf = (latest: string): string =>
  latest
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Told of every risk noted: the call, and the caller words whose read noted it, when known. */
type RiskListener = (sessionId: string, turn: string | undefined) => void;
const listeners = new Set<RiskListener>();

/** Hear of every risk noted on any call (crisis-lone-imminent.ts drops its snapshots). */
export function onCrisisRiskNoted(listener: RiskListener): void {
  listeners.add(listener);
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
  for (const [id, at] of risky) if (now - at > TTL_MS) risky.delete(id);
  risky.delete(sessionId);
  risky.set(sessionId, now);
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

/**
 * Per call: the caller turns whose reply carried crisis handling (guidance, the
 * script or the soft check), noted by the reply gate and the turn pipeline.
 * The adjudicator never softens the turn that answers one (crisis-adjudicator.ts).
 */
const replied = new Map<string, { at: number; turns: Set<string> }>();
const REPLIED_TURNS_MAX = 64;

/** This turn's reply carries crisis guidance, the crisis script or the soft check. */
export function noteCrisisReply(
  sessionId: string | undefined,
  latest: string,
  now = Date.now()
): void {
  if (!sessionId || !latest.trim()) return;
  for (const [id, v] of replied) if (now - v.at > TTL_MS) replied.delete(id);
  const turns = replied.get(sessionId)?.turns ?? new Set<string>();
  if (turns.size >= REPLIED_TURNS_MAX) turns.delete(turns.values().next().value ?? '');
  turns.add(turnOf(latest));
  replied.set(sessionId, { at: now, turns });
}

/** Whether the reply to these caller words carried crisis handling on this call. */
export function crisisReplyOnTurn(sessionId: string, latest: string, now = Date.now()): boolean {
  const v = replied.get(sessionId);
  return !!v && now - v.at <= TTL_MS && v.turns.has(turnOf(latest));
}

/** For tests. */
export function resetCrisisCallRisk(): void {
  risky.clear();
  pending.clear();
  replied.clear();
}
