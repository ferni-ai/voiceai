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
 * A preemptive reply's gate reads before the pipeline's read of the turn has started (#4004).
 * When the gate's look finds no other read and its own read holds no risk, a line with check-in
 * words waits, within the same deadline, for the call's next read and looks again; any other line
 * never waits, and a shadow line logs whether a read came and the wait it would have added.
 *
 * @module CrisisGateTurnReads
 */

import { flagOn } from '../../config/env-flag.js';
import {
  holdsCheckinWords,
  nextTurnRead,
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

/** The turn's reads but the gate's own (turnVerdicts keeps the gate's read with the rest). */
function besidesOwn(own: Read, reads: readonly Read[]): Read[] {
  const at = reads.indexOf(own);
  return at < 0 ? [...reads] : [...reads.slice(0, at), ...reads.slice(at + 1)];
}

/** The turn's other reads, bounded by `deadline`; past it, one failed read. */
function otherReads(
  scope: string,
  input: CrisisClassifierInput,
  deadline: number
): Promise<Read[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Read[]>((resolve) => {
    timer = setTimeout(() => resolve([null]), Math.max(0, deadline - Date.now()));
  });
  const reads = turnVerdicts(scope, input).catch((): Read[] => [null]);
  return Promise.race([reads, late]).finally(() => clearTimeout(timer));
}

/**
 * A preemptive reply's gate reads before the turn ends, and the pipeline's read of the turn starts
 * at its end, so the gate's look can find no other read. Then, on a line with check-in words, the
 * gate waits for the next read kept on its call and looks again, until `deadline`: the gate's own
 * read's start plus the classifier timeout, so first words are never held longer than a read that
 * times out already holds them (the never-lower grid's first-words row). On other lines
 * it does not wait; the shadow logs only whether a read came and how long the wait would have
 * been. Counts and times only.
 */
async function lateReads(
  own: Read,
  first: Read[],
  scope: string,
  input: CrisisClassifierInput,
  deadline: number,
  started: number
): Promise<Read[] | undefined> {
  if (!holdsCheckinWords(input.latest, true)) {
    void nextTurnRead(scope, deadline - Date.now()).then((arrived) =>
      log.info(
        { wouldWait: true, arrived, wouldAddMs: arrived ? Date.now() - started : null },
        'CRISIS_GATE_TURN_READS_LATE_SHADOW'
      )
    );
    return undefined;
  }
  let others = first;
  while (!besidesOwn(own, others).length && (await nextTurnRead(scope, deadline - Date.now()))) {
    others = await otherReads(scope, input, deadline);
  }
  return others;
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
  const asked = Date.now();
  const read = await own;
  if (read === undefined || !scope) return read;
  const started = Date.now();
  const timeoutMs = resolveCrisisClassifierTimeoutMs(env);
  const deadline = started + timeoutMs + GRACE_MS;
  let others = await otherReads(scope, input, deadline);
  // No other read of the turn yet and no risk read: the pipeline's may not have started (#4004).
  const late = !besidesOwn(read, others).length && (read === null || read.risk === 'none');
  const waited = late
    ? await lateReads(read, others, scope, input, asked + timeoutMs, started)
    : undefined;
  if (waited) others = waited;
  const acted = strongestRead(read, others);
  log.info(
    {
      waitedMs: Date.now() - started,
      reads: others.length,
      failed: others.filter((other) => other === null).length,
      raised: acted !== read && acted !== null,
      ownFailed: read === null,
      waitedForPipeline: !!waited,
    },
    'CRISIS_GATE_TURN_READS'
  );
  return acted;
}
