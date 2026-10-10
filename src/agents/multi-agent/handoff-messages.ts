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
