/**
 * Turn Persistence (with bounded retry)
 *
 * Writes one conversation turn to `bogle_users/{uid}/conversations/{cid}/turns`
 * and retries a failed write a few times with backoff. The turn document id is
 * derived from the turn number, so a retry after an ambiguous failure
 * overwrites rather than duplicates.
 *
 * Runs in the background: the voice path never awaits it. A turn that still
 * fails after the last attempt is counted (memory-capture metrics) and
 * reported to the Firestore fallback monitor; the turn remains in the session's
 * in-memory history and reaches the session-end summary from there.
 *
 * @module services/memory/turn-persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { recordFallback } from '../observability/firestore-monitor.js';
import {
  recordTurnWriteAttempt,
  recordTurnWriteResult,
  recordTurnWriteRetry,
} from './memory-capture-metrics.js';
import type { ConversationTurn } from './realtime-memory.js';

const log = createLogger({ module: 'turn-persistence' });

/** Delays before attempts 2..n (attempt 1 is immediate). */
export const TURN_WRITE_RETRY_DELAYS_MS: readonly number[] = [250, 1_000, 3_000];

export type PersistTurnFn = (
  userId: string,
  conversationId: string,
  turn: ConversationTurn
) => Promise<boolean>;

export interface PersistTurnWithRetryOptions {
  /** Override the writer (tests). Defaults to realtime-memory's persistTurn. */
  persist?: PersistTurnFn;
  /** Override the backoff schedule (tests). */
  retryDelaysMs?: readonly number[];
  /** Override sleeping (tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Persist a turn, retrying on failure. Never throws; resolves `true` when the
 * turn was written.
 */
export async function persistTurnWithRetry(
  userId: string,
  conversationId: string,
  turn: ConversationTurn,
  options: PersistTurnWithRetryOptions = {}
): Promise<boolean> {
  const persist =
    options.persist ?? (await import('./realtime-memory.js')).persistTurn;
  const delays = options.retryDelaysMs ?? TURN_WRITE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;

  recordTurnWriteAttempt(turn.role);
  let lastError = 'write returned false';

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      recordTurnWriteRetry(turn.role);
      await sleep(delays[attempt - 1] ?? 0);
    }
    try {
      if (await persist(userId, conversationId, turn)) {
        recordTurnWriteResult(turn.role, true);
        if (attempt > 0) {
          log.info(
            { conversationId, role: turn.role, turnNumber: turn.turnNumber, attempt: attempt + 1 },
            'Turn written after retry'
          );
        }
        return true;
      }
    } catch (error) {
      lastError = String(error);
    }
  }

  recordTurnWriteResult(turn.role, false, lastError);
  recordFallback('realtime-memory', `Turn write failed after ${delays.length + 1} attempts`);
  log.error(
    {
      userId,
      conversationId,
      role: turn.role,
      turnNumber: turn.turnNumber,
      attempts: delays.length + 1,
      error: lastError,
    },
    '🧠 [MEMORY-AUDIT] Turn NOT persisted after retries (kept in session memory only)'
  );
  return false;
}
