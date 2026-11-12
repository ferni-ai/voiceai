/**
 * CRISIS_QUIET_FROM_GATE (off by default): a crisis the reply gate handles on a call starts the
 * proactive quiet window, CRISIS_QUIET_DAYS (services/human-transfer/crisis-signals.ts), which the
 * pondered notes, the promise check-ins and the pondered opener read through hadCrisisWithin.
 * Before, only the human-transfer detector (logCrisisSignal from buildHumanTransferInjections) fed
 * that window, so most calls that heard the 988/911 script left nothing it could see (#3150).
 *
 * - Counts: the script replacing the reply ('replace'), decisionFor's full guidance for the
 *   caller's own crisis (crisis: true), and its guidance about someone the caller knows
 *   (about: 'third_party'). Never a soft check-in, the gentle offer or an eased guide.
 * - The caller's own crisis: one crisis_signals doc with no words, by the existing writer
 *   (logCrisisSignal, gateCrisisSignals), with the session and caller turn. Once per call per level.
 * - A MINOR_CARE-held caller (careHeld, as CRISIS_EVENT_RECORD), or a crisis about someone else:
 *   no crisis record, only a quietUntil time on minor_care_holds (recordQuietHold). So a third
 *   party's crisis never reads as the caller's in the crisis follow-up (getCrisisHistory).
 * - Fails closed: the quiet is held in this process before anything is awaited (holdQuietHere)
 *   and released once stored; a failed write is logged as an error and tried again.
 * - Runs on a later tick, caught: it never touches the reply. shadow logs only; off runs nothing.
 *
 * @module agents/safety/crisis-quiet-window
 */

import { setImmediate } from 'node:timers';
import { flagModeOf } from '../../config/env-flag.js';
import {
  CRISIS_QUIET_DAYS,
  gateCrisisSignals,
  holdQuietHere,
  releaseQuietHere,
} from '../../services/human-transfer/crisis-signals.js';
import { recordQuietHold } from '../../services/outreach/minor-care-shared-hold.js';
import { isSelfHarm } from '../../services/safety/index.js';
import { careHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isSharedPlaceholderId } from '../../utils/synthetic-user.js';
import { callerTurnOf } from '../shared/caller-turn-count.js';
import { idsOf, type CrisisEventKind } from './crisis-event-record.js';

const log = createLogger({ module: 'crisis-quiet-window' });

type QuietLevel = 'script' | 'guidance' | 'third_party';
/** A reply gate decision (crisis-gate.ts CrisisGateDecision), as far as this reads it. */
export type QuietDecision =
  { action: string; crisis?: true; about?: string; kind?: CrisisEventKind } | null | undefined;

/** A failed write is tried again after each of these waits, then left held in this process. */
export const RETRY_MS: readonly number[] = [5_000, 60_000];
const DAY_MS = 86_400_000;
const MAX_CALLS = 5000;
/** `${sessionId}|${level}` already started, oldest first. */
const started = new Set<string>();

/** What a gate decision counts as, or undefined when it doesn't start the window. */
export function quietLevelOf(decision: QuietDecision): QuietLevel | undefined {
  if (decision?.action === 'replace') return 'script';
  if (decision?.action !== 'guide') return undefined;
  if (decision.crisis === true) return 'guidance';
  return decision.about === 'third_party' ? 'third_party' : undefined;
}

/** Told of each gate decision (crisis-gate-signal.ts, late-words.ts); returns at once, never throws. */
export function quietAfterCrisis(session: unknown, decision: QuietDecision): void {
  const level = quietLevelOf(decision);
  if (!level) return;
  const selfHarm = isSelfHarm(decision?.kind?.crisisType);
  const run = (): void => {
    try {
      startQuiet(session, level, selfHarm);
    } catch {
      log.error({ level }, 'Crisis quiet window failed, not stored');
    }
  };
  try {
    setImmediate(run);
  } catch {
    log.error({ level }, 'Crisis quiet window not scheduled, not stored');
  }
}

function startQuiet(session: unknown, level: QuietLevel, selfHarm: boolean): void {
  const mode = flagModeOf('CRISIS_QUIET_FROM_GATE');
  if (mode === 'off') return;
  const { userId, sessionId } = idsOf(session);
  const at = { sessionId, level };
  if (!userId || isSharedPlaceholderId(userId)) {
    return log.info(at, 'Crisis quiet window skipped: no caller id');
  }
  const key = sessionId && `${sessionId}|${level}`;
  if (key && started.has(key)) return;
  if (key) started.add(key);
  if (started.size > MAX_CALLS) started.delete(started.values().next().value!);
  // No crisis record: a held caller keeps nothing personal, and a third party's crisis isn't theirs
  const timeOnly = level === 'third_party' || careHeld(userId, sessionId);
  if (mode === 'shadow') return log.info({ ...at, timeOnly }, 'Crisis quiet window (shadow)');

  const until = Date.now() + CRISIS_QUIET_DAYS * DAY_MS;
  holdQuietHere(userId, until); // fail closed in this process until a write is stored
  const userData = (session as { userData?: unknown } | null | undefined)?.userData;
  const turn = typeof userData === 'object' && userData ? callerTurnOf(userData) : undefined;
  const write = timeOnly
    ? async (): Promise<boolean> => {
        await recordQuietHold(userId, until);
        return true;
      }
    : async (): Promise<boolean> => {
        const { logCrisisSignal } = await import('../../services/human-transfer/index.js');
        const signals = gateCrisisSignals(level === 'script' ? 'script' : 'guidance', selfHarm);
        return logCrisisSignal(userId, signals, undefined, sessionId, turn);
      };
  void store(write, () => releaseQuietHere(userId), { ...at, timeOnly }, 0);
}

async function store(
  write: () => Promise<boolean>,
  release: () => void,
  at: { sessionId?: string; level: QuietLevel; timeOnly: boolean },
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
  const retry = setTimeout(() => void store(write, release, at, attempt + 1), wait);
  retry.unref?.();
}

/** For tests. */
export function resetQuietAfterCrisis(): void {
  started.clear();
}
