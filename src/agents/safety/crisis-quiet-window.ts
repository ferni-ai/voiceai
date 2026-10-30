/**
 * CRISIS_QUIET_FROM_GATE (off by default): a crisis the reply gate handles on a call
 * starts the proactive quiet window, CRISIS_QUIET_DAYS (services/human-transfer/
 * crisis-signals.ts), which the pondered notes, the promise check-ins and the pondered
 * opener read through hadCrisisWithin.
 *
 * That window was fed only by the human-transfer detector (logCrisisSignal from
 * buildHumanTransferInjections), a different reader from the gate (crisis-gate.ts), so
 * a call that heard the 988/911 script mostly left nothing the window could see.
 *
 * - Counts: the script replacing the reply ('replace'), and the full crisis guidance
 *   (a 'guide' decisionFor marks crisis). Never a soft check-in.
 * - Stored by the existing writer, logCrisisSignal, with no words: severity and flags
 *   from the decision alone (gateCrisisSignals), the session and caller turn. Once per
 *   call per level.
 * - A MINOR_CARE-held caller: no crisis record, as CRISIS_EVENT_RECORD; a quietUntil
 *   time on minor_care_holds instead (recordQuietHold), no words, type or session.
 * - Fails closed: the quiet is held in this process from the start (holdQuietHere) and
 *   released once stored; a failed write is logged as an error and tried again.
 * - Runs on a later tick, caught: it can never touch the reply. shadow logs only.
 *
 * @module agents/safety/crisis-quiet-window
 */

import { setImmediate } from 'node:timers';
import { flagModeOf } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisEventKind } from './crisis-event-record.js';

const log = createLogger({ module: 'crisis-quiet-window' });

type QuietLevel = 'script' | 'guidance';
/** A reply gate decision (crisis-gate.ts CrisisGateDecision), as far as these hooks read it. */
export type GateDecision =
  { action: string; crisis?: boolean; kind?: CrisisEventKind } | null | undefined;

/** A failed write is tried again after each of these waits, then left held in this process. */
export const RETRY_MS: readonly number[] = [5_000, 60_000];
const DAY_MS = 86_400_000;
const MAX_CALLS = 5000;
/** `${sessionId}|${level}` already started, oldest first. */
const started = new Set<string>();

/** What a gate decision counts as, or undefined when it doesn't start the window. */
export function quietLevelOf(decision: GateDecision): QuietLevel | undefined {
  if (decision?.action === 'replace') return 'script';
  if (decision?.action === 'guide' && decision.crisis === true) return 'guidance';
  return undefined;
}

/** Told of each gate decision (crisis-gate-signal.ts, late-words.ts); returns at once, never throws. */
export function quietAfterCrisis(session: unknown, decision: GateDecision): void {
  const level = quietLevelOf(decision);
  if (!level) return;
  const selfHarm = decision?.kind?.crisisType === 'self_harm';
  const run = (): void => {
    startQuiet(session, level, selfHarm).catch(() =>
      log.error({ level }, 'Crisis quiet window failed, not stored')
    );
  };
  try {
    setImmediate(run);
  } catch {
    log.error({ level }, 'Crisis quiet window not scheduled, not stored');
  }
}

async function startQuiet(session: unknown, level: QuietLevel, selfHarm: boolean): Promise<void> {
  const mode = flagModeOf('CRISIS_QUIET_FROM_GATE');
  if (mode === 'off') return;
  const [{ idsOf }, { isSharedPlaceholderId }, { writeHeld }, { callerTurnOf }] = await Promise.all(
    [
      import('./crisis-event-record.js'),
      import('../../utils/synthetic-user.js'),
      import('../../utils/minor-care.js'),
      import('../shared/caller-turn-count.js'),
    ]
  );
  const { userId, sessionId } = idsOf(session);
  const at = { sessionId, level };
  if (!userId || isSharedPlaceholderId(userId)) {
    return log.info(at, 'Crisis quiet window skipped: no caller id');
  }
  const key = sessionId && `${sessionId}|${level}`;
  if (key && started.has(key)) return;
  if (key) started.add(key);
  if (started.size > MAX_CALLS) started.delete(started.values().next().value!);
  const held = writeHeld(userId, sessionId);
  if (mode === 'shadow') return log.info({ ...at, held }, 'Crisis quiet window (shadow)');

  const signals = await import('../../services/human-transfer/crisis-signals.js');
  const until = Date.now() + signals.CRISIS_QUIET_DAYS * DAY_MS;
  signals.holdQuietHere(userId, until); // fail closed here until a write is stored
  const userData = (session as { userData?: unknown }).userData;
  const turn = typeof userData === 'object' && userData ? callerTurnOf(userData) : undefined;
  const write = held
    ? async () => {
        const { recordQuietHold } =
          await import('../../services/outreach/minor-care-shared-hold.js');
        await recordQuietHold(userId, until);
        return true;
      }
    : async () => {
        const { logCrisisSignal } = await import('../../services/human-transfer/index.js');
        const stored = signals.gateCrisisSignals(level, selfHarm);
        return logCrisisSignal(userId, stored, undefined, sessionId, turn);
      };
  await store(write, () => signals.releaseQuietHere(userId), { ...at, held }, 0);
}

async function store(
  write: () => Promise<boolean>,
  release: () => void,
  at: { sessionId?: string; level: QuietLevel; held: boolean },
  attempt: number
): Promise<void> {
  let stored = false;
  let code = 'not-stored';
  try {
    stored = await write();
  } catch (error) {
    // The code only, and only when it looks like one: a message can quote the caller
    const raw = String((error as { code?: unknown } | null)?.code ?? '');
    code = /^[\w.-]{1,40}$/.test(raw) ? raw : 'unknown';
  }
  if (stored) {
    release();
    return log.info(at, 'Crisis quiet window stored');
  }
  log.error({ ...at, attempt, code }, 'Crisis quiet window not stored: held in this process');
  const wait = RETRY_MS[attempt];
  if (wait === undefined) return;
  const retry = setTimeout(() => {
    store(write, release, at, attempt + 1).catch(() => log.error(at, 'Crisis quiet retry failed'));
  }, wait);
  retry.unref?.();
}

/** For tests. */
export function resetCrisisQuietWindow(): void {
  started.clear();
}
