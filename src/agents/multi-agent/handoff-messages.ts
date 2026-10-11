/**
 * What a multi-agent call (the production path) tells the app when a handoff starts.
 *
 * The app's "Bringing in Maya…" indicator is driven by handoff_progress, which only the
 * single-agent coordinator sent, so on live calls it never showed however long a handoff
 * took. One progress message right after handoff_started is enough: the app shows the
 * indicator once the handoff has run 700ms and clears it on complete, failed or the
 * timeout. It is sent before the handoff runs, never during it, so on the ordered data
 * channel it can't arrive after handoff_complete and bring the indicator back.
 */
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';

export function handoffStartMessages(
  target: string,
  previousAgent: string | null | undefined
): Record<string, unknown>[] {
  const timestamp = Date.now();
  return [
    { type: 'handoff_started', target, newAgent: target, previousAgent, timestamp },
    {
      type: 'handoff_progress',
      target,
      elapsedMs: 0,
      timeoutMs: HANDOFF_TIMING.HANDOFF_TIMEOUT_MS,
      timestamp,
    },
  ];
}

/** What handleHandoffFromDataChannel says about a handoff that didn't happen. */
export interface HandoffRefusal {
  error?: string;
  /** The teammate isn't unlocked for this caller: the error is a warm decline to pass on. */
  declined?: boolean;
}

/**
 * The handoff_failed message for a refused tap, and what the agent says about it.
 *
 * A tap on a locked teammate was refused with a warm decline that went only into
 * handoff_failed.error, which the app read out to screen readers and nowhere else; the
 * agent said nothing. On dev 2026-10-11 the owner tapped Nayan and Jordan and nothing
 * visible or audible happened. A decline now goes to the caller twice: as userMessage,
 * which the app shows, and as the line the agent speaks. Other failures (a handoff
 * already running, "Already with ferni") stay technical and are neither shown nor said.
 */
export function handoffFailedMessage(
  target: string,
  refusal: HandoffRefusal,
  rollbackTo: string | null | undefined
): { message: Record<string, unknown>; say?: string } {
  const decline = refusal.declined && refusal.error ? refusal.error : undefined;
  return {
    message: {
      type: 'handoff_failed',
      target,
      error: refusal.error,
      ...(decline ? { userMessage: decline } : {}),
      rollbackTo,
      timestamp: Date.now(),
    },
    ...(decline ? { say: decline } : {}),
  };
}
