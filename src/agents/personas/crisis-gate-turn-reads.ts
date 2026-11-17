/**
 * CRISIS_GATE_TURN_READS (off by default): the reply gate acts on the strongest classifier read
 * of its turn, not only its own.
 *
 * The gate and the turn pipeline read the same turn as two classifier calls whenever their
 * inputs differ (a different Ferni line, a turn split by a paused reply, a different deadline).
 * Before this, the gate looked at the pipeline's read only once its own read escalated, so on a
 * turn its own read called none and the pipeline's called imminent, the caller heard an ordinary
 * reply (dev and prod logs, 2026-11-04..16).
 *
 * A failed or missing other read never becomes a crisis script: it makes the combined read
 * null, so the classifier-timeout check-in (crisis-timeout-checkin.ts, owner 2026-11-10) decides,
 * which adds a gentle check-in with 988 only on risk-adjacent words; otherwise the gate's own
 * decision stands. Logs counts and times only, never words.
 *
 * @module CrisisGateTurnReads
 */

import { flagOn } from '../../config/env-flag.js';
import {
  resolveCrisisClassifierTimeoutMs,
  turnVerdicts,
  verdictOutcome,
  type CrisisClassifierInput,
  type CrisisVerdict,
} from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisGateTurnReads' });

type Env = Record<string, string | undefined>;
type Read = CrisisVerdict | null;

/** Past the classifier's own deadline, a read still out counts as failed. */
const GRACE_MS = 250;

export const gateTurnReadsOn = (env: Env = process.env): boolean =>
  flagOn('CRISIS_GATE_TURN_READS', env);

const RANK = { none: 0, crisis: 1, block: 2 } as const;
const rankOf = (read: CrisisVerdict): number => RANK[verdictOutcome(read)];

/**
 * The read the gate acts on: the strongest risk among its own and the turn's other reads; else
 * null when any read failed (the timeout check-in decides); else its own. Its own read first, so
 * a tie keeps it.
 */
function strongestRead(own: Read, others: readonly Read[]): Read {
  const reads = [own, ...others];
  let strongest: CrisisVerdict | null = null;
  for (const read of reads) {
    if (read && read.risk !== 'none' && (!strongest || rankOf(read) > rankOf(strongest))) {
      strongest = read;
    }
  }
  if (strongest) return strongest;
  return reads.some((read) => read === null) ? null : own;
}

/** The turn's other reads, bounded by the classifier's deadline; past it, one failed read. */
function otherReads(scope: string, input: CrisisClassifierInput, env: Env): Promise<Read[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Read[]>((resolve) => {
    timer = setTimeout(() => resolve([null]), resolveCrisisClassifierTimeoutMs(env) + GRACE_MS);
  });
  const reads = turnVerdicts(scope, input).catch((): Read[] => [null]);
  return Promise.race([reads, late]).finally(() => clearTimeout(timer));
}

/**
 * The gate's read, weighed with the turn's other reads once it is in. Undefined (no live read)
 * stays undefined; with no call scope the gate's own read is all there is.
 */
export async function withTurnReads(
  own: Promise<Read | undefined>,
  scope: string | undefined,
  input: CrisisClassifierInput,
  env: Env
): Promise<Read | undefined> {
  const read = await own;
  if (read === undefined || !scope) return read;
  const started = Date.now();
  const others = await otherReads(scope, input, env);
  const acted = strongestRead(read, others);
  log.info(
    {
      waitedMs: Date.now() - started,
      reads: others.length,
      failed: others.filter((other) => other === null).length,
      raised: acted !== read && acted !== null,
      ownFailed: read === null,
    },
    'CRISIS_GATE_TURN_READS'
  );
  return acted;
}
