/**
 * Whose call a queued line belongs to. The speech coordinator is one per process and a new
 * session can attach while lines are still queued (a hand-off, a reconnect), so a line queued for
 * one call must not be spoken on another.
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { SpeechRequest } from './speech-coordinator.js';

const log = createLogger({ module: 'queued-line-owner' });

/**
 * The queued lines that may be spoken on session `sessionId`: the ones queued for that same id
 * (a hand-off keeps its call's lines) and the ones queued before the coordinator knew an id
 * (owner unknown, as before). The rest are dropped and counted in the log, never their text.
 */
export function linesQueuedFor(
  queue: SpeechRequest[],
  sessionId: string | undefined
): SpeechRequest[] {
  const kept = queue.filter((line) => line.sessionId === undefined || line.sessionId === sessionId);
  if (kept.length < queue.length) {
    log.warn({ dropped: queue.length - kept.length }, 'Dropped lines queued for another session');
  }
  return kept;
}
