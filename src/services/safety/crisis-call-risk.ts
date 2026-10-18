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
 * @module CrisisCallRisk
 */

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

/** Note risk on this call, moving it to the back. Only expired calls are ever dropped. */
export function noteCrisisRisk(sessionId: string | undefined, now = Date.now()): void {
  if (!sessionId) return;
  for (const [id, at] of risky) if (now - at > TTL_MS) risky.delete(id);
  risky.delete(sessionId);
  risky.set(sessionId, now);
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
    if (risk) noteCrisisRisk(sessionId);
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

/** For tests. */
export function resetCrisisCallRisk(): void {
  risky.clear();
  pending.clear();
}
